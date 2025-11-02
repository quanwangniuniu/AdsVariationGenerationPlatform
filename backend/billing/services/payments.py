"""Helpers for syncing Stripe invoice and payment events into local models."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
import logging
from typing import Any, Dict, Optional, Tuple

from django.db import transaction
from django.utils import timezone

from billing.models import (
    BillingTransaction,
    InvoiceRecord,
    PaymentRecord,
    WorkspaceSubscription,
)
from workspace.models import Workspace

RETRY_WINDOW = timedelta(hours=12)
logger = logging.getLogger(__name__)


def _extract_invoice_metadata(invoice_payload: Dict[str, Any]) -> Dict[str, Any]:
    """Aggregate metadata from invoice, parent subscription, and line items."""

    aggregated: Dict[str, Any] = {}

    def _merge(source: Optional[Dict[str, Any]]) -> None:
        if not isinstance(source, dict):
            return
        for key, value in source.items():
            if key not in aggregated and value not in (None, ""):
                aggregated[key] = value

    _merge(invoice_payload.get("metadata"))

    parent = invoice_payload.get("parent") or {}
    subscription_details = parent.get("subscription_details") or {}
    _merge(subscription_details.get("metadata"))

    lines = ((invoice_payload.get("lines") or {}).get("data") or [])
    for line in lines:
        _merge(line.get("metadata"))

    return aggregated


def extract_invoice_metadata(invoice_payload: Dict[str, Any]) -> Dict[str, Any]:
    """Public helper to expose combined invoice metadata."""

    return _extract_invoice_metadata(invoice_payload)


@dataclass(frozen=True)
class InvoiceSyncResult:
    invoice: InvoiceRecord
    payment: Optional[PaymentRecord]


def _from_minor(amount_minor: Optional[int]) -> Decimal:
    if amount_minor is None:
        return Decimal("0.00")
    return (Decimal(amount_minor) / Decimal("100")).quantize(Decimal("0.01"))


def _from_timestamp(value: Optional[int]) -> Optional[datetime]:
    if not value:
        return None
    import datetime as dt
    return datetime.fromtimestamp(value, tz=dt.timezone.utc)


def _resolve_workspace(invoice_payload: Dict[str, Any]) -> Optional[Workspace]:
    metadata = _extract_invoice_metadata(invoice_payload)
    workspace_id = metadata.get("workspace_id")
    if workspace_id:
        try:
            return Workspace.objects.get(id=workspace_id)
        except Workspace.DoesNotExist:
            pass

    subscription_metadata_id = metadata.get("workspace_subscription_id")
    if subscription_metadata_id:
        workspace_id = (
            WorkspaceSubscription.objects.filter(id=subscription_metadata_id)
            .values_list("workspace_id", flat=True)
            .first()
        )
        if workspace_id:
            try:
                return Workspace.objects.get(id=workspace_id)
            except Workspace.DoesNotExist:
                pass

    subscription_id = invoice_payload.get("subscription")
    if subscription_id:
        workspace_id = (
            WorkspaceSubscription.objects.filter(stripe_subscription_id=subscription_id)
            .values_list("workspace_id", flat=True)
            .first()
        )
        if workspace_id:
            try:
                return Workspace.objects.get(id=workspace_id)
            except Workspace.DoesNotExist:
                pass

    customer_id = invoice_payload.get("customer")
    if customer_id:
        workspace_id = (
            WorkspaceSubscription.objects.filter(stripe_customer_id=customer_id)
            .values_list("workspace_id", flat=True)
            .first()
        )
        if workspace_id:
            try:
                return Workspace.objects.get(id=workspace_id)
            except Workspace.DoesNotExist:
                pass

    return None


def _extract_failure_reason(invoice_payload: Dict[str, Any]) -> str:
    last_payment_error = (invoice_payload.get("last_payment_error") or {}).get("message")
    if last_payment_error:
        return str(last_payment_error)
    charge = invoice_payload.get("charge") or {}
    # charge can be either a dict or a string (charge ID)
    if isinstance(charge, dict):
        failure_message = charge.get("failure_message")
        if failure_message:
            return str(failure_message)
    return str(invoice_payload.get("collection_reason") or "")


def _first_not_none(payload: Dict[str, Any], *keys: str) -> Optional[int]:
    for key in keys:
        value = payload.get(key)
        if value is not None:
            return value
    return None


def _resolve_invoice_amounts(
    invoice_payload: Dict[str, Any],
    existing_invoice: Optional[InvoiceRecord] = None,
) -> Tuple[Decimal, Decimal]:
    total_minor = _first_not_none(invoice_payload, "total", "amount_paid", "amount_due", "amount_remaining")
    amount_paid_minor = invoice_payload.get("amount_paid")
    amount_remaining_minor = _first_not_none(invoice_payload, "amount_remaining", "amount_due")

    if amount_remaining_minor is None and total_minor is not None and amount_paid_minor is not None:
        amount_remaining_minor = max(total_minor - amount_paid_minor, 0)

    if total_minor is not None:
        total_amount = _from_minor(total_minor)
    elif existing_invoice and existing_invoice.total_amount is not None:
        total_amount = existing_invoice.total_amount
    else:
        total_amount = Decimal("0.00")

    if amount_remaining_minor is not None:
        amount_due = _from_minor(amount_remaining_minor)
    elif existing_invoice and existing_invoice.amount_due is not None:
        amount_due = existing_invoice.amount_due
    elif total_minor is not None and amount_paid_minor is not None:
        amount_due = _from_minor(max(total_minor - amount_paid_minor, 0))
    else:
        amount_due = Decimal("0.00")

    return total_amount, amount_due


def _upsert_invoice(invoice_payload: Dict[str, Any], initiator=None) -> InvoiceRecord:
    stripe_invoice_id = invoice_payload.get("id")
    if not stripe_invoice_id:
        raise ValueError("Stripe invoice payload is missing id.")

    workspace = _resolve_workspace(invoice_payload)
    status = (invoice_payload.get("status") or "open").lower()
    total_amount, amount_due = _resolve_invoice_amounts(invoice_payload)
    currency = (invoice_payload.get("currency") or "aud").lower()
    metadata = _extract_invoice_metadata(invoice_payload)

    defaults = {
        "workspace": workspace,
        "stripe_customer_id": invoice_payload.get("customer") or "",
        "status": status,
        "total_amount": total_amount,
        "amount_due": amount_due,
        "currency": currency,
        "hosted_invoice_url": invoice_payload.get("hosted_invoice_url") or "",
        "issued_at": _from_timestamp(invoice_payload.get("created")),
        "due_at": _from_timestamp(invoice_payload.get("due_date")),
        "paid_at": _from_timestamp(invoice_payload.get("paid_at")),
        "canceled_at": _from_timestamp(invoice_payload.get("canceled_at")),
        "last_payment_attempt_at": _from_timestamp(
            invoice_payload.get("last_payment_attempt") or invoice_payload.get("next_payment_attempt")
        ),
        "failure_reason": invoice_payload.get("collection_reason") or "",
        "metadata": metadata,
        "initiator": initiator,
    }

    invoice, created = InvoiceRecord.objects.get_or_create(
        stripe_invoice_id=stripe_invoice_id,
        defaults=defaults,
    )

    # Re-evaluate resolved amounts using the persisted invoice as fallback.
    resolved_total, resolved_due = _resolve_invoice_amounts(invoice_payload, invoice)

    update_fields = {
        "workspace": workspace or invoice.workspace,
        "stripe_customer_id": invoice_payload.get("customer") or invoice.stripe_customer_id,
        "status": status,
        "total_amount": resolved_total,
        "amount_due": resolved_due,
        "currency": currency,
        "hosted_invoice_url": invoice_payload.get("hosted_invoice_url") or invoice.hosted_invoice_url,
        "metadata": metadata or invoice.metadata or {},
        "initiator": initiator or invoice.initiator,
    }

    timestamp_fields = {
        "issued_at": _from_timestamp(invoice_payload.get("created")),
        "due_at": _from_timestamp(invoice_payload.get("due_date")),
        "paid_at": _from_timestamp(invoice_payload.get("paid_at")),
        "canceled_at": _from_timestamp(invoice_payload.get("canceled_at")),
        "last_payment_attempt_at": _from_timestamp(
            invoice_payload.get("last_payment_attempt") or invoice_payload.get("next_payment_attempt")
        ),
    }
    for field, ts in timestamp_fields.items():
        if ts:
            update_fields[field] = ts

    failure_reason = _extract_failure_reason(invoice_payload)
    if failure_reason:
        update_fields["failure_reason"] = failure_reason
    else:
        update_fields["failure_reason"] = ""

    for field, value in update_fields.items():
        setattr(invoice, field, value)
    invoice.save(update_fields=list(update_fields.keys()) + ["updated_at"])
    return invoice


def _upsert_payment(
    invoice: InvoiceRecord,
    invoice_payload: Dict[str, Any],
    initiator=None,
) -> Optional[PaymentRecord]:
    payment_intent = invoice_payload.get("payment_intent")
    if not payment_intent:
        return None

    amount_paid = _from_minor(invoice_payload.get("amount_paid"))
    currency = invoice.currency
    status_map = {
        "paid": PaymentRecord.Status.SUCCEEDED,
        "open": PaymentRecord.Status.PROCESSING,
    }
    invoice_status = invoice_payload.get("status", "open").lower()
    payment_status = status_map.get(invoice_status, PaymentRecord.Status.PROCESSING)

    defaults = {
        "invoice": invoice,
        "workspace": invoice.workspace,
        "status": payment_status,
        "amount": amount_paid if amount_paid > 0 else invoice.total_amount,
        "currency": currency,
        "stripe_charge_id": invoice_payload.get("charge") or "",
        "metadata": invoice_payload,
        "initiator": initiator,
    }

    payment, created = PaymentRecord.objects.get_or_create(
        stripe_payment_intent_id=payment_intent,
        defaults=defaults,
    )

    update_fields = {
        "invoice": invoice,
        "workspace": invoice.workspace,
        "status": payment_status,
        "amount": amount_paid if amount_paid > 0 else payment.amount,
        "currency": currency,
        "stripe_charge_id": invoice_payload.get("charge") or payment.stripe_charge_id,
        "metadata": invoice_payload,
        "initiator": initiator or payment.initiator,
    }
    for field, value in update_fields.items():
        setattr(payment, field, value)
    payment.save(update_fields=list(update_fields.keys()) + ["updated_at"])
    return payment


def _record_invoice_transaction(
    invoice: InvoiceRecord,
    payment: Optional[PaymentRecord],
    payload: Dict[str, Any],
    status: BillingTransaction.Status,
    initiator=None,
) -> Optional[BillingTransaction]:
    occurred_at = invoice.paid_at or invoice.issued_at or timezone.now()
    invoice_amount = invoice.total_amount or Decimal("0.00")
    payment_amount = payment.amount if payment and payment.amount else Decimal("0.00")
    effective_amount = invoice_amount if invoice_amount > 0 else payment_amount

    if effective_amount <= Decimal("0.00"):
        logger.debug(
            "Skipping invoice transaction for zero/negative amount.",
            extra={
                "invoice_id": getattr(invoice, "stripe_invoice_id", None),
                "effective_amount": str(effective_amount),
                "status": status,
            },
        )
        existing_txn = BillingTransaction.objects.filter(invoice=invoice).first()
        return existing_txn

    defaults = {
        "workspace": invoice.workspace,
        "user": initiator,
        "initiator": initiator,
        "category": BillingTransaction.Category.SUBSCRIPTION_INVOICE,
        "direction": BillingTransaction.Direction.DEBIT,
        "status": status,
        "amount": effective_amount,
        "currency": invoice.currency,
        "invoice": invoice,
        "payment": payment,
        "source_reference": invoice.stripe_invoice_id,
        "description": "Stripe subscription invoice",
        "metadata": payload,
        "occurred_at": occurred_at,
    }

    txn, created = BillingTransaction.objects.get_or_create(
        invoice=invoice,
        defaults=defaults,
    )
    if not created:
        update_fields = {
            "workspace": invoice.workspace,
            "status": status,
            "amount": effective_amount,
            "currency": invoice.currency,
            "payment": payment,
            "metadata": payload,
            "occurred_at": occurred_at,
            "user": initiator or txn.user,
            "initiator": initiator or txn.initiator,
        }
        for field, value in update_fields.items():
            setattr(txn, field, value)
        txn.save(update_fields=list(update_fields.keys()) + ["updated_at"])
    return txn


def process_invoice_paid_event(invoice_payload: Dict[str, Any], initiator=None) -> InvoiceSyncResult:
    # Extract initiator from metadata if not explicitly provided
    if initiator is None:
        metadata = _extract_invoice_metadata(invoice_payload)
        for candidate_key in ("initiator_user_id", "billing_owner_user_id", "purchaser_user_id"):
            initiator_user_id = metadata.get(candidate_key)
            if not initiator_user_id:
                continue
            try:
                from accounts.models import User
                initiator = User.objects.get(id=int(initiator_user_id))
                break
            except (ValueError, User.DoesNotExist):
                continue

    with transaction.atomic():
        invoice = _upsert_invoice(invoice_payload, initiator=initiator)
        payment = _upsert_payment(invoice, invoice_payload, initiator=initiator)
        if payment:
            payment.status = PaymentRecord.Status.SUCCEEDED
            payment.failure_code = ""
            payment.failure_message = ""
            payment.retryable_until = None
            payment.metadata = invoice_payload
            payment.save(update_fields=[
                "status",
                "failure_code",
                "failure_message",
                "retryable_until",
                "metadata",
                "updated_at",
            ])
        _record_invoice_transaction(
            invoice,
            payment,
            invoice_payload,
            BillingTransaction.Status.POSTED,
            initiator=initiator,
        )
    return InvoiceSyncResult(invoice=invoice, payment=payment)


def process_invoice_payment_failed_event(invoice_payload: Dict[str, Any], initiator=None) -> InvoiceSyncResult:
    with transaction.atomic():
        invoice = _upsert_invoice(invoice_payload, initiator=initiator)
        payment = _upsert_payment(invoice, invoice_payload, initiator=initiator)
        if payment:
            payment.status = PaymentRecord.Status.FAILED
            payment.failure_message = _extract_failure_reason(invoice_payload)
            payment.retryable_until = timezone.now() + RETRY_WINDOW
            payment.metadata = invoice_payload
            payment.save(update_fields=[
                "status",
                "failure_message",
                "retryable_until",
                "metadata",
                "updated_at",
            ])
        _record_invoice_transaction(
            invoice,
            payment,
            invoice_payload,
            BillingTransaction.Status.PENDING,
            initiator=initiator,
        )
    return InvoiceSyncResult(invoice=invoice, payment=payment)


def process_invoice_created_event(invoice_payload: Dict[str, Any], initiator=None) -> InvoiceSyncResult:
    with transaction.atomic():
        invoice = _upsert_invoice(invoice_payload, initiator=initiator)
        payment = _upsert_payment(invoice, invoice_payload, initiator=initiator)
        _record_invoice_transaction(
            invoice,
            payment,
            invoice_payload,
            BillingTransaction.Status.PENDING,
            initiator=initiator,
        )
    return InvoiceSyncResult(invoice=invoice, payment=payment)
