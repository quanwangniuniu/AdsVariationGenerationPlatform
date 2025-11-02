"""Middleware enforcing Idempotency-Key semantics for billing write operations."""
from __future__ import annotations

import hashlib
import json
from typing import Iterable, Optional

from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin

from billing.models import BillingIdempotencyKey


IDEMPOTENCY_REQUIRED_PATH_FRAGMENTS: tuple[str, ...] = (
    "/api/billing/payments/",
    "/api/workspaces/",
)


class BillingIdempotencyMiddleware(MiddlewareMixin):
    """Require Idempotency-Key for billing payment write operations."""

    def _requires_idempotency(self, request) -> bool:
        if request.method.upper() != "POST":
            return False
        path = request.path
        if "/payments/" not in path:
            return False
        return any(fragment in path for fragment in IDEMPOTENCY_REQUIRED_PATH_FRAGMENTS)

    def process_request(self, request):
        if not self._requires_idempotency(request):
            request._billing_idempotency_record = None  # type: ignore[attr-defined]
            return None

        key = request.headers.get("Idempotency-Key")
        if not key:
            return self._error_response(
                status=400,
                code="missing_idempotency_key",
                message="Idempotency-Key header is required for this operation.",
            )

        payload_hash = self._hash_request(request, key)

        try:
            record, created = BillingIdempotencyKey.objects.get_or_create(
                key=key,
                defaults={
                    "request_hash": payload_hash,
                    "scope": BillingIdempotencyKey.Scope.SYSTEM,
                    "metadata": {},
                },
            )
        except BillingIdempotencyKey.MultipleObjectsReturned:
            # Should not happen under unique constraint but handle defensively.
            return self._error_response(
                status=409,
                code="idempotency_conflict",
                message="Conflicting idempotency keys detected.",
            )

        if not created and record.request_hash != payload_hash:
            return self._error_response(
                status=409,
                code="idempotency_conflict",
                message="Idempotency-Key has been used with a different request payload.",
            )

        if not created and record.last_result == BillingIdempotencyKey.LastResult.SUCCESS:
            return self._error_response(
                status=409,
                code="duplicate_request",
                message="This request has already been processed successfully.",
                details={"response_code": record.response_code},
            )

        record.scope = BillingIdempotencyKey.Scope.SYSTEM
        record.last_result = BillingIdempotencyKey.LastResult.PENDING
        record.save(update_fields=["scope", "last_result", "last_seen_at"])

        request._billing_idempotency_record = record  # type: ignore[attr-defined]
        return None

    def process_response(self, request, response):
        record = getattr(request, "_billing_idempotency_record", None)
        if record:
            status_family = 200 <= response.status_code < 300
            record.last_result = (
                BillingIdempotencyKey.LastResult.SUCCESS if status_family
                else BillingIdempotencyKey.LastResult.FAILURE
            )
            record.response_code = response.status_code
            record.save(update_fields=["last_result", "response_code", "last_seen_at"])
        return response

    @staticmethod
    def _hash_request(request, key: str) -> str:
        body_bytes = request.body or b""
        digest = hashlib.sha256()
        digest.update(request.method.upper().encode("utf-8"))
        digest.update(b"|")
        digest.update(request.get_full_path().encode("utf-8"))
        digest.update(b"|")
        digest.update(body_bytes)
        digest.update(b"|")
        digest.update(key.encode("utf-8"))
        return digest.hexdigest()

    @staticmethod
    def _error_response(*, status: int, code: str, message: str, details: Optional[dict] = None):
        payload = {
            "code": code,
            "message": message,
            "details": details or {},
        }
        return JsonResponse(payload, status=status)
