from decimal import Decimal
import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0011_user_billing_profile_and_initiators"),
    ]

    operations = [
        migrations.AddField(
            model_name="userbillingprofile",
            name="last_synced_at",
            field=models.DateTimeField(blank=True, help_text="Timestamp of the most recent balance sync with Stripe.", null=True),
        ),
        migrations.AddField(
            model_name="userbillingprofile",
            name="last_stripe_balance",
            field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), help_text="Most recent Stripe-reported balance for reconciliation.", max_digits=12),
        ),
        migrations.CreateModel(
            name="UserCreditTransaction",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("amount", models.DecimalField(decimal_places=2, help_text="Signed amount; positive credits customer, negative debits customer.", max_digits=12)),
                ("type", models.CharField(choices=[("stripe_charge", "Stripe Charge"), ("stripe_proration", "Stripe Proration"), ("manual_adjustment", "Manual Adjustment"), ("refund", "Refund"), ("sync", "Balance Sync Adjustment")], help_text="Categorisation of the credit movement.", max_length=32)),
                ("stripe_transaction_id", models.CharField(blank=True, help_text="Stripe invoice/charge id tied to this transaction, if applicable.", max_length=255, null=True)),
                ("stripe_event_id", models.CharField(blank=True, help_text="Stripe webhook event id that triggered this transaction.", max_length=255, null=True)),
                ("idempotency_key", models.CharField(blank=True, help_text="Deterministic key ensuring idempotent writes.", max_length=255, null=True)),
                ("description", models.TextField(blank=True, help_text="Human-readable explanation of the transaction.")),
                ("metadata", models.JSONField(blank=True, help_text="Optional structured metadata captured alongside the transaction.", null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("profile", models.ForeignKey(help_text="User billing profile affected by this credit movement.", on_delete=models.deletion.CASCADE, related_name="credit_transactions", to="billing.userbillingprofile")),
            ],
            options={
                "db_table": "billing_user_credit_transaction",
                "ordering": ["-created_at"],
                "verbose_name": "User credit transaction",
                "verbose_name_plural": "User credit transactions",
                "constraints": [
                    models.CheckConstraint(check=~models.Q(amount=0), name="user_credit_transaction_non_zero_amount"),
                    models.UniqueConstraint(condition=models.Q(idempotency_key__isnull=False), fields=["idempotency_key"], name="user_credit_transaction_idempotency"),
                    models.UniqueConstraint(condition=models.Q(stripe_transaction_id__isnull=False), fields=["stripe_transaction_id"], name="user_credit_transaction_stripe"),
                ],
                "indexes": [
                    models.Index(fields=["stripe_event_id"], name="user_credit_tx_event_idx"),
                    models.Index(fields=["created_at"], name="user_credit_tx_created_idx"),
                ],
            },
        ),
    ]
