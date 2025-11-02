"""Subscription lifecycle orchestration for upgrades, downgrades, and scheduling."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Optional

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from billing.models import (
    BillingAuditLog,
    PlanChangeRequest,
    UserBillingProfile,
    WorkspacePlan,
    WorkspaceSubscription,
)
from billing.services.stripe_payments import (
    StripeServiceError,
    modify_subscription_item_price,
    resolve_plan_price_id,
    retrieve_subscription,

)
from billing.services.subscription_toggle import has_manual_auto_renew_flag
from billing.constants import MANUAL_AUTORENEW_DISABLED_FLAG

logger = logging.getLogger(__name__)

User = get_user_model()


class SubscriptionLifecycleError(RuntimeError):
    """Base error for subscription lifecycle operations."""


class StripeSubscriptionError(SubscriptionLifecycleError):
    """Raised when Stripe subscription operations fail."""


@dataclass(frozen=True)
class PlanChangeResult:
    subscription: WorkspaceSubscription
    plan_change: PlanChangeRequest
    stripe_payload: Optional[Dict[str, Any]] = None


def apply_local_plan_change(subscription: WorkspaceSubscription, target_plan: WorkspacePlan) -> None:
    """Apply plan changes to local models, mirroring helper previously in views."""

    if subscription.plan_id == target_plan.id:
        return

    subscription.plan = target_plan
    subscription.save(update_fields=["plan"])

    from workspace.models import Workspace  # Lazy import to avoid circular dependency
    from billing.serializers import resolve_plan_key

    plan_key = resolve_plan_key(target_plan.name)
    workspace = subscription.workspace
    if workspace.plan != plan_key:
        config = workspace.PLAN_CONFIG.get(plan_key, workspace.PLAN_CONFIG["free"])
        Workspace.objects.filter(pk=workspace.pk).update(
            plan=plan_key,
            max_users=config["max_users"],
            max_storage_gb=config["max_storage_gb"],
        )


def assign_billing_owner(
    subscription: WorkspaceSubscription,
    owner: User,
    *,
    force: bool = False,
) -> UserBillingProfile:
    """Bind a workspace subscription to a user's billing profile."""

    if subscription.billing_owner_id and subscription.billing_owner_id != owner.id and not force:
        raise SubscriptionLifecycleError("Workspace subscription is already bound to another billing owner.")

    profile = UserBillingProfile.get_or_create_for_user(owner)

    updates: list[str] = []

    if subscription.billing_owner_id != owner.id:
        subscription.billing_owner = owner
        updates.append("billing_owner")

    if profile.stripe_customer_id and subscription.stripe_customer_id != profile.stripe_customer_id:
        subscription.stripe_customer_id = profile.stripe_customer_id
        updates.append("stripe_customer_id")

    # credit_account field is deprecated; ensure it is cleared to avoid stale data.
    if subscription.credit_account_id is not None:
        subscription.credit_account = None
        updates.append("credit_account")

    if updates:
        subscription.save(update_fields=updates)

    return profile


def release_billing_owner(
    subscription: WorkspaceSubscription,
    *,
    force: bool = False,
) -> None:
    """Detach the billing owner from a workspace subscription."""

    active_statuses = {"active", "trialing", "past_due", "incomplete"}
    if (
        subscription.billing_owner_id
        and subscription.status in active_statuses
        and subscription.stripe_subscription_id
        and not force
    ):
        raise SubscriptionLifecycleError(
            "Cannot release billing owner while an active Stripe subscription is still linked."
        )

    updates: list[str] = []
    if subscription.billing_owner_id is not None:
        subscription.billing_owner = None
        updates.append("billing_owner")
    if subscription.stripe_customer_id:
        subscription.stripe_customer_id = None
        updates.append("stripe_customer_id")
    if subscription.credit_account_id is not None:
        subscription.credit_account = None
        updates.append("credit_account")

    if updates:
        subscription.save(update_fields=updates)


def upgrade_subscription(
    *,
    subscription: WorkspaceSubscription,
    target_plan: WorkspacePlan,
    requested_by: User,
    change_type: str,
    actor: str,
    request_id: Optional[str] = None,
    reason: Optional[str] = None,
    billing_cycle: str = "monthly",
    processed_by: Optional[User] = None,
) -> PlanChangeResult:
    """Perform an immediate plan upgrade (or lateral change) with proration."""

    if not subscription.stripe_subscription_id or not subscription.stripe_customer_id:
        raise SubscriptionLifecycleError("Subscription must be linked to Stripe before upgrading.")

    with transaction.atomic():
        locked_subscription = (
            WorkspaceSubscription.objects.select_for_update()
            .select_related("workspace", "plan")
            .get(pk=subscription.pk)
        )

        if locked_subscription.plan_id == target_plan.id:
            raise SubscriptionLifecycleError("Workspace is already on the requested plan.")

        previous_plan = locked_subscription.plan

        stripe_subscription = _fetch_stripe_subscription(locked_subscription.stripe_subscription_id)
        item_id = _extract_subscription_item_id(stripe_subscription)
        price_id = _resolve_price_id(target_plan, billing_cycle)

        idempotency_key = _build_idempotency_key(
            subscription=locked_subscription,
            target_plan=target_plan,
            operation=change_type,
        )

        try:
            stripe_response = modify_subscription_item_price(
                subscription_id=locked_subscription.stripe_subscription_id,
                item_id=item_id,
                price_id=price_id,
                proration_behavior="create_prorations",
                idempotency_key=idempotency_key,
            )
        except StripeServiceError as exc:  # pragma: no cover - network exceptions mocked in higher layers
            logger.error("Stripe subscription modify failed for %s: %s", locked_subscription.id, exc)
            raise StripeSubscriptionError(str(exc)) from exc

        apply_local_plan_change(locked_subscription, target_plan)

        locked_subscription.pending_plan = None
        locked_subscription.status = "active"
        if not has_manual_auto_renew_flag(locked_subscription.notes):
            locked_subscription.auto_renew_enabled = True
        locked_subscription.renewal_attempt_count = 0
        locked_subscription.last_renewal_status = WorkspaceSubscription.RenewalStatus.SUCCESS
        locked_subscription.last_renewal_attempt_at = timezone.now()
        locked_subscription.save(
            update_fields=[
                "pending_plan",
                "status",
                "auto_renew_enabled",
                "renewal_attempt_count",
                "last_renewal_status",
                "last_renewal_attempt_at",
            ]
        )

        processor = processed_by or requested_by

        plan_change = PlanChangeRequest.objects.create(
            subscription=locked_subscription,
            from_plan=previous_plan,
            to_plan=target_plan,
            change_type=change_type,
            effective_timing="immediate",
            effective_date=timezone.now(),
            status="completed",
            requested_by=requested_by,
            processed_by=processor,
            processed_at=timezone.now(),
            reason=reason or "",
        )

        event_type = "billing.subscription.upgrade" if change_type == "upgrade" else "billing.subscription.plan_change"

        BillingAuditLog.objects.create(
            workspace_id=locked_subscription.workspace_id,
            event_type=event_type,
            stripe_id=locked_subscription.stripe_subscription_id,
            actor=actor,
            request_id=request_id or "",
            details={
                "from_plan": previous_plan.name if previous_plan else None,
                "to_plan": target_plan.name,
                "billing_cycle": billing_cycle,
            },
        )

        return PlanChangeResult(
            subscription=locked_subscription,
            plan_change=plan_change,
            stripe_payload=stripe_response,
        )


def schedule_plan_change(
    *,
    subscription: WorkspaceSubscription,
    target_plan: WorkspacePlan,
    change_type: str,
    effective_date: Optional[datetime],
    requested_by: User,
    actor: str,
    reason: Optional[str] = None,
) -> PlanChangeResult:
    """Schedule a plan change to execute at a later time (typically end of period)."""

    with transaction.atomic():
        locked_subscription = (
            WorkspaceSubscription.objects.select_for_update()
            .select_related("workspace", "plan")
            .get(pk=subscription.pk)
        )

        if locked_subscription.pending_plan_id and locked_subscription.pending_plan_id != target_plan.id:
            raise SubscriptionLifecycleError("Another plan change is already pending.")

        if effective_date is None:
            effective_date = locked_subscription.current_period_end

        locked_subscription.pending_plan = target_plan
        locked_subscription.save(update_fields=["pending_plan"])

        plan_change = PlanChangeRequest.objects.create(
            subscription=locked_subscription,
            from_plan=locked_subscription.plan,
            to_plan=target_plan,
            change_type=change_type,
            effective_timing="end_of_period",
            effective_date=effective_date,
            status="pending",
            requested_by=requested_by,
            reason=reason or "",
        )

        BillingAuditLog.objects.create(
            workspace_id=locked_subscription.workspace_id,
            event_type="billing.subscription.plan_change_scheduled",
            stripe_id=locked_subscription.stripe_subscription_id or "",
            actor=actor,
            request_id="",
            details={
                "to_plan": target_plan.name,
                "change_type": change_type,
                "effective_date": effective_date.isoformat() if effective_date else None,
            },
        )

        return PlanChangeResult(subscription=locked_subscription, plan_change=plan_change)


def execute_scheduled_change(
    *,
    plan_change: PlanChangeRequest,
    actor: str,
    request_id: Optional[str] = None,
    processed_by: Optional[User] = None,
) -> PlanChangeResult:
    """Execute a previously scheduled plan change."""

    with transaction.atomic():
        locked_plan_change = (
            PlanChangeRequest.objects.select_for_update()
            .select_related("subscription", "subscription__workspace", "subscription__plan", "to_plan")
            .get(pk=plan_change.pk)
        )

        subscription = locked_plan_change.subscription
        target_plan = locked_plan_change.to_plan

        # Renew-first guard: if this is a scheduled downgrade and the subscription
        # has already been renewed in the same billing window, skip the downgrade
        # to honor the business ordering (auto-renew takes precedence over downgrade).
        if (
            locked_plan_change.change_type == "downgrade"
            and locked_plan_change.effective_timing == "end_of_period"
            and subscription is not None
        ):
            effective = locked_plan_change.effective_date
            if effective is not None:
                renewed_after_effective = False
                last_status = subscription.last_renewal_status
                last_attempt = subscription.last_renewal_attempt_at or timezone.datetime.min.replace(tzinfo=timezone.utc)
                if last_status == WorkspaceSubscription.RenewalStatus.SUCCESS and last_attempt >= effective:
                    renewed_after_effective = True

                # Also consider the case where the current period was advanced via webhook.
                if (
                    not renewed_after_effective
                    and subscription.current_period_start is not None
                    and subscription.current_period_start > effective
                ):
                    renewed_after_effective = True

                if renewed_after_effective:
                    locked_plan_change.status = "canceled"
                    locked_plan_change.admin_notes = (locked_plan_change.admin_notes or "").strip()
                    if "SKIPPED_BY_RENEWAL" not in (locked_plan_change.admin_notes or ""):
                        locked_plan_change.admin_notes = (locked_plan_change.admin_notes + "\nSKIPPED_BY_RENEWAL").strip()
                    locked_plan_change.processed_at = timezone.now()
                    locked_plan_change.save(update_fields=["status", "admin_notes", "processed_at"])

                    BillingAuditLog.objects.create(
                        workspace_id=subscription.workspace_id,
                        event_type="billing.subscription.plan_change_skipped",
                        stripe_id=subscription.stripe_subscription_id or "",
                        actor=actor,
                        request_id=request_id or "",
                        details={
                            "reason": "SKIPPED_BY_RENEWAL",
                            "effective_date": effective.isoformat(),
                        },
                    )

                    return PlanChangeResult(
                        subscription=subscription,
                        plan_change=locked_plan_change,
                        stripe_payload=None,
                    )

        stripe_payload: Optional[Dict[str, Any]] = None
        if subscription.stripe_subscription_id and subscription.stripe_customer_id:
            try:
                stripe_payload = _apply_stripe_plan_update(
                    subscription=subscription,
                    target_plan=target_plan,
                    change_type=locked_plan_change.change_type,
                )
            except StripeSubscriptionError as exc:
                logger.warning(
                    "Scheduled plan change proceeding without Stripe update for %s: %s",
                    subscription.stripe_subscription_id,
                    exc,
                )
                stripe_payload = None

        apply_local_plan_change(subscription, target_plan)

        subscription.pending_plan = None
        subscription.save(update_fields=["pending_plan"])

        locked_plan_change.status = "completed"
        locked_plan_change.processed_at = timezone.now()
        if processed_by:
            locked_plan_change.processed_by = processed_by
        if not locked_plan_change.effective_date:
            locked_plan_change.effective_date = timezone.now()
        locked_plan_change.save(update_fields=["status", "processed_at", "processed_by", "effective_date"])

        BillingAuditLog.objects.create(
            workspace_id=subscription.workspace_id,
            event_type="billing.subscription.plan_change_applied",
            stripe_id=subscription.stripe_subscription_id or "",
            actor=actor,
            request_id=request_id or "",
            details={
                "to_plan": target_plan.name,
                "change_type": locked_plan_change.change_type,
            },
        )

        return PlanChangeResult(
            subscription=subscription,
            plan_change=locked_plan_change,
            stripe_payload=stripe_payload,
        )


def _fetch_stripe_subscription(subscription_id: str) -> Dict[str, Any]:
    try:
        return retrieve_subscription(subscription_id, expand=["items"])
    except StripeServiceError as exc:  # pragma: no cover - network exceptions mocked in higher layers
        logger.error("Unable to retrieve Stripe subscription %s: %s", subscription_id, exc)
        raise StripeSubscriptionError(str(exc)) from exc


def _extract_subscription_item_id(stripe_subscription: Dict[str, Any]) -> str:
    items = ((stripe_subscription.get("items") or {}).get("data") or [])
    if not items:
        raise StripeSubscriptionError("Stripe subscription has no line items to update.")
    return items[0].get("id")


def _resolve_price_id(target_plan: WorkspacePlan, billing_cycle: str) -> str:
    if not target_plan.stripe_product_id:
        raise SubscriptionLifecycleError("Target plan does not have an associated Stripe price or product ID.")

    cycle = billing_cycle.lower()
    interval = "year" if cycle in {"annual", "annually", "yearly", "year"} else "month"

    try:
        return resolve_plan_price_id(target_plan.stripe_product_id, interval=interval)
    except StripeServiceError as exc:
        raise SubscriptionLifecycleError(str(exc)) from exc


def _build_idempotency_key(*, subscription: WorkspaceSubscription, target_plan: WorkspacePlan, operation: str) -> str:
    return f"workspace:{subscription.workspace_id}:subscription:{operation}:{target_plan.id}"


def _apply_stripe_plan_update(
    *,
    subscription: WorkspaceSubscription,
    target_plan: WorkspacePlan,
    change_type: str,
) -> Dict[str, Any]:
    """Update Stripe subscription pricing when applying a scheduled plan change."""

    stripe_subscription = _fetch_stripe_subscription(subscription.stripe_subscription_id)
    item_id = _extract_subscription_item_id(stripe_subscription)

    interval = "month"
    try:
        interval = (
            stripe_subscription.get("items", {})
            .get("data", [{}])[0]
            .get("price", {})
            .get("recurring", {})
            .get("interval", "month")
        )
    except (IndexError, AttributeError):
        interval = "month"

    billing_cycle = "annual" if interval in {"year", "annual"} else "monthly"

    price_id = _resolve_price_id(target_plan, billing_cycle)

    idempotency_key = _build_idempotency_key(
        subscription=subscription,
        target_plan=target_plan,
        operation=f"{change_type}_scheduled",
    )

    try:
        return modify_subscription_item_price(
            subscription_id=subscription.stripe_subscription_id,
            item_id=item_id,
            price_id=price_id,
            proration_behavior="none",
            idempotency_key=idempotency_key,
        )
    except StripeServiceError as exc:
        logger.error(
            "Stripe subscription modify failed for scheduled change on %s: %s",
            subscription.id,
            exc,
        )
        raise StripeSubscriptionError(str(exc)) from exc


__all__ = [
    "SubscriptionLifecycleError",
    "StripeSubscriptionError",
    "PlanChangeResult",
    "apply_local_plan_change",
    "assign_billing_owner",
    "release_billing_owner",
    "upgrade_subscription",
    "schedule_plan_change",
    "execute_scheduled_change",
]
