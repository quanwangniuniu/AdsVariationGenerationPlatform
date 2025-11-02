"""FilterSet definitions for billing endpoints."""
from __future__ import annotations

import django_filters
from django.db.models import Q

from billing.models import BillingTransaction, InvoiceRecord, PaymentRecord, RefundRecord, BillingAuditLog, WebhookEventLog


class BillingTransactionFilter(django_filters.FilterSet):
    category = django_filters.CharFilter(field_name="category", lookup_expr="iexact")
    status = django_filters.CharFilter(field_name="status", lookup_expr="iexact")
    direction = django_filters.CharFilter(field_name="direction", lookup_expr="iexact")
    currency = django_filters.CharFilter(field_name="currency", lookup_expr="iexact")
    occurred_after = django_filters.DateTimeFilter(field_name="occurred_at", lookup_expr="gte")
    occurred_before = django_filters.DateTimeFilter(field_name="occurred_at", lookup_expr="lte")
    workspace_id = django_filters.UUIDFilter(field_name="workspace_id")

    class Meta:
        model = BillingTransaction
        fields = ["category", "status", "direction", "currency", "workspace_id"]


class InvoiceRecordFilter(django_filters.FilterSet):
    status = django_filters.CharFilter(field_name="status", lookup_expr="iexact")
    currency = django_filters.CharFilter(field_name="currency", lookup_expr="iexact")
    issued_after = django_filters.DateTimeFilter(field_name="issued_at", lookup_expr="gte")
    issued_before = django_filters.DateTimeFilter(field_name="issued_at", lookup_expr="lte")
    due_before = django_filters.DateTimeFilter(field_name="due_at", lookup_expr="lte")
    workspace_id = django_filters.UUIDFilter(field_name="workspace_id")

    class Meta:
        model = InvoiceRecord
        fields = ["status", "currency", "workspace_id"]


class PaymentRecordFilter(django_filters.FilterSet):
    status = django_filters.CharFilter(field_name="status", lookup_expr="iexact")
    currency = django_filters.CharFilter(field_name="currency", lookup_expr="iexact")
    workspace_id = django_filters.UUIDFilter(field_name="workspace_id")

    class Meta:
        model = PaymentRecord
        fields = ["status", "currency", "workspace_id"]


class RefundRecordFilter(django_filters.FilterSet):
    status = django_filters.CharFilter(field_name="status", lookup_expr="iexact")
    currency = django_filters.CharFilter(field_name="currency", lookup_expr="iexact")
    workspace_id = django_filters.UUIDFilter(field_name="workspace_id")

    class Meta:
        model = RefundRecord
        fields = ["status", "currency", "workspace_id"]


class BillingAuditLogFilter(django_filters.FilterSet):
    event_type = django_filters.CharFilter(field_name="event_type", lookup_expr="iexact")
    created_after = django_filters.DateTimeFilter(field_name="created_at", lookup_expr="gte")
    created_before = django_filters.DateTimeFilter(field_name="created_at", lookup_expr="lte")

    class Meta:
        model = BillingAuditLog
        fields = ["event_type"]


class WebhookEventLogFilter(django_filters.FilterSet):
    status = django_filters.CharFilter(field_name="status", lookup_expr="iexact")
    event_type = django_filters.CharFilter(field_name="event_type", lookup_expr="iexact")
    created_after = django_filters.DateTimeFilter(field_name="created_at", lookup_expr="gte")
    created_before = django_filters.DateTimeFilter(field_name="created_at", lookup_expr="lte")

    class Meta:
        model = WebhookEventLog
        fields = ["status", "event_type"]
