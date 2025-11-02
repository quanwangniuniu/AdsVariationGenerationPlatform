"""Stripe webhook endpoint for processing billing events."""
from __future__ import annotations

import hashlib
import logging
from typing import Optional, Tuple

from django.db import transaction
from django.http import HttpResponse
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.response import Response
from rest_framework.views import APIView

from billing.models import WebhookEventLog
from billing.services.stripe_payments import (
    StripeConfigurationError,
    StripeServiceError,
    StripeWebhookSignatureError,
    parse_event,
)
from billing.tasks import process_stripe_event_async

logger = logging.getLogger(__name__)


@method_decorator(csrf_exempt, name="dispatch")
class StripeWebhookView(APIView):
    """Receive Stripe webhook events and enqueue them for asynchronous processing."""

    authentication_classes = []
    permission_classes = []
    http_method_names = ["post"]

    def post(self, request, *args, **kwargs):  # noqa: D401 - DRF signature
        sig_header = request.headers.get("Stripe-Signature")
        payload = self._decode_payload(request.body)
        if payload is None:
            logger.error("Unable to decode Stripe webhook payload.")
            return HttpResponse(status=400)

        try:
            event = parse_event(payload=payload, sig_header=sig_header or "")
        except StripeWebhookSignatureError:
            logger.warning("Stripe webhook signature verification failed.")
            return HttpResponse(status=400)
        except StripeConfigurationError as exc:
            logger.error("Stripe webhook configuration error: %s", exc)
            return HttpResponse(status=500)
        except StripeServiceError as exc:
            logger.warning("Stripe webhook rejected due to malformed payload: %s", exc)
            return HttpResponse(status=400)

        event_dict = event.to_dict_recursive() if hasattr(event, "to_dict_recursive") else dict(event)
        event_id = event_dict.get("id")
        event_type = event_dict.get("type")

        payload_hash = hashlib.sha256((payload or "").encode("utf-8")).hexdigest() if payload else ""

        log_entry, already_processed = _record_event_receipt(event_id, event_type, payload_hash)
        if already_processed:
            logger.info(
                "Stripe event %s (%s) already handled with status=%s.",
                event_id,
                event_type,
                log_entry.status if log_entry else "unknown",
            )
            return Response({"status": log_entry.status}, status=200)

        process_stripe_event_async.delay(event_dict)
        logger.info("Queued Stripe event %s (%s) for processing.", event_id, event_type)
        return Response({"status": "queued"}, status=202)

    @staticmethod
    def _decode_payload(body: bytes) -> Optional[str]:
        if not body:
            return ""
        try:
            return body.decode("utf-8")
        except UnicodeDecodeError:
            return None


def _record_event_receipt(event_id: Optional[str], event_type: Optional[str], payload_hash: str) -> Tuple[Optional[WebhookEventLog], bool]:
    """Create or update the webhook log to reflect reception of an event."""

    if not event_id:
        logger.warning("Received Stripe event without identifier; proceeding without idempotency log.")
        return None, False

    with transaction.atomic():
        log_entry = WebhookEventLog.objects.select_for_update().filter(event_id=event_id).first()
        if log_entry:
            if log_entry.handled:
                return log_entry, True

            log_entry.event_type = event_type or log_entry.event_type
            log_entry.status = WebhookEventLog.Status.RECEIVED
            log_entry.last_error = ""
            log_entry.processed_at = None
            if payload_hash:
                log_entry.payload_hash = payload_hash
            if not log_entry.idempotency_key:
                log_entry.idempotency_key = event_id
            log_entry.handled = False
            log_entry.save(update_fields=["event_type", "status", "last_error", "processed_at", "payload_hash", "idempotency_key", "handled"])
            return log_entry, False

        log_entry = WebhookEventLog.objects.create(
            event_id=event_id,
            event_type=event_type or "",
            status=WebhookEventLog.Status.RECEIVED,
            payload_hash=payload_hash or "",
            idempotency_key=event_id,
        )
        return log_entry, False
