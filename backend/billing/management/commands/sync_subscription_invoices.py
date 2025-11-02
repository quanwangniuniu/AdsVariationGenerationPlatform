"""Management command to sync missing invoices for subscriptions."""
from django.core.management.base import BaseCommand
from django.db import transaction
import stripe
from billing.models import WorkspaceSubscription, InvoiceRecord
from billing.services.stripe_payments import _configure_stripe
from billing.services.payments import process_invoice_paid_event
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Sync missing invoices and transactions for active subscriptions"

    def add_arguments(self, parser):
        parser.add_argument(
            '--workspace-id',
            type=str,
            help='Specific workspace ID to sync (optional)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview what would be synced without making changes',
        )

    def handle(self, *args, **options):
        workspace_id = options.get('workspace_id')
        dry_run = options.get('dry_run', False)

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN MODE - No changes will be made"))

        try:
            _configure_stripe()
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Failed to configure Stripe: {e}"))
            return

        # Get subscriptions that need syncing
        subscriptions = WorkspaceSubscription.objects.filter(
            status='active',
            stripe_subscription_id__isnull=False,
        ).exclude(stripe_subscription_id='')

        if workspace_id:
            subscriptions = subscriptions.filter(workspace_id=workspace_id)

        self.stdout.write(f"Found {subscriptions.count()} active subscriptions to check")

        synced_count = 0
        error_count = 0

        for sub in subscriptions:
            try:
                self.stdout.write(f"\nChecking subscription {sub.id} for workspace {sub.workspace_id}")
                self.stdout.write(f"  Stripe subscription: {sub.stripe_subscription_id}")

                # Fetch the Stripe subscription
                stripe_sub = stripe.Subscription.retrieve(
                    sub.stripe_subscription_id,
                    expand=['latest_invoice', 'latest_invoice.payment_intent']
                )

                latest_invoice_id = stripe_sub.get('latest_invoice')
                if isinstance(latest_invoice_id, str):
                    invoice_id = latest_invoice_id
                elif isinstance(latest_invoice_id, dict):
                    invoice_id = latest_invoice_id.get('id')
                else:
                    self.stdout.write(self.style.WARNING(f"  No invoice found for subscription"))
                    continue

                # Check if we already have this invoice
                existing = InvoiceRecord.objects.filter(
                    stripe_invoice_id=invoice_id
                ).first()

                if existing:
                    self.stdout.write(f"  ✓ Invoice {invoice_id} already exists")
                    continue

                self.stdout.write(self.style.SUCCESS(f"  → Missing invoice {invoice_id}"))

                if not dry_run:
                    # Fetch full invoice data
                    invoice_data = stripe.Invoice.retrieve(invoice_id)
                    invoice_dict = invoice_data.to_dict_recursive()

                    # Get initiator from subscription's billing owner
                    initiator = sub.billing_owner

                    # Process the invoice
                    with transaction.atomic():
                        result = process_invoice_paid_event(invoice_dict, initiator=initiator)
                        self.stdout.write(self.style.SUCCESS(
                            f"  ✓ Created invoice {result.invoice.id}"
                        ))
                        if result.payment:
                            self.stdout.write(self.style.SUCCESS(
                                f"  ✓ Created payment {result.payment.id}"
                            ))
                        synced_count += 1
                else:
                    self.stdout.write("  (skipped - dry run)")

            except stripe.error.StripeError as e:
                error_count += 1
                self.stdout.write(self.style.ERROR(f"  ✗ Stripe error: {e}"))
                logger.error(f"Stripe error syncing subscription {sub.id}: {e}", exc_info=True)
            except Exception as e:
                error_count += 1
                self.stdout.write(self.style.ERROR(f"  ✗ Error: {e}"))
                logger.error(f"Error syncing subscription {sub.id}: {e}", exc_info=True)

        self.stdout.write("\n" + "="*50)
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN COMPLETE"))
        else:
            self.stdout.write(self.style.SUCCESS(f"Synced {synced_count} invoices"))
        if error_count:
            self.stdout.write(self.style.ERROR(f"Encountered {error_count} errors"))
