"""User credit ledger helpers with idempotent Stripe integrations."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional, Union

from django.db import transaction
from django.utils import timezone

from billing.models import UserBillingProfile, UserCreditTransaction

TWO_PLACES = Decimal("0.01")


class CreditLedgerError(Exception):
    """Base exception for credit ledger operations."""


class CreditAccountNotFound(CreditLedgerError):
    """Raised when the requested billing profile cannot be located."""


class IdempotencyConflict(CreditLedgerError):
    """Raised when an idempotency key collides with different mutation semantic."""


@dataclass(frozen=True)
class CreditLedgerResult:
    profile: UserBillingProfile
    transaction: Optional[UserCreditTransaction]
    created: bool
    delta: Decimal


def apply_stripe_balance_delta(
    *,
    event_id: str,
    stripe_customer_id: str,
    new_balance_minor: Union[int, str, Decimal],
    metadata: Optional[dict] = None,
) -> CreditLedgerResult:
    """Reconcile ``customer.balance`` updates from Stripe into the local ledger.

    ``new_balance_minor`` must be provided in Stripe minor units (e.g. cents). The
    resulting balance is stored in standard currency units.
    """

    if not event_id:
        raise ValueError("Stripe event_id is required.")
    if not stripe_customer_id:
        raise ValueError("stripe_customer_id is required.")

    normalized_balance = _from_stripe_minor_amount(new_balance_minor)

    with transaction.atomic():
        profile = (
            UserBillingProfile.objects.select_for_update()
            .filter(stripe_customer_id=stripe_customer_id)
            .first()
        )
        if profile is None:
            raise CreditAccountNotFound(f"No billing profile mapped to customer {stripe_customer_id}.")

        existing = UserCreditTransaction.objects.filter(stripe_event_id=event_id).first()
        if existing:
            return CreditLedgerResult(
                profile=profile,
                transaction=existing,
                created=False,
                delta=existing.amount,
            )

        previous_balance = profile.credit_balance or Decimal("0.00")
        delta = (normalized_balance - previous_balance).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

        if delta == 0:
            _update_sync_markers(profile, normalized_balance)
            profile.save(update_fields=["last_synced_at", "last_stripe_balance", "updated_at"])
            return CreditLedgerResult(profile=profile, transaction=None, created=False, delta=Decimal("0.00"))

        transaction_record = UserCreditTransaction.objects.create(
            profile=profile,
            amount=delta,
            type=UserCreditTransaction.TransactionType.SYNC,
            stripe_transaction_id=None,
            stripe_event_id=event_id,
            idempotency_key=f"stripe:event:{event_id}",
            description="Stripe customer.balance reconciliation delta",
            metadata=metadata or {},
        )

        profile.credit_balance = previous_balance + delta
        _update_sync_markers(profile, normalized_balance)
        profile.save(update_fields=["credit_balance", "last_synced_at", "last_stripe_balance", "updated_at"])

        return CreditLedgerResult(profile=profile, transaction=transaction_record, created=True, delta=delta)


def record_manual_adjustment(
    *,
    profile: UserBillingProfile,
    amount: Union[int, Decimal, str],
    reason: str,
    idempotency_key: Optional[str] = None,
    actor: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> CreditLedgerResult:
    """Record manual adjustments (credits/debits) against a user billing profile."""

    if profile is None:
        raise ValueError("profile is required.")

    normalized_amount = _to_decimal_amount(amount)
    if normalized_amount == 0:
        raise ValueError("Adjustment amount must be non-zero.")

    with transaction.atomic():
        locked_profile = UserBillingProfile.objects.select_for_update().get(pk=profile.pk)

        if idempotency_key:
            existing = UserCreditTransaction.objects.filter(idempotency_key=idempotency_key).first()
            if existing:
                _validate_idempotent(existing, locked_profile, normalized_amount)
                return CreditLedgerResult(
                    profile=locked_profile,
                    transaction=existing,
                    created=False,
                    delta=existing.amount,
                )

        tx_type = UserCreditTransaction.TransactionType.MANUAL_ADJUSTMENT
        transaction_record = UserCreditTransaction.objects.create(
            profile=locked_profile,
            amount=normalized_amount,
            type=tx_type,
            idempotency_key=idempotency_key,
            description=reason or "",
            metadata=_merge_metadata(metadata, {"actor": actor} if actor else None),
        )

        locked_profile.credit_balance = (locked_profile.credit_balance or Decimal("0.00")) + normalized_amount
        locked_profile.save(update_fields=["credit_balance", "updated_at"])

        return CreditLedgerResult(
            profile=locked_profile,
            transaction=transaction_record,
            created=True,
            delta=normalized_amount,
        )


def reconcile_balance(
    *,
    profile: UserBillingProfile,
    stripe_balance_minor: Union[int, str, Decimal],
    idempotency_key: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> CreditLedgerResult:
    """Hard reconcile the local ledger to Stripe-reported balance."""

    normalized_balance = _from_stripe_minor_amount(stripe_balance_minor)

    with transaction.atomic():
        locked_profile = UserBillingProfile.objects.select_for_update().get(pk=profile.pk)

        previous_balance = locked_profile.credit_balance or Decimal("0.00")
        delta = (normalized_balance - previous_balance).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

        if delta == 0:
            _update_sync_markers(locked_profile, normalized_balance)
            locked_profile.save(update_fields=["last_synced_at", "last_stripe_balance", "updated_at"])
            return CreditLedgerResult(profile=locked_profile, transaction=None, created=False, delta=Decimal("0.00"))

        key = idempotency_key or f"reconcile:{locked_profile.id}:{timezone.now().date()}"
        existing = UserCreditTransaction.objects.filter(idempotency_key=key).first()
        if existing:
            _validate_idempotent(existing, locked_profile, delta)
            _update_sync_markers(locked_profile, normalized_balance)
            locked_profile.save(update_fields=["last_synced_at", "last_stripe_balance", "updated_at"])
            return CreditLedgerResult(profile=locked_profile, transaction=existing, created=False, delta=existing.amount)

        transaction_record = UserCreditTransaction.objects.create(
            profile=locked_profile,
            amount=delta,
            type=UserCreditTransaction.TransactionType.SYNC,
            idempotency_key=key,
            description="Stripe balance reconciliation adjustment",
            metadata=metadata or {},
        )

        locked_profile.credit_balance = previous_balance + delta
        _update_sync_markers(locked_profile, normalized_balance)
        locked_profile.save(update_fields=["credit_balance", "last_synced_at", "last_stripe_balance", "updated_at"])

        return CreditLedgerResult(profile=locked_profile, transaction=transaction_record, created=True, delta=delta)


def _validate_idempotent(
    transaction_record: UserCreditTransaction,
    profile: UserBillingProfile,
    amount: Decimal,
) -> None:
    if transaction_record.profile_id != profile.id:
        raise IdempotencyConflict("Idempotency key belongs to a different billing profile.")
    if transaction_record.amount != amount:
        raise IdempotencyConflict("Existing transaction amount mismatch for idempotent request.")


def _update_sync_markers(profile: UserBillingProfile, normalized_balance: Decimal) -> None:
    profile.last_synced_at = timezone.now()
    profile.last_stripe_balance = normalized_balance


def _from_stripe_minor_amount(value: Union[int, str, Decimal]) -> Decimal:
    decimal_value = Decimal(str(value))
    return (decimal_value / Decimal("100")).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def _to_decimal_amount(value: Union[int, str, Decimal]) -> Decimal:
    decimal_value = Decimal(str(value))
    return decimal_value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def _merge_metadata(base: Optional[dict], extra: Optional[dict]) -> Optional[dict]:
    if not base and not extra:
        return None
    merged = dict(base or {})
    if extra:
        merged.update({k: v for k, v in extra.items() if v is not None})
    return merged

