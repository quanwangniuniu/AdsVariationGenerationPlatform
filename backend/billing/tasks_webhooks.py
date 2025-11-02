"""Stripe webhook handler implementations and helpers."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, Optional, Tuple

import stripe
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from billing.models import (
    BillingAuditLog,
    BillingTransaction,
    InvoiceRecord,
    PaymentRecord,
    PlanChangeRequest,
    TokenAccount,
    WorkspacePlan,
    WorkspaceSubscription,
)
from billing.services.credit_ledger import CreditAccountNotFound, apply_stripe_balance_delta
from billing.services.subscription_lifecycle import assign_billing_owner, apply_local_plan_change
from billing.services.subscription_toggle import has_manual_auto_renew_flag
from billing.constants import MANUAL_AUTORENEW_DISABLED_FLAG
from billing.services import payments as payment_services
from billing.services.stripe_payments import (
    StripeConfigurationError,
    StripeServiceError,
    _configure_stripe,
    retrieve_subscription,
)
from billing.services.token_ledger import credit
from workspace.models import Workspace

logger = logging.getLogger(__name__)

User = get_user_model()

ZERO_DECIMAL_CURRENCIES: set[str] = {
    "bif",
    "clp",
    "djf",
    "gnf",
    "jpy",
    "kmf",
    "krw",
    "mga",
    "pyg",
    "rwf",
    "ugx",
    "vnd",
    "vuv",
    "xaf",
    "xof",
    "xpf",
}


def _extract_invoice_period(invoice: Dict[str, Any]) -> Tuple[Optional[datetime], Optional[datetime]]:
    """Derive coverage window for an invoice from its line items."""

    period_start = _coerce_timestamp(invoice.get("period_start"))
    period_end = _coerce_timestamp(invoice.get("period_end"))

    lines = (invoice.get("lines") or {}).get("data") or []
    if isinstance(lines, list):
        for line in lines:
            if not isinstance(line, dict):
                continue
            line_period = line.get("period") or {}
            line_start = _coerce_timestamp(line_period.get("start"))
            line_end = _coerce_timestamp(line_period.get("end"))

            if line_start and (period_start is None or line_start < period_start):
                period_start = line_start
            if line_end and (period_end is None or line_end > period_end):
                period_end = line_end

    return period_start, period_end


def _convert_minor_amount(value: Any, currency: str) -> Decimal:
    if value in (None, "", [], {}):
        return Decimal("0.00")
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0.00")
    divisor = Decimal("1") if currency and currency.lower() in ZERO_DECIMAL_CURRENCIES else Decimal("100")
    return (amount / divisor).quantize(Decimal("0.01"))


def _stripe_obj_to_dict(obj: Any) -> Optional[Dict[str, Any]]:
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj
    to_dict = getattr(obj, "to_dict_recursive", None)
    if callable(to_dict):
        return to_dict()
    return None


def _fetch_stripe_invoice_and_payment(
    *,
    invoice_id: Optional[str],
    payment_intent_id: Optional[str],
) -> tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    try:
        _configure_stripe()
    except StripeConfigurationError:
        logger.warning("Stripe configuration missing while fetching token checkout invoice.")
        return None, None

    stripe_invoice: Optional[Dict[str, Any]] = None
    stripe_payment_intent: Optional[Dict[str, Any]] = None

    try:
        if payment_intent_id:
            intent_obj = stripe.PaymentIntent.retrieve(
                payment_intent_id,
                expand=["latest_invoice", "invoice", "charges"],
            )
            stripe_payment_intent = _stripe_obj_to_dict(intent_obj)
            if stripe_payment_intent:
                invoice_ref = (
                    stripe_payment_intent.get("latest_invoice")
                    or stripe_payment_intent.get("invoice")
                )
                stripe_invoice = _stripe_obj_to_dict(invoice_ref) or stripe_invoice

                if not stripe_invoice:
                    invoice_id = invoice_ref if isinstance(invoice_ref, str) else invoice_id

        if invoice_id and not stripe_invoice:
            invoice_obj = stripe.Invoice.retrieve(invoice_id)
            stripe_invoice = _stripe_obj_to_dict(invoice_obj)
    except stripe.error.StripeError as exc:
        logger.warning("Unable to retrieve Stripe invoice/payment intent: %s", exc, exc_info=True)

    return stripe_invoice, stripe_payment_intent


class WebhookProcessingError(Exception):
    """Raised when a webhook cannot be processed successfully."""


@dataclass(frozen=True)
class HandlerResult:
    """Outcome of a webhook handler invocation."""

    status: str
    detail: str = ""
    workspace_id: Optional[int] = None
    idempotency_key: Optional[str] = None
    dead_letter_reason: Optional[str] = None
    dead_letter_payload: Optional[Dict[str, Any]] = None

    PROCESSED = "processed"
    IGNORED = "ignored"
    DEAD_LETTER = "dead_letter"
    ALREADY_PROCESSED = "already_processed"
    ERROR = "error"


def _resolve_user(user_id: Optional[str]) -> Optional[User]:
    if not user_id:
        return None
    try:
        return User.objects.get(pk=user_id)
    except (User.DoesNotExist, ValueError, TypeError):
        return None


def dispatch_event(*, event_id: str, event_type: str, payload: Dict[str, Any], received_at: datetime) -> HandlerResult:
    """Route a Stripe webhook event to its dedicated handler."""

    handler = {
        "checkout.session.completed": _handle_checkout_session_completed,
        "invoice.paid": _handle_invoice_paid,
        "invoice.payment_succeeded": _handle_invoice_paid,
        "invoice.payment_failed": _handle_invoice_payment_failed,
        "invoice.created": _handle_invoice_created,
        "customer.balance.updated": _handle_customer_balance_updated,
        "customer.subscription.deleted": _handle_subscription_deleted,
    }.get(event_type)

    if handler is None:
        logger.info("Ignoring unsupported Stripe event type '%s'.", event_type)
        return HandlerResult(status=HandlerResult.IGNORED, detail="Unsupported event type")

    return handler(event_id=event_id, payload=payload, received_at=received_at)


def _handle_checkout_session_completed(*, event_id: str, payload: Dict[str, Any], received_at: datetime) -> HandlerResult:
    session = (payload.get("data") or {}).get("object") or {}
    metadata = session.get("metadata") or {}
    session_mode = (session.get("mode") or "").lower()
    metadata_mode = (metadata.get("mode") or "").lower()

    if session_mode == "subscription" or metadata_mode == "workspace_plan" or metadata.get("plan_key") or metadata.get("plan_id"):
        return _handle_workspace_plan_checkout(session=session, metadata=metadata)

    return _handle_token_checkout(event_id=event_id, session=session, metadata=metadata)


def _handle_token_checkout(*, event_id: str, session: Dict[str, Any], metadata: Dict[str, Any]) -> HandlerResult:
    account_id = metadata.get("token_account_id")
    if not account_id:
        raise WebhookProcessingError("Token account metadata missing from checkout session.")

    try:
        tokens_to_credit = int(metadata.get("token_quantity", 0))
    except (TypeError, ValueError):  # pragma: no cover - invalid metadata
        raise WebhookProcessingError("Invalid token quantity provided in metadata.")

    if tokens_to_credit <= 0:
        return HandlerResult(status=HandlerResult.IGNORED, detail="No tokens to credit")

    payment_intent = session.get("payment_intent") or metadata.get("payment_intent_id") or session.get("id")
    idempotency_key = payment_intent or event_id

    description = f"Stripe checkout session {session.get('id')}"

    try:
        account = TokenAccount.objects.get(pk=account_id)
    except TokenAccount.DoesNotExist as exc:
        raise WebhookProcessingError("Referenced token account does not exist.") from exc

    initiator_user = _resolve_user(metadata.get("initiator_user_id"))
    purchaser_user = _resolve_user(metadata.get("purchaser_user_id"))

    result = credit(
        token_account=account,
        amount=tokens_to_credit,
        description=description,
        idempotency_key=idempotency_key,
        stripe_payment_id=payment_intent,
    )

    workspace = getattr(account, "workspace", None)
    account_user = getattr(account, "user", None)
    resolved_initiator = initiator_user or purchaser_user or account_user
    resolved_user = account_user or purchaser_user or initiator_user

    raw_amount = session.get("amount_total")
    if raw_amount is None:
        raw_amount = session.get("amount_subtotal")

    currency_default = BillingTransaction._meta.get_field("currency").get_default()
    currency = (session.get("currency") or metadata.get("currency") or currency_default or "").lower()
    divisor = Decimal("1") if currency in ZERO_DECIMAL_CURRENCIES else Decimal("100")
    amount_value = (
        (Decimal(raw_amount) / divisor)
        if raw_amount is not None
        else Decimal("0.00")
    )

    occurred_at = _coerce_timestamp(session.get("created")) or timezone.now()
    source_reference = payment_intent or session.get("id") or idempotency_key

    def _stringify_metadata(values: Dict[str, Any]) -> Dict[str, str]:
        cleaned: Dict[str, str] = {}
        for key, value in values.items():
            if value in (None, "", []):
                continue
            cleaned[key] = str(value)
        return cleaned

    enriched_metadata: Dict[str, Any] = _stringify_metadata(metadata)
    if session.get("id"):
        enriched_metadata.setdefault("stripe_checkout_session_id", str(session["id"]))
    if payment_intent:
        enriched_metadata.setdefault("stripe_payment_intent_id", str(payment_intent))
    enriched_metadata.setdefault("token_quantity", str(tokens_to_credit))

    billing_defaults = {
        "workspace": workspace,
        "user": resolved_user,
        "initiator": resolved_initiator,
        "category": BillingTransaction.Category.TOKEN_PURCHASE,
        "direction": BillingTransaction.Direction.CREDIT,
        "status": BillingTransaction.Status.POSTED,
        "amount": amount_value,
        "currency": currency or currency_default,
        "source_reference": str(source_reference or ""),
        "description": description,
        "metadata": enriched_metadata,
        "occurred_at": occurred_at,
    }

    billing_tx, created_billing_tx = BillingTransaction.objects.get_or_create(
        token_transaction=result.transaction,
        defaults=billing_defaults,
    )

    if not created_billing_tx:
        update_map = {
            "workspace": workspace,
            "user": resolved_user,
            "initiator": resolved_initiator,
            "status": BillingTransaction.Status.POSTED,
            "amount": amount_value,
            "currency": currency or currency_default,
            "source_reference": str(source_reference or billing_tx.source_reference or ""),
            "description": description,
            "metadata": enriched_metadata,
            "occurred_at": occurred_at,
        }
        update_fields: list[str] = []
        for field, value in update_map.items():
            current = getattr(billing_tx, field)
            if field == "metadata":
                if current != value:
                    setattr(billing_tx, field, value)
                    update_fields.append(field)
                continue
            if current != value:
                setattr(billing_tx, field, value)
                update_fields.append(field)
        if update_fields:
            billing_tx.save(update_fields=update_fields + ["updated_at"])

    invoice_record = None
    payment_record = None
    stripe_invoice_id = session.get("invoice") or metadata.get("stripe_invoice_id")
    stripe_customer_id = session.get("customer") or metadata.get("stripe_customer_id")

    stripe_invoice_payload, stripe_payment_intent_payload = _fetch_stripe_invoice_and_payment(
        invoice_id=stripe_invoice_id,
        payment_intent_id=payment_intent,
    )

    if stripe_invoice_payload:
        stripe_invoice_id = stripe_invoice_payload.get("id") or stripe_invoice_id
        invoice_currency = (stripe_invoice_payload.get("currency") or currency or currency_default).lower()
        invoice_total = _convert_minor_amount(stripe_invoice_payload.get("total"), invoice_currency)
        invoice_amount_due = _convert_minor_amount(stripe_invoice_payload.get("amount_remaining"), invoice_currency)
        issued_at = _coerce_timestamp(stripe_invoice_payload.get("created")) or occurred_at
        due_at = _coerce_timestamp(stripe_invoice_payload.get("due_date"))
        status_transitions = stripe_invoice_payload.get("status_transitions") or {}
        paid_at = _coerce_timestamp(status_transitions.get("paid_at")) or occurred_at
        last_payment_attempt_at = _coerce_timestamp(status_transitions.get("finalized_at"))
        hosted_invoice_url = stripe_invoice_payload.get("hosted_invoice_url") or ""
        invoice_pdf_url = stripe_invoice_payload.get("invoice_pdf") or ""
        stripe_customer_id = stripe_invoice_payload.get("customer") or stripe_customer_id
    else:
        invoice_currency = currency or currency_default
        invoice_total = amount_value
        invoice_amount_due = Decimal("0.00")
        issued_at = occurred_at
        due_at = None
        paid_at = occurred_at
        last_payment_attempt_at = None
        hosted_invoice_url = ""
        invoice_pdf_url = ""

    stripe_charge_id = ""
    if stripe_invoice_payload:
        stripe_charge_id = stripe_invoice_payload.get("charge") or ""
    if not stripe_charge_id and stripe_payment_intent_payload:
        stripe_charge_id = stripe_payment_intent_payload.get("latest_charge") or ""
        charges = (stripe_payment_intent_payload.get("charges") or {}).get("data") or []
        if charges:
            stripe_charge_id = charges[0].get("id") or stripe_charge_id

    invoice_identifier = stripe_invoice_id or f"token_purchase:{payment_intent or session.get('id') or event_id}"
    invoice_metadata: Dict[str, Any] = {
        "source": "token_purchase",
        "token_quantity": tokens_to_credit,
        "checkout_session_id": session.get("id"),
        "payment_intent_id": payment_intent,
        "token_transaction_id": str(result.transaction.id),
    }
    if invoice_pdf_url:
        invoice_metadata["invoice_pdf_url"] = invoice_pdf_url
    if hosted_invoice_url:
        invoice_metadata["hosted_invoice_url"] = hosted_invoice_url
    if stripe_invoice_payload:
        invoice_metadata["stripe_invoice_snapshot"] = stripe_invoice_payload
    if metadata:
        invoice_metadata["checkout_metadata"] = metadata

    try:
        with transaction.atomic():
            invoice_defaults = {
                "workspace": workspace,
                "stripe_customer_id": stripe_customer_id or "",
                "initiator": resolved_initiator,
                "status": InvoiceRecord.Status.PAID,
                "total_amount": invoice_total,
                "amount_due": invoice_amount_due,
                "currency": invoice_currency,
                "hosted_invoice_url": hosted_invoice_url,
                "issued_at": issued_at,
                "due_at": due_at,
                "paid_at": paid_at,
                "last_payment_attempt_at": last_payment_attempt_at,
                "metadata": invoice_metadata,
            }
            invoice_record, created_invoice = InvoiceRecord.objects.get_or_create(
                stripe_invoice_id=invoice_identifier,
                defaults=invoice_defaults,
            )
            if not created_invoice:
                invoice_updates = {
                    "workspace": workspace,
                    "stripe_customer_id": stripe_customer_id or invoice_record.stripe_customer_id or "",
                    "initiator": resolved_initiator or invoice_record.initiator,
                    "status": InvoiceRecord.Status.PAID,
                    "total_amount": invoice_total,
                    "amount_due": invoice_amount_due,
                    "currency": invoice_currency,
                    "hosted_invoice_url": hosted_invoice_url,
                    "issued_at": issued_at,
                    "due_at": due_at,
                    "paid_at": paid_at,
                    "last_payment_attempt_at": last_payment_attempt_at,
                    "metadata": invoice_metadata,
                }
                invoice_update_fields: list[str] = []
                for field, value in invoice_updates.items():
                    current_value = getattr(invoice_record, field)
                    if current_value != value:
                        setattr(invoice_record, field, value)
                        invoice_update_fields.append(field)
                if invoice_update_fields:
                    invoice_record.save(update_fields=invoice_update_fields + ["updated_at"])

            payment_metadata: Dict[str, Any] = {
                "source": "token_purchase",
                "token_quantity": tokens_to_credit,
                "checkout_session_id": session.get("id"),
                "token_transaction_id": str(result.transaction.id),
                "stripe_invoice_id": invoice_identifier,
            }
            if stripe_payment_intent_payload:
                payment_metadata["stripe_payment_intent_snapshot"] = stripe_payment_intent_payload
            if metadata:
                payment_metadata["checkout_metadata"] = metadata

            payment_defaults = {
                "invoice": invoice_record,
                "workspace": workspace,
                "status": PaymentRecord.Status.SUCCEEDED,
                "amount": invoice_total,
                "currency": invoice_currency,
                "stripe_charge_id": stripe_charge_id or "",
                "metadata": payment_metadata,
                "initiator": resolved_initiator,
            }
            payment_identifier = payment_intent or f"token_payment:{result.transaction.id}"
            payment_record, created_payment = PaymentRecord.objects.get_or_create(
                stripe_payment_intent_id=payment_identifier,
                defaults=payment_defaults,
            )
            if not created_payment:
                payment_updates = {
                    "invoice": invoice_record,
                    "workspace": workspace,
                    "status": PaymentRecord.Status.SUCCEEDED,
                    "amount": invoice_total,
                    "currency": invoice_currency,
                    "stripe_charge_id": stripe_charge_id or payment_record.stripe_charge_id,
                    "metadata": payment_metadata,
                    "initiator": resolved_initiator or payment_record.initiator,
                }
                payment_update_fields: list[str] = []
                for field, value in payment_updates.items():
                    current_value = getattr(payment_record, field)
                    if current_value != value:
                        setattr(payment_record, field, value)
                        payment_update_fields.append(field)
                if payment_update_fields:
                    payment_record.save(update_fields=payment_update_fields + ["updated_at"])

    except Exception as exc:  # pragma: no cover - defensive logging
        logger.warning(
            "Failed to persist invoice/payment records for token checkout session %s: %s",
            session.get("id"),
            exc,
            exc_info=True,
        )

    if invoice_record:
        update_tx_fields: list[str] = []
        if billing_tx.invoice_id != invoice_record.id:
            billing_tx.invoice = invoice_record
            update_tx_fields.append("invoice")
        if payment_record and billing_tx.payment_id != payment_record.id:
            billing_tx.payment = payment_record
            update_tx_fields.append("payment")
        if update_tx_fields:
            billing_tx.save(update_fields=update_tx_fields + ["updated_at"])

    detail = "Token purchase processed"
    if not result.created:
        detail = "Token purchase already recorded"

    return HandlerResult(status=HandlerResult.PROCESSED, detail=detail, workspace_id=account.workspace_id)


def _handle_workspace_plan_checkout(*, session: Dict[str, Any], metadata: Dict[str, Any]) -> HandlerResult:
    workspace_id = metadata.get("workspace_id")
    if not workspace_id:
        raise WebhookProcessingError("Workspace metadata missing from subscription checkout session.")

    plan_change_request_id = metadata.get("plan_change_request_id")
    plan: Optional[WorkspacePlan] = None
    plan_id = metadata.get("plan_id")
    if plan_id:
        plan = WorkspacePlan.objects.filter(pk=plan_id).first()

    if plan is None:
        plan_key = metadata.get("plan_key")
        if plan_key:
            from billing.serializers import resolve_plan_name  # Lazy import to avoid circular

            plan_name = resolve_plan_name(plan_key)
            plan = WorkspacePlan.objects.filter(name__iexact=plan_name).first()

    if plan is None:
        raise WebhookProcessingError("Unable to resolve target plan for workspace checkout session.")

    try:
        workspace = Workspace.objects.select_for_update().get(pk=workspace_id)
    except Workspace.DoesNotExist as exc:
        raise WebhookProcessingError("Referenced workspace does not exist.") from exc

    subscription = (
        WorkspaceSubscription.objects.select_for_update()
        .select_related("plan", "workspace")
        .filter(workspace=workspace)
        .first()
    )

    created_subscription = False
    if subscription is None:
        subscription = WorkspaceSubscription.objects.create(
            workspace=workspace,
            plan=plan,
            status="active",
            auto_renew_enabled=True,
        )
        created_subscription = True

    apply_local_plan_change(subscription, plan)

    owner_user = _resolve_user(metadata.get("billing_owner_user_id") or metadata.get("initiator_user_id"))
    if owner_user is not None:
        assign_billing_owner(subscription, owner_user, force=True)

    updates: set[str] = set()

    stripe_subscription_id = session.get("subscription")
    if stripe_subscription_id and subscription.stripe_subscription_id != stripe_subscription_id:
        subscription.stripe_subscription_id = stripe_subscription_id
        updates.add("stripe_subscription_id")

    customer_id = session.get("customer")
    if customer_id and subscription.stripe_customer_id != customer_id:
        subscription.stripe_customer_id = customer_id
        updates.add("stripe_customer_id")

    desired_status = "active"
    if subscription.status != desired_status:
        subscription.status = desired_status
        updates.add("status")

    if (
        not subscription.auto_renew_enabled
        and not has_manual_auto_renew_flag(subscription.notes)
    ):
        subscription.auto_renew_enabled = True
        updates.add("auto_renew_enabled")

    if subscription.pending_plan_id is not None:
        subscription.pending_plan = None
        updates.add("pending_plan")

    if subscription.renewal_attempt_count != 0:
        subscription.renewal_attempt_count = 0
        updates.add("renewal_attempt_count")

    now = timezone.now()
    subscription.last_renewal_attempt_at = now
    updates.add("last_renewal_attempt_at")

    if subscription.last_renewal_status != WorkspaceSubscription.RenewalStatus.SUCCESS:
        subscription.last_renewal_status = WorkspaceSubscription.RenewalStatus.SUCCESS
        updates.add("last_renewal_status")

    notes_message = f"Checkout session {session.get('id')} activated plan {plan.name}"
    subscription.notes = _append_note(subscription.notes, notes_message)
    updates.add("notes")

    if updates:
        subscription.save(update_fields=list(updates))

    detail = "Workspace plan checkout processed"
    if created_subscription:
        detail = "Workspace subscription initialized"

    if plan_change_request_id:
        plan_change = (
            PlanChangeRequest.objects.select_for_update()
            .filter(pk=plan_change_request_id)
            .first()
        )
        if plan_change:
            plan_change.status = "completed"
            if not plan_change.processed_at:
                plan_change.processed_at = now
            if not plan_change.effective_date:
                plan_change.effective_date = now
            plan_change.save(update_fields=["status", "processed_at", "effective_date"])

    return HandlerResult(status=HandlerResult.PROCESSED, detail=detail, workspace_id=workspace.id)


def _handle_invoice_paid(*, event_id: str, payload: Dict[str, Any], received_at: datetime) -> HandlerResult:
    invoice = (payload.get("data") or {}).get("object") or {}
    metadata = payment_services.extract_invoice_metadata(invoice)
    initiator_user = _resolve_user(
        metadata.get("initiator_user_id")
        or metadata.get("billing_owner_user_id")
        or metadata.get("purchaser_user_id")
    )

    try:
        subscription = _locate_subscription(invoice, metadata)
    except WebhookProcessingError:
        return HandlerResult(
            status=HandlerResult.DEAD_LETTER,
            detail="Unable to resolve subscription for invoice payment",
            dead_letter_reason="missing_subscription",
            dead_letter_payload=invoice,
        )

    try:
        plan = _resolve_plan_from_invoice(invoice)
    except WebhookProcessingError as exc:
        return HandlerResult(
            status=HandlerResult.DEAD_LETTER,
            detail=str(exc),
            dead_letter_reason="missing_plan",
            dead_letter_payload=invoice,
            workspace_id=subscription.workspace_id,
        )

    amount_paid = invoice.get("amount_paid") or 0
    period_start, period_end = _extract_invoice_period(invoice)

    # Monotonic guard: do not regress period/windows with stale or duplicate invoice.paid
    # If the event's period_end is not advancing beyond the current subscription window,
    # skip state changes to honor idempotency and ordering.
    if subscription.current_period_end is not None and period_end is not None:
        if period_end <= subscription.current_period_end:
            BillingAuditLog.objects.create(
                workspace_id=subscription.workspace_id,
                event_type="billing.subscription.stale_invoice_event",
                stripe_id=invoice.get("id") or subscription.stripe_subscription_id or "",
                actor="stripe_webhook",
                details={
                    "detail": "stale_or_duplicate_event",
                    "event_period_end": period_end.isoformat(),
                    "current_period_end": subscription.current_period_end.isoformat(),
                },
            )
            return HandlerResult(status=HandlerResult.IGNORED, detail="stale_or_duplicate_event", workspace_id=subscription.workspace_id)

    apply_local_plan_change(subscription, plan)

    subscription_id = invoice.get("subscription") or subscription.stripe_subscription_id
    customer_id = invoice.get("customer") or subscription.stripe_customer_id

    if subscription_id and ((period_start and period_end and period_end <= period_start) or period_end is None):
        try:
            stripe_subscription = retrieve_subscription(subscription_id)
        except (StripeServiceError, StripeConfigurationError) as exc:
            logger.warning(
                "Unable to retrieve Stripe subscription %s for coverage window reconciliation: %s",
                subscription_id,
                exc,
            )
        else:
            sub_period_start = _coerce_timestamp(stripe_subscription.get("current_period_start"))
            sub_period_end = _coerce_timestamp(stripe_subscription.get("current_period_end"))
            if sub_period_start:
                period_start = sub_period_start
            if sub_period_end:
                period_end = sub_period_end

    updates = []

    if subscription.stripe_subscription_id != subscription_id:
        subscription.stripe_subscription_id = subscription_id
        updates.append("stripe_subscription_id")

    if subscription.stripe_customer_id != customer_id:
        subscription.stripe_customer_id = customer_id
        updates.append("stripe_customer_id")

    subscription.status = "active"
    updates.append("status")

    if (
        subscription.auto_renew_enabled is False
        and not has_manual_auto_renew_flag(subscription.notes)
    ):
        subscription.auto_renew_enabled = True
        updates.append("auto_renew_enabled")

    if subscription.pending_plan_id:
        subscription.pending_plan = None
        updates.append("pending_plan")

    if period_start is not None:
        subscription.current_period_start = period_start
        updates.append("current_period_start")

    if period_end is not None:
        subscription.current_period_end = period_end
        updates.append("current_period_end")

    subscription.renewal_attempt_count = 0
    updates.append("renewal_attempt_count")

    subscription.last_renewal_attempt_at = timezone.now()
    updates.append("last_renewal_attempt_at")

    subscription.last_renewal_status = WorkspaceSubscription.RenewalStatus.SUCCESS
    updates.append("last_renewal_status")

    subscription.notes = _append_note(subscription.notes, f"Invoice paid: amount={amount_paid}")
    updates.append("notes")

    if updates:
        subscription.save(update_fields=updates)
    payment_services.process_invoice_paid_event(invoice, initiator=initiator_user)

    amount_paid_major = None
    if amount_paid:
        amount_paid_major = str((Decimal(amount_paid) / Decimal("100")).quantize(Decimal("0.01")))

    event_type = payload.get("type") or "invoice.paid"

    BillingAuditLog.objects.create(
        workspace=subscription.workspace,
        event_type=event_type,
        stripe_id=invoice.get("id") or subscription.stripe_subscription_id or "",
        actor="stripe_webhook",
        details={
            "subscription_id": subscription_id,
            "invoice_id": invoice.get("id"),
            "amount_minor": amount_paid,
            "amount": amount_paid_major,
            "currency": invoice.get("currency"),
            "period_start": period_start.isoformat() if period_start else None,
            "period_end": period_end.isoformat() if period_end else None,
            "plan": plan.name,
        },
    )

    return HandlerResult(status=HandlerResult.PROCESSED, detail="Workspace plan updated", workspace_id=subscription.workspace_id)


def _handle_invoice_payment_failed(*, event_id: str, payload: Dict[str, Any], received_at: datetime) -> HandlerResult:
    invoice = (payload.get("data") or {}).get("object") or {}
    metadata = invoice.get("metadata") or {}
    initiator_user = _resolve_user(metadata.get("initiator_user_id"))

    try:
        subscription = _locate_subscription(invoice, metadata)
    except WebhookProcessingError:
        return HandlerResult(
            status=HandlerResult.DEAD_LETTER,
            detail="Unable to resolve subscription for invoice payment failure",
            dead_letter_reason="missing_subscription",
            dead_letter_payload=invoice,
        )

    failure_reason = _extract_failure_reason(invoice)

    subscription.renewal_attempt_count = (subscription.renewal_attempt_count or 0) + 1
    updates = ["renewal_attempt_count"]

    # After multiple failed attempts (e.g., 3), downgrade to Free plan
    MAX_RENEWAL_ATTEMPTS = 3
    if subscription.renewal_attempt_count >= MAX_RENEWAL_ATTEMPTS:
        # Downgrade to Free plan
        from billing.models import WorkspacePlan
        free_plan = WorkspacePlan.objects.filter(name__iexact="free").first()

        if free_plan:
            apply_local_plan_change(subscription, free_plan)

            subscription.status = "canceled"
            subscription.stripe_subscription_id = None  # Clear Stripe subscription ID
            # Keep stripe_customer_id for future repurchases
            subscription.auto_renew_enabled = False
            subscription.canceled_at = timezone.now()

            updates.extend(["status", "stripe_subscription_id", "auto_renew_enabled", "canceled_at"])

            subscription.notes = _append_note(
                subscription.notes,
                f"Downgraded to Free plan after {MAX_RENEWAL_ATTEMPTS} failed payment attempts: {failure_reason or 'unknown'}"
            )
        else:
            # Fallback if Free plan not found
            subscription.status = "past_due"
            updates.append("status")
            subscription.notes = _append_note(subscription.notes, f"Invoice payment failed (attempt {subscription.renewal_attempt_count}): {failure_reason}")
    else:
        # First few failures: mark as past_due
        subscription.status = "past_due"
        updates.append("status")

        if failure_reason:
            subscription.notes = _append_note(subscription.notes, f"Invoice payment failed (attempt {subscription.renewal_attempt_count}): {failure_reason}")

        if subscription.auto_renew_enabled:
            subscription.auto_renew_enabled = False
            updates.append("auto_renew_enabled")

    updates.append("notes")

    subscription.last_renewal_status = WorkspaceSubscription.RenewalStatus.FAILED
    updates.append("last_renewal_status")

    subscription.last_renewal_attempt_at = timezone.now()
    updates.append("last_renewal_attempt_at")

    subscription.save(update_fields=updates)

    payment_services.process_invoice_payment_failed_event(invoice, initiator=initiator_user)

    BillingAuditLog.objects.create(
        workspace_id=subscription.workspace_id,
        event_type="billing.subscription.invoice_failed",
        stripe_id=invoice.get("id") or subscription.stripe_subscription_id or "",
        actor="stripe_webhook",
        details={
            "invoice_id": invoice.get("id"),
            "failure_reason": failure_reason,
        },
    )

    _notify_billing_contact(
        subscription,
        f"Invoice payment failed: {failure_reason or 'unknown'}",
    )

    return HandlerResult(status=HandlerResult.PROCESSED, detail="Invoice failure recorded", workspace_id=subscription.workspace_id)


def _handle_invoice_created(*, event_id: str, payload: Dict[str, Any], received_at: datetime) -> HandlerResult:
    invoice = (payload.get("data") or {}).get("object") or {}
    metadata = invoice.get("metadata") or {}
    initiator_user = _resolve_user(metadata.get("initiator_user_id"))

    try:
        subscription = _locate_subscription(invoice, metadata, for_update=False)
    except WebhookProcessingError:
        return HandlerResult(
            status=HandlerResult.DEAD_LETTER,
            detail="Unable to resolve subscription for invoice.created",
            dead_letter_reason="missing_subscription",
            dead_letter_payload=invoice,
        )

    payment_services.process_invoice_created_event(invoice, initiator=initiator_user)

    return HandlerResult(status=HandlerResult.PROCESSED, detail="Invoice created", workspace_id=subscription.workspace_id)


def _handle_customer_balance_updated(*, event_id: str, payload: Dict[str, Any], received_at: datetime) -> HandlerResult:
    customer = (payload.get("data") or {}).get("object") or {}
    stripe_customer_id = customer.get("id") or payload.get("data", {}).get("customer")
    new_balance = customer.get("balance")

    if not stripe_customer_id:
        return HandlerResult(
            status=HandlerResult.DEAD_LETTER,
            detail="Stripe customer id missing on balance update",
            dead_letter_reason="missing_customer",
            dead_letter_payload=customer,
        )

    if new_balance is None:
        return HandlerResult(status=HandlerResult.IGNORED, detail="No balance delta provided")

    try:
        result = apply_stripe_balance_delta(
            event_id=event_id,
            stripe_customer_id=stripe_customer_id,
            new_balance_minor=new_balance,
            metadata={"source": "customer.balance.updated"},
        )
    except CreditAccountNotFound:
        return HandlerResult(
            status=HandlerResult.DEAD_LETTER,
            detail="Billing profile not found for customer",
            dead_letter_reason="missing_billing_profile",
            dead_letter_payload={"customer_id": stripe_customer_id, "balance": new_balance},
        )

    workspace_id = (
        WorkspaceSubscription.objects.filter(billing_owner=result.profile.user)
        .values_list("workspace_id", flat=True)
        .first()
    )

    detail = f"Customer balance reconciled (delta={result.delta})"
    return HandlerResult(status=HandlerResult.PROCESSED, detail=detail, workspace_id=workspace_id)


def _handle_subscription_deleted(*, event_id: str, payload: Dict[str, Any], received_at: datetime) -> HandlerResult:
    subscription_payload = (payload.get("data") or {}).get("object") or {}
    stripe_subscription_id = subscription_payload.get("id")
    customer_id = subscription_payload.get("customer")

    qs = WorkspaceSubscription.objects.select_for_update().select_related("workspace")
    subscription = None
    if stripe_subscription_id:
        subscription = qs.filter(stripe_subscription_id=stripe_subscription_id).first()
    if subscription is None and customer_id:
        subscription = qs.filter(stripe_customer_id=customer_id).first()

    if subscription is None:
        return HandlerResult(
            status=HandlerResult.DEAD_LETTER,
            detail="Subscription deletion could not locate workspace",
            dead_letter_reason="missing_subscription",
            dead_letter_payload=subscription_payload,
        )

    # Downgrade to Free plan when subscription is deleted
    from billing.models import WorkspacePlan
    free_plan = WorkspacePlan.objects.filter(name__iexact="free").first()

    if free_plan:
        apply_local_plan_change(subscription, free_plan)

    subscription.status = "canceled"
    subscription.auto_renew_enabled = False
    subscription.canceled_at = timezone.now()
    subscription.stripe_subscription_id = None  # Clear Stripe subscription ID
    # Keep stripe_customer_id for future repurchases
    subscription.notes = _append_note(subscription.notes, "Subscription canceled via Stripe event, downgraded to Free plan")
    subscription.save(update_fields=["status", "auto_renew_enabled", "canceled_at", "stripe_subscription_id", "notes"])

    BillingAuditLog.objects.create(
        workspace_id=subscription.workspace_id,
        event_type="stripe.subscription.deleted",
        stripe_id=stripe_subscription_id or customer_id or "",
        actor="stripe_webhook",
        details={"payload": subscription_payload},
    )

    return HandlerResult(status=HandlerResult.PROCESSED, detail="Subscription cancellation recorded, downgraded to Free", workspace_id=subscription.workspace_id)


def _locate_subscription(invoice: Dict[str, Any], metadata: Dict[str, Any], *, for_update: bool = True) -> WorkspaceSubscription:
    subscription_id = invoice.get("subscription")
    workspace_id = metadata.get("workspace_id")

    queryset = WorkspaceSubscription.objects.select_related("workspace", "plan")
    if for_update:
        queryset = queryset.select_for_update()

    if subscription_id:
        subscription = queryset.filter(stripe_subscription_id=subscription_id).first()
        if subscription:
            return subscription

    if workspace_id:
        subscription = queryset.filter(workspace_id=workspace_id).first()
        if subscription:
            return subscription

    customer_id = invoice.get("customer") or metadata.get("customer_id")
    if customer_id:
        subscription = queryset.filter(stripe_customer_id=customer_id).first()
        if subscription:
            return subscription

    raise WebhookProcessingError("Unable to locate workspace subscription for invoice event.")


def _resolve_plan_from_invoice(invoice: Dict[str, Any]) -> WorkspacePlan:
    product_id = _extract_invoice_product_id(invoice)
    if not product_id:
        raise WebhookProcessingError("Invoice is missing product identification.")

    plan = WorkspacePlan.objects.filter(stripe_product_id=product_id).first()
    if not plan:
        raise WebhookProcessingError(f"No workspace plan matches product '{product_id}'.")

    return plan


def _extract_invoice_product_id(invoice: Dict[str, Any]) -> Optional[str]:
    lines = ((invoice.get("lines") or {}).get("data") or [])
    for line in lines:
        pricing = line.get("pricing") or {}
        if isinstance(pricing, dict):
            price_details = pricing.get("price_details") or {}
            if isinstance(price_details, dict):
                product = price_details.get("product")
                if product:
                    return product

        price = line.get("price") or {}
        product = price.get("product")
        if product:
            return product
        plan = line.get("plan") or {}
        product = plan.get("product")
        if product:
            return product

    metadata = invoice.get("metadata") or {}
    return metadata.get("product_id")


def _extract_failure_reason(invoice: Dict[str, Any]) -> Optional[str]:
    last_payment_error = (invoice.get("last_payment_error") or {}).get("message")
    if last_payment_error:
        return last_payment_error

    charge = invoice.get("charge") or {}
    failure_message = charge.get("failure_message")
    if failure_message:
        return failure_message

    return invoice.get("collection_reason")


def _append_note(existing: Optional[str], note: str) -> str:
    if existing:
        if note in existing:
            return existing
        return f"{existing}\n{note}".strip()
    return note


def _coerce_timestamp(value: Any) -> Optional[datetime]:
    if value in (None, ""):
        return None
    try:
        from datetime import timezone as dt_timezone
        return datetime.fromtimestamp(float(value), tz=dt_timezone.utc)
    except (TypeError, ValueError):  # pragma: no cover - invalid timestamp
        return None



def _notify_billing_contact(subscription: WorkspaceSubscription, message: str) -> None:
    contact = getattr(subscription.workspace, "billing_contact", None)
    logger.info(
        "Notify billing contact %s for workspace %s: %s",
        contact or "unknown",
        subscription.workspace_id,
        message,
    )
__all__ = [
    "dispatch_event",
    "HandlerResult",
    "WebhookProcessingError",
    "_append_note",
    "_coerce_timestamp",
]
