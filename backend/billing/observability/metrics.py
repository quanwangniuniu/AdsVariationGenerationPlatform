"""Prometheus metrics helpers for billing domain."""
from __future__ import annotations

from prometheus_client import Counter, Histogram

BILLING_REQUEST_COUNT = Counter(
    "billing_request_total",
    "Number of billing API requests",
    labelnames=("endpoint", "method", "status"),
)

BILLING_REQUEST_LATENCY = Histogram(
    "billing_request_duration_seconds",
    "Latency of billing API requests",
    labelnames=("endpoint", "method"),
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2, 5),
)

PAYMENT_SUCCESS_COUNT = Counter(
    "billing_payment_success_total",
    "Count of successful payment attempts",
    labelnames=("workspace_id",),
)

PAYMENT_FAILURE_COUNT = Counter(
    "billing_payment_failure_total",
    "Count of failed payment attempts",
    labelnames=("workspace_id", "reason"),
)

WEBHOOK_BACKLOG = Counter(
    "billing_webhook_dead_letter_total",
    "Total dead-lettered Stripe webhook events",
    labelnames=("event_type",),
)
