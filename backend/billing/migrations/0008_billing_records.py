import billing.models
from decimal import Decimal
import uuid

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("workspace", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("billing", "0007_rename_workspaceplan_stripe_price_id_to_stripe_product_id"),
    ]

    operations = [
        migrations.CreateModel(
            name="InvoiceRecord",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "stripe_invoice_id",
                    models.CharField(max_length=255, unique=True),
                ),
                ("stripe_customer_id", models.CharField(blank=True, max_length=255)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("draft", "Draft"),
                            ("open", "Open"),
                            ("paid", "Paid"),
                            ("uncollectible", "Uncollectible"),
                            ("void", "Void"),
                        ],
                        max_length=20,
                    ),
                ),
                ("total_amount", models.DecimalField(decimal_places=2, max_digits=12)),
                (
                    "amount_due",
                    models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12),
                ),
                ("currency", models.CharField(default=billing.models._default_currency, max_length=3)),
                ("hosted_invoice_url", models.CharField(blank=True, max_length=512)),
                (
                    "pdf_storage_path",
                    models.CharField(
                        blank=True,
                        help_text="Internal storage path used for proxying invoice PDFs.",
                        max_length=512,
                    ),
                ),
                ("issued_at", models.DateTimeField(blank=True, null=True)),
                ("due_at", models.DateTimeField(blank=True, null=True)),
                ("paid_at", models.DateTimeField(blank=True, null=True)),
                ("canceled_at", models.DateTimeField(blank=True, null=True)),
                ("last_payment_attempt_at", models.DateTimeField(blank=True, null=True)),
                ("failure_reason", models.CharField(blank=True, max_length=255)),
                ("metadata", models.JSONField(blank=True, null=True)),
                ("archived_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "workspace",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="invoice_records",
                        to="workspace.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Invoice record",
                "verbose_name_plural": "Invoice records",
                "db_table": "billing_invoice_record",
                "ordering": ["-issued_at", "-created_at"],
            },
        ),
        migrations.CreateModel(
            name="BillingIdempotencyKey",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("key", models.CharField(max_length=255, unique=True)),
                ("request_hash", models.CharField(max_length=64, unique=True)),
                (
                    "scope",
                    models.CharField(
                        choices=[("user", "User"), ("workspace", "Workspace"), ("system", "System")],
                        default="system",
                        max_length=20,
                    ),
                ),
                ("owner_type", models.CharField(blank=True, max_length=64)),
                ("owner_id", models.CharField(blank=True, max_length=64)),
                (
                    "last_result",
                    models.CharField(
                        choices=[("success", "Success"), ("failure", "Failure"), ("pending", "Pending")],
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("response_code", models.PositiveIntegerField(blank=True, null=True)),
                ("metadata", models.JSONField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("last_seen_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Billing idempotency key",
                "verbose_name_plural": "Billing idempotency keys",
                "db_table": "billing_idempotency_key",
                "ordering": ["-last_seen_at"],
            },
        ),
        migrations.CreateModel(
            name="PaymentRecord",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "stripe_payment_intent_id",
                    models.CharField(max_length=255, unique=True),
                ),
                ("stripe_charge_id", models.CharField(blank=True, max_length=255)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("requires_payment_method", "Requires Payment Method"),
                            ("requires_action", "Requires Action"),
                            ("processing", "Processing"),
                            ("succeeded", "Succeeded"),
                            ("failed", "Failed"),
                            ("canceled", "Canceled"),
                            ("refunded", "Refunded"),
                        ],
                        max_length=32,
                    ),
                ),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                ("currency", models.CharField(default=billing.models._default_currency, max_length=3)),
                ("failure_code", models.CharField(blank=True, max_length=64)),
                ("failure_message", models.CharField(blank=True, max_length=255)),
                (
                    "retryable_until",
                    models.DateTimeField(
                        blank=True,
                        help_text="Timestamp until which automatic retry is permitted.",
                        null=True,
                    ),
                ),
                (
                    "idempotency_key",
                    models.CharField(
                        blank=True,
                        help_text="Deduplication key matching upstream payment attempts.",
                        max_length=255,
                    ),
                ),
                ("metadata", models.JSONField(blank=True, null=True)),
                ("archived_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "invoice",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="payments",
                        to="billing.invoicerecord",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="payment_records",
                        to="workspace.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Payment record",
                "verbose_name_plural": "Payment records",
                "db_table": "billing_payment_record",
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="RefundRecord",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "stripe_refund_id",
                    models.CharField(max_length=255, unique=True),
                ),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                ("currency", models.CharField(default=billing.models._default_currency, max_length=3)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("succeeded", "Succeeded"),
                            ("failed", "Failed"),
                            ("canceled", "Canceled"),
                        ],
                        max_length=16,
                    ),
                ),
                ("reason", models.CharField(blank=True, max_length=255)),
                ("failure_reason", models.TextField(blank=True)),
                (
                    "actor",
                    models.CharField(
                        blank=True,
                        help_text="Actor or system that initiated the refund.",
                        max_length=255,
                    ),
                ),
                ("notes", models.TextField(blank=True)),
                ("metadata", models.JSONField(blank=True, null=True)),
                ("idempotency_key", models.CharField(blank=True, max_length=255)),
                ("processed_at", models.DateTimeField(blank=True, null=True)),
                ("archived_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "payment",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="refunds",
                        to="billing.paymentrecord",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="refund_records",
                        to="workspace.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Refund record",
                "verbose_name_plural": "Refund records",
                "db_table": "billing_refund_record",
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="BillingTransaction",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "category",
                    models.CharField(
                        choices=[
                            ("token_purchase", "Token Purchase"),
                            ("token_consume", "Token Consumption"),
                            ("subscription_invoice", "Subscription Invoice"),
                            ("credit_adjustment", "Credit Adjustment"),
                            ("payment", "Payment"),
                            ("refund", "Refund"),
                            ("manual", "Manual Adjustment"),
                        ],
                        max_length=40,
                    ),
                ),
                (
                    "direction",
                    models.CharField(
                        choices=[("credit", "Credit"), ("debit", "Debit")],
                        max_length=10,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[("posted", "Posted"), ("pending", "Pending"), ("void", "Void")],
                        default="posted",
                        max_length=12,
                    ),
                ),
                (
                    "amount",
                    models.DecimalField(
                        decimal_places=2,
                        max_digits=12,
                        validators=[MinValueValidator(Decimal("0.01"))],
                    ),
                ),
                ("currency", models.CharField(default=billing.models._default_currency, max_length=3)),
                (
                    "source_reference",
                    models.CharField(
                        blank=True,
                        help_text="Deterministic reference to the originating ledger item (Stripe id, token txn id, etc.).",
                        max_length=255,
                    ),
                ),
                ("description", models.TextField(blank=True)),
                ("metadata", models.JSONField(blank=True, null=True)),
                ("occurred_at", models.DateTimeField()),
                ("archived_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "credit_transaction",
                    models.OneToOneField(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="billing_entry",
                        to="billing.credittransaction",
                    ),
                ),
                (
                    "invoice",
                    models.OneToOneField(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="billing_transaction",
                        to="billing.invoicerecord",
                    ),
                ),
                (
                    "payment",
                    models.OneToOneField(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="billing_transaction",
                        to="billing.paymentrecord",
                    ),
                ),
                (
                    "refund",
                    models.OneToOneField(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="billing_transaction",
                        to="billing.refundrecord",
                    ),
                ),
                (
                    "token_transaction",
                    models.OneToOneField(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="billing_entry",
                        to="billing.tokentransaction",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="billing_transactions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="billing_transactions",
                        to="workspace.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Billing transaction",
                "verbose_name_plural": "Billing transactions",
                "db_table": "billing_transaction",
                "ordering": ["-occurred_at", "-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="invoicerecord",
            index=models.Index(fields=["workspace", "status"], name="billing_invoice_ws_status_idx"),
        ),
        migrations.AddIndex(
            model_name="invoicerecord",
            index=models.Index(fields=["issued_at"], name="billing_invoice_issued_idx"),
        ),
        migrations.AddIndex(
            model_name="billingidempotencykey",
            index=models.Index(fields=["scope", "owner_type", "owner_id"], name="billing_idempo_owner_idx"),
        ),
        migrations.AddIndex(
            model_name="paymentrecord",
            index=models.Index(fields=["workspace", "status"], name="billing_payment_ws_status_idx"),
        ),
        migrations.AddIndex(
            model_name="paymentrecord",
            index=models.Index(fields=["retryable_until"], name="billing_payment_retry_idx"),
        ),
        migrations.AddIndex(
            model_name="refundrecord",
            index=models.Index(fields=["workspace", "status"], name="billing_refund_ws_status_idx"),
        ),
        migrations.AddIndex(
            model_name="refundrecord",
            index=models.Index(fields=["created_at"], name="billing_refund_created_idx"),
        ),
        migrations.AddIndex(
            model_name="billingtransaction",
            index=models.Index(fields=["workspace", "-occurred_at"], name="billing_tx_ws_date_idx"),
        ),
        migrations.AddIndex(
            model_name="billingtransaction",
            index=models.Index(fields=["category"], name="billing_tx_category_idx"),
        ),
        migrations.AddIndex(
            model_name="billingtransaction",
            index=models.Index(fields=["status"], name="billing_tx_status_idx"),
        ),
        migrations.AddConstraint(
            model_name="paymentrecord",
            constraint=models.UniqueConstraint(
                condition=models.Q(("idempotency_key__gt", "")),
                fields=("idempotency_key",),
                name="billing_payment_idempotency_key",
            ),
        ),
        migrations.AddConstraint(
            model_name="refundrecord",
            constraint=models.UniqueConstraint(
                condition=models.Q(("idempotency_key__gt", "")),
                fields=("idempotency_key",),
                name="billing_refund_idempotency_key",
            ),
        ),
        migrations.AddConstraint(
            model_name="billingtransaction",
            constraint=models.CheckConstraint(
                check=(
                    models.Q(("credit_transaction__isnull", True))
                    | models.Q(("token_transaction__isnull", True))
                ),
                name="billing_tx_single_ledger_source",
            ),
        ),
        migrations.AddConstraint(
            model_name="billingtransaction",
            constraint=models.UniqueConstraint(
                condition=models.Q(("source_reference__gt", "")),
                fields=("source_reference",),
                name="billing_tx_source_reference_key",
            ),
        ),
        migrations.AddConstraint(
            model_name="billingtransaction",
            constraint=models.CheckConstraint(
                check=(
                    models.Q(("source_reference__gt", ""))
                    | models.Q(("token_transaction__isnull", False))
                    | models.Q(("credit_transaction__isnull", False))
                    | models.Q(("invoice__isnull", False))
                    | models.Q(("payment__isnull", False))
                    | models.Q(("refund__isnull", False))
                ),
                name="billing_tx_has_reference",
            ),
        ),
    ]
