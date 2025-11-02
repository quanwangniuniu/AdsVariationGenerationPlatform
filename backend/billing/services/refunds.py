"""Utilities for recording refund operations locally."""
from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict

from django.db import transaction
from django.utils import timezone

from billing.models import BillingTransaction, PaymentRecord, RefundRecord


def record_refund(
    *,
    payment: PaymentRecord,
    amount: Decimal,
    currency: str,
    reason: str,
    payload: Dict[str, Any],
    initiator=None,
) -> RefundRecord:
    stripe_refund_id = payload.get("id") or f"manual-{payment.id}-{timezone.now().timestamp()}"
    status = (payload.get("status") or RefundRecord.Status.PENDING).lower()
    normalized_currency = (currency or payment.currency).lower()
    metadata = payload or {}

    with transaction.atomic():
        refund, created = RefundRecord.objects.get_or_create(
            stripe_refund_id=stripe_refund_id,
            defaults={
                "payment": payment,
                "workspace": payment.workspace,
                "amount": amount,
                "currency": normalized_currency,
                "status": status,
                "reason": reason,
                "metadata": metadata,
                "initiator": initiator or payment.initiator,
            },
        )
        if not created:
            refund.payment = payment
            refund.workspace = payment.workspace
            refund.amount = amount
            refund.currency = normalized_currency
            refund.status = status
            refund.reason = reason
            refund.metadata = metadata
            if initiator:
                refund.initiator = initiator
            refund.save(update_fields=[
                "payment",
                "workspace",
                "amount",
                "currency",
                "status",
                "reason",
                "metadata",
                "initiator",
                "updated_at",
            ])

        billing_tx_defaults = {
            "workspace": payment.workspace,
            "user": initiator or payment.initiator,
            "initiator": initiator or payment.initiator,
            "category": BillingTransaction.Category.REFUND,
            "direction": BillingTransaction.Direction.CREDIT,
            "status": BillingTransaction.Status.POSTED,
            "amount": amount,
            "currency": normalized_currency,
            "refund": refund,
            "source_reference": refund.stripe_refund_id,
            "description": "Stripe refund",
            "metadata": metadata,
            "occurred_at": refund.created_at,
        }

        existing_billing_tx = getattr(refund, "billing_transaction", None)
        if existing_billing_tx:
            for field, value in billing_tx_defaults.items():
                setattr(existing_billing_tx, field, value)
            existing_billing_tx.save()
        else:
            BillingTransaction.objects.create(**billing_tx_defaults)

        if status == RefundRecord.Status.SUCCEEDED and amount >= payment.amount:
            payment.status = PaymentRecord.Status.REFUNDED
            payment.save(update_fields=["status", "updated_at"])

    return refund
