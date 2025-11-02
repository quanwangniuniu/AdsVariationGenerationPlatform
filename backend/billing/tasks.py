"""Celery tasks for billing operations and Stripe event handling."""
from __future__ import annotations

import hashlib
import json
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone as dt_timezone
from decimal import Decimal
from typing import Any, Dict, Optional

from celery import shared_task
from django.db import IntegrityError, transaction
from django.utils import timezone

from billing.models import (
    BillingAuditLog,
    BillingEventDeadLetter,
    PlanChangeRequest,
    UserBillingProfile,
    WebhookEventLog,
    WorkspaceSubscription,
)
from billing.services.credit_ledger import reconcile_balance
from billing.services.stripe_payments import (
    StripeServiceError,
    pay_invoice,
    retrieve_customer,
    retrieve_invoice,
    retrieve_subscription,
)
from billing.services import payments as payment_services
from billing.services.subscription_lifecycle import (
    SubscriptionLifecycleError,
    execute_scheduled_change,
)
from billing.services.token_ledger import (
    IdempotencyConflict,
    InsufficientTokenBalance,
)
from billing.tasks_webhooks import (
    HandlerResult,
    WebhookProcessingError,
    _append_note,
    _coerce_timestamp,
    dispatch_event,
)
from workspace.models import Workspace

logger = logging.getLogger(__name__)

AUTO_RENEW_LOOKAHEAD_MINUTES = 10
AUTO_RENEW_RETRY_DELAY_MINUTES = 15


@shared_task
def process_pending_plan_changes() -> Dict[str, int]:
    """Apply delayed workspace plan changes whose effective date has passed."""

    now = timezone.now()

    pending_requests = (
        PlanChangeRequest.objects.select_related("subscription", "subscription__workspace", "to_plan")
        .filter(status="pending", effective_timing="end_of_period", effective_date__lte=now)
        .order_by("effective_date")
    )

    stats = {"processed": 0, "failed": 0, "total": pending_requests.count()}

    for request in pending_requests:
        try:
            # Revalidate ordering with auto-renew: if the subscription has already been
            # renewed around/after the effective date, skip this downgrade to honor
            # the "renew-first" business rule.
            with transaction.atomic():
                locked_change = (
                    PlanChangeRequest.objects.select_for_update()
                    .select_related("subscription", "subscription__workspace")
                    .get(pk=request.pk)
                )
                subscription = locked_change.subscription

                renewed_after_effective = False
                if subscription and locked_change.effective_date:
                    # Renewal considered successful if last_renewal_status is SUCCESS and
                    # the attempt time is on/after the effective date (same window).
                    last_status = subscription.last_renewal_status
                    last_attempt = subscription.last_renewal_attempt_at or datetime.min.replace(
                        tzinfo=dt_timezone.utc
                    )
                    renewed_after_effective = (
                        last_status == WorkspaceSubscription.RenewalStatus.SUCCESS
                        and last_attempt >= locked_change.effective_date
                    )

                # Also consider the period was advanced past effective_date (Stripe webhook path).
                if not renewed_after_effective and subscription and locked_change.effective_date and subscription.current_period_start and subscription.current_period_start > locked_change.effective_date:
                    renewed_after_effective = True

                if renewed_after_effective:
                    locked_change.status = "canceled"
                    locked_change.admin_notes = _append_note(locked_change.admin_notes, "SKIPPED_BY_RENEWAL")
                    locked_change.processed_at = timezone.now()
                    locked_change.save(update_fields=["status", "admin_notes", "processed_at"])

                    BillingAuditLog.objects.create(
                        workspace_id=subscription.workspace_id,
                        event_type="billing.subscription.plan_change_skipped",
                        stripe_id=subscription.stripe_subscription_id or "",
                        actor="celery.process_pending_plan_changes",
                        details={
                            "reason": "SKIPPED_BY_RENEWAL",
                            "effective_date": locked_change.effective_date.isoformat() if locked_change.effective_date else None,
                        },
                    )
                    stats["processed"] += 1
                    continue

            execute_scheduled_change(
                plan_change=request,
                actor="celery.process_pending_plan_changes",
            )
            stats["processed"] += 1
        except SubscriptionLifecycleError as exc:
            stats["failed"] += 1
            request.status = "failed"
            request.admin_notes = _append_note(request.admin_notes, str(exc))
            request.processed_at = timezone.now()
            request.save(update_fields=["status", "admin_notes", "processed_at"])
            logger.warning("Failed to process plan change request %s: %s", request.id, exc)

    return stats



@shared_task(bind=True, queue="billing", autoretry_for=(IntegrityError,), retry_backoff=True, max_retries=5)
def process_stripe_event_async(self, event_data: Dict[str, Any]) -> Dict[str, Any]:
    """Process a Stripe webhook event, ensuring idempotency and logging."""

    event_id = event_data.get("id")
    event_type = event_data.get("type")

    payload_hash = _hash_event_payload(event_data)

    log_entry, already_processed = _reserve_event_log(event_id, event_type, payload_hash)
    if already_processed:
        logger.info(
            "Skipping Stripe event %s (%s); status=%s",
            event_id,
            event_type,
            log_entry.status if log_entry else "unknown",
        )
        return {"status": "skipped"}

    received_at = timezone.now()

    try:
        with transaction.atomic():
            result = dispatch_event(
                event_id=event_id or "",
                event_type=event_type or "",
                payload=event_data,
                received_at=received_at,
            )

    except WebhookProcessingError as exc:
        logger.warning("Webhook processing error for event %s: %s", event_id, exc)
        _mark_event_failed(log_entry, str(exc), retryable=False)
        return {"status": "failed", "detail": str(exc)}
    except IdempotencyConflict as exc:
        logger.warning("Idempotency conflict for event %s: %s", event_id, exc)
        _mark_event_failed(log_entry, str(exc), retryable=False)
        return {"status": "failed", "detail": str(exc)}
    except InsufficientTokenBalance as exc:
        logger.error("Insufficient balance during webhook handling for event %s: %s", event_id, exc)
        _mark_event_failed(log_entry, str(exc), retryable=False)
        return {"status": "failed", "detail": str(exc)}
    except Exception as exc:  # pragma: no cover - defensive retry
        logger.exception("Unexpected error processing Stripe event %s", event_id)
        _mark_event_failed(log_entry, str(exc), retryable=True)
        raise self.retry(exc=exc)

    if result.status == HandlerResult.DEAD_LETTER:
        _record_dead_letter(
            event_id=event_id,
            event_type=event_type,
            detail=result.detail,
            reason=result.dead_letter_reason,
            payload=result.dead_letter_payload or event_data,
            workspace_id=result.workspace_id,
        )
        _mark_event_failed(log_entry, result.detail or "dead_letter", retryable=False, handled=False)
        logger.warning(
            "Dead-lettered Stripe event %s (%s): %s",
            event_id,
            event_type,
            result.detail,
        )
        return {"status": HandlerResult.DEAD_LETTER, "detail": result.detail}

    status = WebhookEventLog.Status.PROCESSED if result.status == HandlerResult.PROCESSED else WebhookEventLog.Status.IGNORED
    _mark_event_completed(
        log_entry,
        status,
        workspace_id=result.workspace_id,
        idempotency_key=result.idempotency_key or (event_id or ""),
    )

    logger.info(
        "Processed Stripe event %s (%s): %s",
        event_id,
        event_type,
        result.detail or result.status,
    )

    return {"status": result.status, "detail": result.detail}


def _apply_subscription_timestamps_from_payload(subscription: WorkspaceSubscription, payload: Dict[str, Any]) -> set[str]:
    """Update subscription period fields from a Stripe subscription payload."""

    updates: set[str] = set()

    start = _coerce_timestamp(payload.get("current_period_start"))
    if start and subscription.current_period_start != start:
        subscription.current_period_start = start
        updates.add("current_period_start")

    end = _coerce_timestamp(payload.get("current_period_end"))
    if end and subscription.current_period_end != end:
        subscription.current_period_end = end
        updates.add("current_period_end")

    status = payload.get("status")
    if status and subscription.status != status:
        subscription.status = status
        updates.add("status")

    return updates


def _mask_identifier(identifier: Optional[str]) -> str:
    if not identifier:
        return "unknown"
    text = str(identifier)
    if len(text) <= 4:
        return text
    return f"...{text[-4:]}"


@shared_task(bind=True, queue="billing", autoretry_for=(StripeServiceError,), retry_backoff=True, max_retries=3)
def process_subscription_auto_renewals(self, lookahead_minutes: Optional[int] = None) -> Dict[str, int]:
    """Attempt to renew expiring workspace subscriptions and record outcomes."""

    window_minutes = lookahead_minutes or AUTO_RENEW_LOOKAHEAD_MINUTES
    now = timezone.now()
    window_end = now + timedelta(minutes=window_minutes)
    retry_threshold = now - timedelta(minutes=AUTO_RENEW_RETRY_DELAY_MINUTES)

    subscription_ids = list(
        WorkspaceSubscription.objects.filter(
            auto_renew_enabled=True,
            current_period_end__isnull=False,
            current_period_end__lte=window_end,
        ).values_list("pk", flat=True)
    )

    stats = {"processed": 0, "skipped": 0, "failed": 0}

    for subscription_id in subscription_ids:
        with transaction.atomic():
            locked_qs = (
                WorkspaceSubscription.objects.select_for_update(skip_locked=True)
                .select_related("workspace", "plan")
                .filter(pk=subscription_id)
            )
            subscription = locked_qs.first()
            if subscription is None:
                continue

            attempt_time = timezone.now()

            if subscription.status == "canceled":
                stats["skipped"] += 1
                continue

            if subscription.last_renewal_attempt_at and subscription.last_renewal_attempt_at > retry_threshold:
                stats["skipped"] += 1
                continue

            if not subscription.stripe_subscription_id:
                subscription.auto_renew_enabled = False
                subscription.save(update_fields=["auto_renew_enabled"])
                _record_auto_renew_failure(
                    subscription,
                    attempt_time,
                    detail="Missing Stripe subscription ID",
                    status=WorkspaceSubscription.RenewalStatus.FAILED,
                )
                stats["failed"] += 1
                continue

            try:
                subscription_payload = retrieve_subscription(
                    subscription.stripe_subscription_id,
                    expand=["latest_invoice", "customer"],
                )
            except StripeServiceError as exc:
                _record_auto_renew_failure(
                    subscription,
                    attempt_time,
                    detail=f"Stripe subscription retrieval failed: {exc}",
                    status=WorkspaceSubscription.RenewalStatus.RETRY,
                )
                logger.warning(
                    "Stripe error retrieving subscription %s: %s",
                    _mask_identifier(subscription.stripe_subscription_id),
                    exc,
                )
                raise self.retry(exc=exc)

            default_pm = _resolve_default_payment_method(subscription_payload)
            if default_pm is None:
                customer_value = subscription_payload.get("customer")
                if isinstance(customer_value, str):
                    try:
                        customer_payload = retrieve_customer(customer_value)
                    except StripeServiceError as exc:
                        _record_auto_renew_failure(
                            subscription,
                            attempt_time,
                            detail=f"Stripe customer retrieval failed: {exc}",
                            status=WorkspaceSubscription.RenewalStatus.RETRY,
                        )
                        logger.warning(
                            "Stripe error retrieving customer %s: %s",
                            _mask_identifier(customer_value),
                            exc,
                        )
                        raise self.retry(exc=exc)
                    subscription_payload["customer"] = customer_payload
                    default_pm = _resolve_default_payment_method(subscription_payload)

            if default_pm is None:
                subscription.auto_renew_enabled = False
                subscription.save(update_fields=["auto_renew_enabled"])
                _record_auto_renew_failure(
                    subscription,
                    attempt_time,
                    detail="Default payment method missing; auto-renew disabled.",
                    status=WorkspaceSubscription.RenewalStatus.FAILED,
                )
                stats["failed"] += 1
                continue

            invoice_payload = subscription_payload.get("latest_invoice")
            invoice_id: Optional[str] = None
            invoice_status: Optional[str] = None

            if isinstance(invoice_payload, dict):
                invoice_status = invoice_payload.get("status")
                invoice_id = invoice_payload.get("id")
            elif isinstance(invoice_payload, str):
                invoice_id = invoice_payload

            if invoice_id and (invoice_status is None or invoice_status == "unknown"):
                try:
                    invoice_payload = retrieve_invoice(invoice_id)
                    invoice_status = invoice_payload.get("status")
                except StripeServiceError as exc:
                    _record_auto_renew_failure(
                        subscription,
                        attempt_time,
                        detail=f"Stripe invoice retrieval failed: {exc}",
                        status=WorkspaceSubscription.RenewalStatus.RETRY,
                    )
                    logger.warning(
                        "Stripe error retrieving invoice %s: %s",
                        _mask_identifier(invoice_id),
                        exc,
                    )
                    raise self.retry(exc=exc)

            if invoice_id and invoice_status not in {"paid", "void", "uncollectible"}:
                try:
                    invoice_payload = pay_invoice(invoice_id)
                    invoice_status = invoice_payload.get("status")
                except StripeServiceError as exc:
                    _record_auto_renew_failure(
                        subscription,
                        attempt_time,
                        detail=f"Stripe invoice pay failed: {exc}",
                        status=WorkspaceSubscription.RenewalStatus.RETRY,
                    )
                    logger.warning(
                        "Stripe error paying invoice %s: %s",
                        _mask_identifier(invoice_id),
                        exc,
                    )
                    raise self.retry(exc=exc)

            owner_user = getattr(subscription, "billing_owner", None)

            if invoice_status == "paid" and isinstance(invoice_payload, dict):
                payment_services.process_invoice_paid_event(invoice_payload, initiator=owner_user)
            if invoice_status == "paid":
                updates = _apply_subscription_timestamps_from_payload(subscription, subscription_payload)
                updates.update(
                    {
                        "renewal_attempt_count",
                        "last_renewal_status",
                        "last_renewal_attempt_at",
                        "notes",
                    }
                )

                subscription.renewal_attempt_count = 0
                subscription.last_renewal_status = WorkspaceSubscription.RenewalStatus.SUCCESS
                subscription.last_renewal_attempt_at = attempt_time
                subscription.notes = _append_note(
                    subscription.notes,
                    f"Auto-renew succeeded at {attempt_time.isoformat(timespec='seconds')}",
                )

                if subscription.status != "active":
                    subscription.status = "active"
                    updates.add("status")

                subscription.save(update_fields=list(updates))
                stats["processed"] += 1
                continue

            if not invoice_id:
                subscription.last_renewal_status = WorkspaceSubscription.RenewalStatus.RETRY
                subscription.last_renewal_attempt_at = attempt_time
                subscription.notes = _append_note(
                    subscription.notes,
                    "Auto-renew pending: invoice not yet generated.",
                )
                subscription.save(update_fields=["last_renewal_status", "last_renewal_attempt_at", "notes"])
                stats["skipped"] += 1
                continue

            if isinstance(invoice_payload, dict):
                payment_services.process_invoice_payment_failed_event(invoice_payload, initiator=owner_user)

            failure_detail = f"Invoice {_mask_identifier(invoice_id)} status {invoice_status}"
            _record_auto_renew_failure(
                subscription,
                attempt_time,
                detail=failure_detail,
                status=WorkspaceSubscription.RenewalStatus.FAILED,
            )
            stats["failed"] += 1

    return stats



def _record_auto_renew_failure(
    subscription: WorkspaceSubscription,
    attempt_time: datetime,
    *,
    detail: str,
    status: WorkspaceSubscription.RenewalStatus,
) -> None:
    subscription.renewal_attempt_count = (subscription.renewal_attempt_count or 0) + 1
    subscription.last_renewal_status = status
    subscription.last_renewal_attempt_at = attempt_time
    subscription.notes = _append_note(subscription.notes, f"Auto-renew issue: {detail}")
    subscription.save(
        update_fields=[
            "renewal_attempt_count",
            "last_renewal_status",
            "last_renewal_attempt_at",
            "notes",
        ]
    )

    BillingAuditLog.objects.create(
        workspace_id=subscription.workspace_id,
        event_type="billing.subscription.auto_renew_failure",
        stripe_id=subscription.stripe_subscription_id or "",
        actor="celery.auto_renew",
        details={"detail": detail},
    )

    _notify_billing_contact(subscription, detail)



@shared_task(queue="billing")
def sync_stripe_credit_balances() -> Dict[str, int]:
    """Reconcile stored credit balances with Stripe customer balances."""

    stats = {"processed": 0, "updated": 0, "missing": 0, "failed": 0}

    profiles = UserBillingProfile.objects.select_related("user").filter(stripe_customer_id__isnull=False)

    for profile in profiles.iterator():
        customer_id = profile.stripe_customer_id
        if not customer_id:
            stats["missing"] += 1
            continue

        try:
            customer_payload = retrieve_customer(customer_id)
        except StripeServiceError as exc:
            stats["failed"] += 1
            logger.warning(
                "Failed to retrieve Stripe customer %s: %s",
                _mask_identifier(customer_id),
                exc,
            )
            continue

        stripe_balance = customer_payload.get("balance")
        if stripe_balance is None:
            stats["missing"] += 1
            continue

        result = reconcile_balance(
            profile=profile,
            stripe_balance_minor=stripe_balance,
        )

        stats["processed"] += 1
        if result.created:
            stats["updated"] += 1
            if abs(result.delta) >= Decimal("1"):
                logger.info(
                    "Reconciled credit drift for user %s: delta=%s",
                    profile.user_id,
                    result.delta,
                )

    return stats



def _notify_billing_contact(subscription: WorkspaceSubscription, message: str) -> None:
    contact = getattr(subscription.workspace, "billing_contact", None)
    logger.info(
        "Notify billing contact %s for workspace %s: %s",
        contact or "unknown",
        subscription.workspace_id,
        message,
    )


def _resolve_default_payment_method(payload: Dict[str, Any]) -> Optional[str]:
    default_pm = payload.get("default_payment_method")
    if isinstance(default_pm, dict):
        return default_pm.get("id")
    if isinstance(default_pm, str):
        return default_pm

    customer_obj = payload.get("customer")
    if isinstance(customer_obj, dict):
        invoice_settings = customer_obj.get("invoice_settings") or {}
        pm = invoice_settings.get("default_payment_method")
        if isinstance(pm, dict):
            return pm.get("id")
        if isinstance(pm, str):
            return pm
    return None


def _reserve_event_log(event_id: Optional[str], event_type: Optional[str], payload_hash: str):
    if not event_id:
        return None, False

    with transaction.atomic():
        log_entry = WebhookEventLog.objects.select_for_update().filter(event_id=event_id).first()
        if log_entry:
            if log_entry.handled:
                return log_entry, True

            log_entry.event_type = event_type or log_entry.event_type
            log_entry.status = WebhookEventLog.Status.PROCESSING
            log_entry.last_error = ""
            log_entry.processed_at = None
            if payload_hash:
                log_entry.payload_hash = payload_hash
            if not log_entry.idempotency_key:
                log_entry.idempotency_key = event_id
            log_entry.handled = False
            log_entry.save(
                update_fields=[
                    "event_type",
                    "status",
                    "last_error",
                    "processed_at",
                    "payload_hash",
                    "idempotency_key",
                    "handled",
                ]
            )
            return log_entry, False

        log_entry = WebhookEventLog.objects.create(
            event_id=event_id,
            event_type=event_type or "",
            status=WebhookEventLog.Status.PROCESSING,
            payload_hash=payload_hash or "",
            idempotency_key=event_id,
        )
        return log_entry, False


def _mark_event_completed(
    log_entry: Optional[WebhookEventLog],
    status: str,
    *,
    workspace_id: Optional[int] = None,
    idempotency_key: Optional[str] = None,
) -> None:
    if not log_entry:
        return

    log_entry.status = status
    log_entry.processed_at = timezone.now()
    log_entry.last_error = ""
    log_entry.handled = True
    updates = ["status", "processed_at", "last_error", "handled"]

    if workspace_id and log_entry.workspace_id != workspace_id:
        log_entry.workspace_id = workspace_id
        updates.append("workspace")

    if idempotency_key and log_entry.idempotency_key != idempotency_key:
        log_entry.idempotency_key = idempotency_key
        updates.append("idempotency_key")

    log_entry.save(update_fields=updates)


def _mark_event_failed(
    log_entry: Optional[WebhookEventLog],
    error: str,
    *,
    retryable: bool,
    handled: bool = False,
) -> None:
    if not log_entry:
        return

    log_entry.status = WebhookEventLog.Status.FAILED
    log_entry.last_error = error
    log_entry.processed_at = None
    log_entry.handled = handled
    log_entry.save(update_fields=["status", "last_error", "processed_at", "handled"])


def _record_dead_letter(
    *,
    event_id: Optional[str],
    event_type: Optional[str],
    detail: Optional[str],
    reason: Optional[str],
    payload: Dict[str, Any],
    workspace_id: Optional[int],
) -> None:
    identifier = event_id or f"anon:{uuid.uuid4()}"
    defaults = {
        "event_type": event_type or "",
        "payload": payload,
        "failure_reason": reason or detail or "unknown",
        "workspace_id": workspace_id,
        "last_attempt_at": timezone.now(),
    }
    dead_letter, created = BillingEventDeadLetter.objects.get_or_create(
        event_id=identifier,
        defaults=defaults,
    )

    if not created:
        dead_letter.payload = payload
        dead_letter.failure_reason = defaults["failure_reason"]
        dead_letter.last_attempt_at = defaults["last_attempt_at"]
        if workspace_id and dead_letter.workspace_id != workspace_id:
            dead_letter.workspace_id = workspace_id
        dead_letter.retry_count = (dead_letter.retry_count or 0) + 1
        dead_letter.save(update_fields=["payload", "failure_reason", "last_attempt_at", "workspace", "retry_count"])


def _hash_event_payload(event_data: Dict[str, Any]) -> str:
    try:
        serialized = json.dumps(event_data, sort_keys=True, separators=(",", ":"))
    except TypeError:
        serialized = json.dumps(event_data, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


@shared_task(queue="billing")
def cleanup_webhook_event_logs(days: int = 7) -> int:
    """Remove processed webhook events older than ``days`` days."""

    cutoff = timezone.now() - timedelta(days=days)
    deleted, _ = WebhookEventLog.objects.filter(
        status=WebhookEventLog.Status.PROCESSED,
        handled=True,
        processed_at__lt=cutoff,
    ).delete()

    logger.info("Cleaned up %s processed webhook events older than %s days.", deleted, days)
    return deleted
