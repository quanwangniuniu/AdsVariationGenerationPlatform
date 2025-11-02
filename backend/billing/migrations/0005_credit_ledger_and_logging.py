import decimal
import uuid

import django.db.models.deletion
from django.db import migrations, models


def seed_credit_accounts(apps, schema_editor):
    Workspace = apps.get_model("workspace", "Workspace")
    CreditAccount = apps.get_model("billing", "CreditAccount")
    WorkspaceSubscription = apps.get_model("billing", "WorkspaceSubscription")

    for workspace in Workspace.objects.all().iterator():
        subscription = WorkspaceSubscription.objects.filter(workspace=workspace).first()
        stripe_customer_id = getattr(subscription, "stripe_customer_id", None)
        CreditAccount.objects.get_or_create(
            workspace=workspace,
            defaults={"stripe_customer_id": stripe_customer_id},
        )


class Migration(migrations.Migration):

    dependencies = [
        ("workspace", "0001_initial"),
        ("billing", "0004_workspace_subscription_auto_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="CreditAccount",
            fields=[
                (
                    "id",
                    models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False),
                ),
                (
                    "stripe_customer_id",
                    models.CharField(blank=True, max_length=255, null=True, unique=True),
                ),
                (
                    "balance",
                    models.DecimalField(
                        decimal_places=2,
                        default=decimal.Decimal("0.00"),
                        help_text="Locally tracked Stripe customer balance (credits positive).",
                        max_digits=12,
                    ),
                ),
                (
                    "currency",
                    models.CharField(
                        default="aud",
                        help_text="ISO-4217 currency code for the account balance.",
                        max_length=10,
                    ),
                ),
                (
                    "last_synced_at",
                    models.DateTimeField(
                        blank=True,
                        help_text="Timestamp of the most recent balance sync with Stripe.",
                        null=True,
                    ),
                ),
                (
                    "last_stripe_balance",
                    models.DecimalField(
                        decimal_places=2,
                        default=decimal.Decimal("0.00"),
                        help_text="Most recent Stripe-reported balance for reconciliation.",
                        max_digits=12,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "workspace",
                    models.OneToOneField(
                        help_text="Workspace that owns this credit balance.",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="credit_account",
                        to="workspace.workspace",
                    ),
                ),
            ],
            options={
                "db_table": "billing_credit_account",
                "ordering": ["-created_at"],
                "verbose_name": "Credit account",
                "verbose_name_plural": "Credit accounts",
                "indexes": [
                    models.Index(fields=["stripe_customer_id"], name="credit_account_stripe_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="BillingAuditLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("event_type", models.CharField(help_text="Classification of the billing event.", max_length=100)),
                (
                    "stripe_id",
                    models.CharField(blank=True, help_text="Stripe object identifier tied to the event.", max_length=255),
                ),
                (
                    "actor",
                    models.CharField(blank=True, help_text="Auth user or system actor responsible.", max_length=255),
                ),
                (
                    "request_id",
                    models.CharField(blank=True, help_text="Correlation or request identifier for tracing.", max_length=255),
                ),
                (
                    "details",
                    models.JSONField(
                        blank=True,
                        help_text="Structured data describing the event.",
                        null=True,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "workspace",
                    models.ForeignKey(
                        help_text="Workspace associated with the event.",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="billing_audit_logs",
                        to="workspace.workspace",
                    ),
                ),
            ],
            options={
                "db_table": "billing_audit_log",
                "ordering": ["-created_at"],
                "verbose_name": "Billing audit log",
                "verbose_name_plural": "Billing audit logs",
                "indexes": [
                    models.Index(fields=["workspace", "event_type"], name="billing_audit_ws_event_idx"),
                    models.Index(fields=["stripe_id"], name="billing_audit_stripe_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="BillingEventDeadLetter",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("event_id", models.CharField(max_length=255, unique=True)),
                ("event_type", models.CharField(blank=True, max_length=255)),
                ("payload", models.JSONField(help_text="Raw event payload that failed processing.")),
                ("failure_reason", models.TextField(help_text="Summary of why handling failed.")),
                ("retry_count", models.PositiveIntegerField(default=0)),
                (
                    "last_attempt_at",
                    models.DateTimeField(
                        blank=True,
                        help_text="Most recent attempt timestamp.",
                        null=True,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "workspace",
                    models.ForeignKey(
                        blank=True,
                        help_text="Workspace inferred from the payload when possible.",
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="billing_dead_letter_events",
                        to="workspace.workspace",
                    ),
                ),
            ],
            options={
                "db_table": "billing_event_dead_letter",
                "ordering": ["-created_at"],
                "verbose_name": "Billing dead-letter event",
                "verbose_name_plural": "Billing dead-letter events",
            },
        ),
        migrations.CreateModel(
            name="CreditTransaction",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "amount",
                    models.DecimalField(
                        decimal_places=2,
                        help_text="Signed amount; positive credits customer, negative debits customer.",
                        max_digits=12,
                    ),
                ),
                (
                    "type",
                    models.CharField(
                        choices=[
                            ("stripe_charge", "Stripe Charge"),
                            ("stripe_proration", "Stripe Proration"),
                            ("manual_adjustment", "Manual Adjustment"),
                            ("refund", "Refund"),
                            ("sync", "Balance Sync Adjustment"),
                        ],
                        help_text="Categorisation of the credit movement.",
                        max_length=32,
                    ),
                ),
                (
                    "stripe_transaction_id",
                    models.CharField(
                        blank=True,
                        help_text="Stripe invoice/charge id tied to this transaction, if applicable.",
                        max_length=255,
                        null=True,
                    ),
                ),
                (
                    "stripe_event_id",
                    models.CharField(
                        blank=True,
                        help_text="Stripe webhook event id that triggered this transaction.",
                        max_length=255,
                        null=True,
                    ),
                ),
                (
                    "idempotency_key",
                    models.CharField(
                        blank=True,
                        help_text="Deterministic key ensuring idempotent writes.",
                        max_length=255,
                        null=True,
                    ),
                ),
                (
                    "description",
                    models.TextField(
                        blank=True,
                        help_text="Human-readable explanation of the transaction.",
                    ),
                ),
                (
                    "metadata",
                    models.JSONField(
                        blank=True,
                        help_text="Optional structured metadata captured alongside the transaction.",
                        null=True,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "credit_account",
                    models.ForeignKey(
                        help_text="Credit account affected by this transaction.",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="transactions",
                        to="billing.creditaccount",
                    ),
                ),
            ],
            options={
                "db_table": "billing_credit_transaction",
                "ordering": ["-created_at"],
                "verbose_name": "Credit transaction",
                "verbose_name_plural": "Credit transactions",
                "indexes": [
                    models.Index(fields=["stripe_event_id"], name="credit_tx_event_idx"),
                    models.Index(fields=["created_at"], name="credit_tx_created_idx"),
                ],
            },
        ),
        migrations.AddConstraint(
            model_name="credittransaction",
            constraint=models.CheckConstraint(
                check=~models.Q(amount=0),
                name="credit_transaction_non_zero_amount",
            ),
        ),
        migrations.AddConstraint(
            model_name="credittransaction",
            constraint=models.UniqueConstraint(
                condition=models.Q(idempotency_key__isnull=False),
                fields=["idempotency_key"],
                name="unique_credit_transaction_idempotency",
            ),
        ),
        migrations.AddConstraint(
            model_name="credittransaction",
            constraint=models.UniqueConstraint(
                condition=models.Q(stripe_transaction_id__isnull=False),
                fields=["stripe_transaction_id"],
                name="unique_credit_transaction_stripe",
            ),
        ),
        migrations.AddField(
            model_name="workspacesubscription",
            name="credit_account",
            field=models.ForeignKey(
                blank=True,
                help_text="Linked credit account for quick balance lookups.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="subscriptions",
                to="billing.creditaccount",
            ),
        ),
        migrations.AddField(
            model_name="webhookeventlog",
            name="handled",
            field=models.BooleanField(
                default=False,
                help_text="True once the event has been fully processed.",
            ),
        ),
        migrations.AddField(
            model_name="webhookeventlog",
            name="idempotency_key",
            field=models.CharField(
                blank=True,
                help_text="Deterministic key to guard downstream handlers.",
                max_length=255,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="webhookeventlog",
            name="payload_hash",
            field=models.CharField(
                blank=True,
                help_text="SHA256 of the raw payload for drift detection.",
                max_length=64,
            ),
        ),
        migrations.AddField(
            model_name="webhookeventlog",
            name="workspace",
            field=models.ForeignKey(
                blank=True,
                help_text="Workspace resolved for this event when available.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="webhook_events",
                to="workspace.workspace",
            ),
        ),
        migrations.AddIndex(
            model_name="webhookeventlog",
            index=models.Index(fields=["status"], name="webhook_event_status_idx"),
        ),
        migrations.AddIndex(
            model_name="webhookeventlog",
            index=models.Index(fields=["event_type"], name="webhook_event_type_idx"),
        ),
        migrations.RunPython(seed_credit_accounts, migrations.RunPython.noop),
    ]
