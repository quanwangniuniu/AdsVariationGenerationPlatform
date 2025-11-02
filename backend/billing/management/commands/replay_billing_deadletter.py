"""Management command to replay billing dead-letter Stripe events."""
from __future__ import annotations

from typing import Iterable, Optional

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from billing.models import BillingEventDeadLetter
from billing.tasks import HandlerResult, process_stripe_event_async


class Command(BaseCommand):
    help = "Replay stored billing dead-letter events through the normal processing pipeline."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--event-id",
            dest="event_ids",
            action="append",
            help="Replay only the specified Stripe event id. Can be supplied multiple times.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Maximum number of events to replay in this run.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview events that would be replayed without performing any changes.",
        )

    def handle(self, *args, **options) -> None:
        event_ids: Optional[Iterable[str]] = options.get("event_ids")
        limit: Optional[int] = options.get("limit")
        dry_run: bool = options.get("dry_run")

        queryset = BillingEventDeadLetter.objects.order_by("created_at")
        if event_ids:
            queryset = queryset.filter(event_id__in=list(event_ids))

        if limit is not None:
            queryset = queryset[:limit]

        total = queryset.count()
        if total == 0:
            self.stdout.write(self.style.WARNING("No dead-letter events matched the requested filters."))
            return

        processed = 0
        failed = 0

        for dead_letter in queryset:
            self.stdout.write(f"Replaying Stripe event {dead_letter.event_id}")
            if dry_run:
                continue

            payload = dict(dead_letter.payload or {})
            payload.setdefault("id", dead_letter.event_id)
            payload.setdefault("type", dead_letter.event_type)

            result = process_stripe_event_async.run(payload)
            status = result.get("status")

            if status in {HandlerResult.PROCESSED, HandlerResult.IGNORED}:
                dead_letter.delete()
                processed += 1
            else:
                failed += 1
                dead_letter.retry_count += 1
                dead_letter.last_attempt_at = timezone.now()
                dead_letter.failure_reason = result.get("detail") or result.get("status") or "replay_failed"
                dead_letter.save(update_fields=["retry_count", "last_attempt_at", "failure_reason"])

        if dry_run:
            self.stdout.write(
                self.style.WARNING(f"Dry run complete. {total} events would be replayed.")
            )
            return

        summary = f"Replay complete: {processed} succeeded, {failed} failed, {total} total."
        if failed:
            raise CommandError(summary)
        self.stdout.write(self.style.SUCCESS(summary))
