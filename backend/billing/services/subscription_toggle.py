"""
Helpers to inspect and toggle workspace subscription auto-renew behaviour.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from django.db import transaction

from billing.constants import MANUAL_AUTORENEW_DISABLED_FLAG
from billing.models import BillingAuditLog, WorkspaceSubscription

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AutoRenewToggleResult:
    subscription: WorkspaceSubscription
    previous: bool
    updated: bool


def _has_manual_flag(notes: Optional[str]) -> bool:
    if not notes:
        return False
    return MANUAL_AUTORENEW_DISABLED_FLAG in notes


def _append_manual_flag(notes: Optional[str]) -> str:
    existing = notes or ""
    if MANUAL_AUTORENEW_DISABLED_FLAG in existing:
        return existing
    if not existing:
        return MANUAL_AUTORENEW_DISABLED_FLAG
    return f"{existing.strip()}\n{MANUAL_AUTORENEW_DISABLED_FLAG}"


def _remove_manual_flag(notes: Optional[str]) -> str:
    if not notes:
        return ""
    cleaned = [line for line in notes.splitlines() if line.strip() != MANUAL_AUTORENEW_DISABLED_FLAG]
    return "\n".join(cleaned).strip()



def has_manual_auto_renew_flag(notes: Optional[str]) -> bool:
    return _has_manual_flag(notes)


def add_manual_auto_renew_flag(notes: Optional[str]) -> str:
    return _append_manual_flag(notes)


def remove_manual_auto_renew_flag(notes: Optional[str]) -> str:
    return _remove_manual_flag(notes)


def set_auto_renew(
    *,
    subscription: WorkspaceSubscription,
    enabled: bool,
    actor: str,
    request_id: str = "",
) -> AutoRenewToggleResult:
    """
    Toggle ``auto_renew_enabled`` while recording an audit trail.

    The ``MANUAL_AUTO_RENEW_DISABLED`` flag in notes denotes manual overrides that
    other subsystems should respect (e.g. webhook re-enablement).
    """

    with transaction.atomic():
        locked = (
            WorkspaceSubscription.objects.select_for_update()
            .select_related("workspace")
            .get(pk=subscription.pk)
        )
        previous = locked.auto_renew_enabled

        if previous == enabled:
            logger.debug(
                "Auto-renew already set to %s for workspace %s; no changes.",
                enabled,
                locked.workspace_id,
            )
            return AutoRenewToggleResult(subscription=locked, previous=previous, updated=False)

        locked.auto_renew_enabled = enabled
        if enabled:
            locked.notes = _remove_manual_flag(locked.notes)
        else:
            locked.notes = _append_manual_flag(locked.notes)

        locked.save(update_fields=["auto_renew_enabled", "notes"])

        BillingAuditLog.objects.create(
            workspace=locked.workspace,
            event_type="billing.subscription.auto_renew_toggled",
            stripe_id=locked.stripe_subscription_id or "",
            actor=actor,
            request_id=request_id or "",
            details={
                "previous": previous,
                "auto_renew_enabled": enabled,
            },
        )

        return AutoRenewToggleResult(subscription=locked, previous=previous, updated=True)
