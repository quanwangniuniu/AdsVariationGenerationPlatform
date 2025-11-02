"""Billing models for credit/token accounting, webhook logging, and subscriptions."""
import uuid
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from workspace.models import Workspace

User = get_user_model()


def _default_currency() -> str:
    """Resolve default billing currency from settings."""
    return getattr(settings, "STRIPE_CURRENCY", "aud").lower()


class TokenAccount(models.Model):
    """Stores the token balance for either a user or a workspace."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="token_account",
        null=True,
        blank=True,
        help_text="Owning user when the account is tied to an individual",
    )
    workspace = models.OneToOneField(
        Workspace,
        on_delete=models.CASCADE,
        related_name="token_account",
        null=True,
        blank=True,
        help_text="Owning workspace when the account is shared across a team",
    )
    balance = models.IntegerField(
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Current available token balance",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "billing_token_account"
        verbose_name = "Token account"
        verbose_name_plural = "Token accounts"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                check=Q(user__isnull=False, workspace__isnull=True)
                | Q(user__isnull=True, workspace__isnull=False),
                name="token_account_owner_xor",
            ),
            models.CheckConstraint(
                check=Q(balance__gte=0),
                name="token_account_balance_non_negative",
            ),
        ]

    def clean(self):
        super().clean()
        has_user = self.user is not None
        has_workspace = self.workspace is not None
        if has_user == has_workspace:
            raise ValidationError("TokenAccount must be linked to exactly one owner (user or workspace).")
        if self.balance is not None and self.balance < 0:
            raise ValidationError("TokenAccount balance cannot be negative.")

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        owner = self.user or self.workspace
        return f"TokenAccount<{owner}>"


class TokenTransaction(models.Model):
    """Immutable audit trail for all token balance changes."""

    class TransactionType(models.TextChoices):
        PURCHASE = "PURCHASE", "Purchase"
        CONSUME = "CONSUME", "Consume"
        ADJUSTMENT = "ADJUSTMENT", "Adjustment"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    account = models.ForeignKey(
        TokenAccount,
        on_delete=models.CASCADE,  # Changed from PROTECT to allow workspace deletion
        related_name="transactions",
        help_text="Token account affected by this transaction",
    )
    amount = models.IntegerField(
        help_text="Signed token amount; positive for credits, negative for debits",
    )
    type = models.CharField(
        max_length=20,
        choices=TransactionType.choices,
        help_text="Categorisation of the token movement",
    )
    description = models.TextField(
        blank=True,
        help_text="Optional human-readable context for the transaction",
    )
    idempotency_key = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Unique key to guarantee idempotent transaction writes",
    )
    stripe_payment_id = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Stripe payment intent/session identifier when applicable",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "billing_token_transaction"
        verbose_name = "Token transaction"
        verbose_name_plural = "Token transactions"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(check=~Q(amount=0), name="token_transaction_non_zero"),
            models.UniqueConstraint(
                fields=["idempotency_key"],
                condition=Q(idempotency_key__isnull=False),
                name="unique_token_transaction_idempotency_key",
            ),
            models.UniqueConstraint(
                fields=["stripe_payment_id"],
                condition=Q(stripe_payment_id__isnull=False),
                name="unique_token_transaction_stripe_payment_id",
            ),
        ]

    def save(self, *args, **kwargs):
        if self.pk and TokenTransaction.objects.filter(pk=self.pk).exists():
            raise ValidationError("TokenTransaction records are immutable and cannot be updated.")
        self.full_clean()
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("TokenTransaction records are immutable and cannot be deleted.")

    def __str__(self):
        return f"TokenTransaction<{self.type}:{self.amount} for {self.account_id}>"


class UserBillingProfile(models.Model):
    """User-scoped Stripe billing profile and cached balances."""

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="billing_profile",
        help_text="User owning this billing profile.",
    )
    stripe_customer_id = models.CharField(
        max_length=255,
        blank=True,
        help_text="Stripe customer identifier tied to this user.",
    )
    default_payment_method_id = models.CharField(
        max_length=255,
        blank=True,
        help_text="Last known default payment method id.",
    )
    credit_balance = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Cached customer balance (credits positive).",
    )
    last_synced_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp of the most recent balance sync with Stripe.",
    )
    last_stripe_balance = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Most recent Stripe-reported balance for reconciliation.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "billing_user_profile"
        verbose_name = "User billing profile"
        verbose_name_plural = "User billing profiles"
        ordering = ["user__id"]

    def __str__(self):
        return f"UserBillingProfile<{self.user_id}>"

    @classmethod
    def get_or_create_for_user(cls, user: User) -> "UserBillingProfile":
        """Ensure a billing profile exists for the given user."""
        profile, _ = cls.objects.get_or_create(user=user)
        return profile


class CreditAccount(models.Model):
    """Workspace-level credit ledger mirroring Stripe customer balances."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.OneToOneField(
        Workspace,
        on_delete=models.CASCADE,
        related_name="credit_account",
        help_text="Workspace that owns this credit balance.",
    )
    stripe_customer_id = models.CharField(
        max_length=255,
        unique=True,
        blank=True,
        null=True,
        help_text="Associated Stripe customer identifier, if available.",
    )
    balance = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Locally tracked Stripe customer balance (credits positive).",
    )
    currency = models.CharField(
        max_length=10,
        default=_default_currency,
        help_text="ISO-4217 currency code for the account balance.",
    )
    last_synced_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp of the most recent balance sync with Stripe.",
    )
    last_stripe_balance = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Most recent Stripe-reported balance for reconciliation.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "billing_credit_account"
        verbose_name = "Credit account"
        verbose_name_plural = "Credit accounts"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["stripe_customer_id"], name="credit_account_stripe_idx"),
        ]

    def clean(self):
        super().clean()
        if self.currency and len(self.currency) > 10:
            raise ValidationError("Currency code must be <= 10 characters.")

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"CreditAccount<{self.workspace_id}>"


class CreditTransaction(models.Model):
    """Immutable log of credit movements tied to Stripe events."""

    class TransactionType(models.TextChoices):
        STRIPE_CHARGE = "stripe_charge", "Stripe Charge"
        STRIPE_PRORATION = "stripe_proration", "Stripe Proration"
        MANUAL_ADJUSTMENT = "manual_adjustment", "Manual Adjustment"
        REFUND = "refund", "Refund"
        SYNC = "sync", "Balance Sync Adjustment"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    credit_account = models.ForeignKey(
        CreditAccount,
        on_delete=models.CASCADE,
        related_name="transactions",
        help_text="Credit account affected by this transaction.",
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Signed amount; positive credits customer, negative debits customer.",
    )
    type = models.CharField(
        max_length=32,
        choices=TransactionType.choices,
        help_text="Categorisation of the credit movement.",
    )
    stripe_transaction_id = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Stripe invoice/charge id tied to this transaction, if applicable.",
    )
    stripe_event_id = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Stripe webhook event id that triggered this transaction.",
    )
    idempotency_key = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Deterministic key ensuring idempotent writes.",
    )
    description = models.TextField(
        blank=True,
        help_text="Human-readable explanation of the transaction.",
    )
    metadata = models.JSONField(
        blank=True,
        null=True,
        help_text="Optional structured metadata captured alongside the transaction.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "billing_credit_transaction"
        verbose_name = "Credit transaction"
        verbose_name_plural = "Credit transactions"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                check=~Q(amount=0),
                name="credit_transaction_non_zero_amount",
            ),
            models.UniqueConstraint(
                fields=["idempotency_key"],
                condition=Q(idempotency_key__isnull=False),
                name="unique_credit_transaction_idempotency",
            ),
            models.UniqueConstraint(
                fields=["stripe_transaction_id"],
                condition=Q(stripe_transaction_id__isnull=False),
                name="unique_credit_transaction_stripe",
            ),
        ]
        indexes = [
            models.Index(fields=["stripe_event_id"], name="credit_tx_event_idx"),
            models.Index(fields=["created_at"], name="credit_tx_created_idx"),
        ]

    def clean(self):
        super().clean()
        if self.amount == 0:
            raise ValidationError("Amount must be non-zero.")

    def save(self, *args, **kwargs):
        if self.pk and CreditTransaction.objects.filter(pk=self.pk).exists():
            raise ValidationError("CreditTransaction records are immutable.")
        self.full_clean()
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("CreditTransaction records are immutable.")

    def __str__(self):
        return f"CreditTransaction<{self.type}:{self.amount} for {self.credit_account_id}>"


class UserCreditTransaction(models.Model):
    """Immutable credit movement log for user billing profiles."""

    class TransactionType(models.TextChoices):
        STRIPE_CHARGE = "stripe_charge", "Stripe Charge"
        STRIPE_PRORATION = "stripe_proration", "Stripe Proration"
        MANUAL_ADJUSTMENT = "manual_adjustment", "Manual Adjustment"
        REFUND = "refund", "Refund"
        SYNC = "sync", "Balance Sync Adjustment"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile = models.ForeignKey(
        UserBillingProfile,
        on_delete=models.CASCADE,
        related_name="credit_transactions",
        help_text="User billing profile affected by this credit movement.",
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Signed amount; positive credits customer, negative debits customer.",
    )
    type = models.CharField(
        max_length=32,
        choices=TransactionType.choices,
        help_text="Categorisation of the credit movement.",
    )
    stripe_transaction_id = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Stripe invoice/charge id tied to this transaction, if applicable.",
    )
    stripe_event_id = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Stripe webhook event id that triggered this transaction.",
    )
    idempotency_key = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Deterministic key ensuring idempotent writes.",
    )
    description = models.TextField(
        blank=True,
        help_text="Human-readable explanation of the transaction.",
    )
    metadata = models.JSONField(
        blank=True,
        null=True,
        help_text="Optional structured metadata captured alongside the transaction.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "billing_user_credit_transaction"
        verbose_name = "User credit transaction"
        verbose_name_plural = "User credit transactions"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                check=~Q(amount=0),
                name="user_credit_transaction_non_zero_amount",
            ),
            models.UniqueConstraint(
                fields=["idempotency_key"],
                condition=Q(idempotency_key__isnull=False),
                name="user_credit_transaction_idempotency",
            ),
            models.UniqueConstraint(
                fields=["stripe_transaction_id"],
                condition=Q(stripe_transaction_id__isnull=False),
                name="user_credit_transaction_stripe",
            ),
        ]
        indexes = [
            models.Index(fields=["stripe_event_id"], name="user_credit_tx_event_idx"),
            models.Index(fields=["created_at"], name="user_credit_tx_created_idx"),
        ]

    def clean(self):
        super().clean()
        if self.amount == 0:
            raise ValidationError("Amount must be non-zero.")

    def save(self, *args, **kwargs):
        if self.pk and UserCreditTransaction.objects.filter(pk=self.pk).exists():
            raise ValidationError("UserCreditTransaction records are immutable.")
        self.full_clean()
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("UserCreditTransaction records are immutable.")

    def __str__(self):
        return f"UserCreditTransaction<{self.type}:{self.amount} for {self.profile_id}>"


class WebhookEventLog(models.Model):
    """Keeps track of processed webhook events to guarantee idempotency."""

    class Status(models.TextChoices):
        RECEIVED = "received", "Received"
        PROCESSING = "processing", "Processing"
        PROCESSED = "processed", "Processed"
        IGNORED = "ignored", "Ignored"
        FAILED = "failed", "Failed"

    id = models.BigAutoField(primary_key=True)
    event_id = models.CharField(max_length=255, unique=True)
    idempotency_key = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Deterministic key to guard downstream handlers.",
    )
    payload_hash = models.CharField(
        max_length=64,
        blank=True,
        help_text="SHA256 of the raw payload for drift detection.",
    )
    event_type = models.CharField(max_length=255, blank=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.RECEIVED,
    )
    last_error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    handled = models.BooleanField(
        default=False,
        help_text="True once the event has been fully processed.",
    )
    processed_at = models.DateTimeField(null=True, blank=True)
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="webhook_events",
        help_text="Workspace resolved for this event when available.",
    )

    class Meta:
        db_table = "billing_webhook_event_log"
        verbose_name = "Webhook event log"
        verbose_name_plural = "Webhook event logs"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status"], name="webhook_event_status_idx"),
            models.Index(fields=["event_type"], name="webhook_event_type_idx"),
        ]

    def __str__(self):
        return f"WebhookEventLog<{self.event_id}:{self.status}>"


class BillingAuditLog(models.Model):
    """Structured audit log for key billing lifecycle events."""

    id = models.BigAutoField(primary_key=True)
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name="billing_audit_logs",
        help_text="Workspace associated with the event.",
    )
    event_type = models.CharField(max_length=100, help_text="Classification of the billing event.")
    stripe_id = models.CharField(
        max_length=255,
        blank=True,
        help_text="Stripe object identifier tied to the event.",
    )
    actor = models.CharField(
        max_length=255,
        blank=True,
        help_text="Auth user or system actor responsible.",
    )
    request_id = models.CharField(
        max_length=255,
        blank=True,
        help_text="Correlation or request identifier for tracing.",
    )
    details = models.JSONField(
        blank=True,
        null=True,
        help_text="Structured data describing the event.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "billing_audit_log"
        verbose_name = "Billing audit log"
        verbose_name_plural = "Billing audit logs"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["workspace", "event_type"], name="billing_audit_ws_event_idx"),
            models.Index(fields=["stripe_id"], name="billing_audit_stripe_idx"),
        ]

    def __str__(self):
        return f"BillingAuditLog<{self.workspace_id}:{self.event_type}>"


class BillingEventDeadLetter(models.Model):
    """Persist Stripe events that could not be processed after retries."""

    id = models.BigAutoField(primary_key=True)
    event_id = models.CharField(max_length=255, unique=True)
    event_type = models.CharField(max_length=255, blank=True)
    payload = models.JSONField(help_text="Raw event payload that failed processing.")
    failure_reason = models.TextField(help_text="Summary of why handling failed.")
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="billing_dead_letter_events",
        help_text="Workspace inferred from the payload when possible.",
    )
    retry_count = models.PositiveIntegerField(default=0)
    last_attempt_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Most recent attempt timestamp.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "billing_event_dead_letter"
        verbose_name = "Billing dead-letter event"
        verbose_name_plural = "Billing dead-letter events"
        ordering = ["-created_at"]

    def __str__(self):
        return f"BillingEventDeadLetter<{self.event_id}>"


class WorkspacePlan(models.Model):
    """Describes subscription plans and their resource limits for workspaces."""

    #Free/Basic/Pro/Enterprise
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    stripe_product_id = models.CharField(max_length=100, blank=True, null=True)#Null for free plan
    description = models.TextField(help_text="Summary of plan features and intended use cases")
    monthly_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        help_text="Monthly subscription price in billing currency",
    )
    max_users = models.IntegerField(
        validators=[MinValueValidator(1)],
        help_text="Maximum team members allowed under this plan",
    )
    max_storage_gb = models.IntegerField(
        validators=[MinValueValidator(1)],
        help_text="Maximum storage allocation in gigabytes",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "billing_workspace_plan"
        verbose_name = "Workspace plan"
        verbose_name_plural = "Workspace plans"
        ordering = ["monthly_price", "name"]

    def __str__(self):
        return f"WorkspacePlan<{self.name}>"

class WorkspaceSubscription(models.Model):
    """
    Workspace Subscription Management - Connects Workspace and WorkspacePlan

    Manages the subscription status, billing cycle, and Stripe subscription information of a workspace
    """

    workspace = models.OneToOneField(
        Workspace,
        on_delete=models.CASCADE,
        related_name='subscription',
        help_text="Associated workspace"
    )
    plan = models.ForeignKey(
        WorkspacePlan,
        on_delete=models.PROTECT,  # Prevent deleting a plan that is currently in use
        related_name='subscriptions',
        help_text="Current plan in use"
    )
    billing_owner = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="billing_owned_subscriptions",
        help_text="User whose Stripe customer funds this subscription.",
    )

    # Stripe subscription information
    stripe_subscription_id = models.CharField(
        max_length=200,
        blank=True,
        null=True,
        help_text="Stripe subscription ID (empty for free plan)"
    )
    stripe_customer_id = models.CharField(
        max_length=200,
        blank=True,
        null=True,
        help_text="Stripe customer ID"
    )

    # Subscription status
    STATUS_CHOICES = [
        ('active', 'Active'),           # Active state
        ('trialing', 'Trialing'),       # Trial period
        ('past_due', 'Past Due'),       # Overdue, unpaid
        ('canceled', 'Canceled'),       # Subscription canceled
        ('unpaid', 'Unpaid'),           # Unpaid
        ('incomplete', 'Incomplete'),   # Incomplete (payment failed)
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='active',
        help_text="Subscription status"
    )

    class RenewalStatus(models.TextChoices):
        NEVER = "never", "Never Attempted"
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"
        RETRY = "retry", "Retry Scheduled"

    # Time management
    current_period_start = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Start time of the current billing cycle"
    )
    current_period_end = models.DateTimeField(
        null=True,
        blank=True,
        help_text="End time of the current billing cycle"
    )
    trial_end = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Trial end time"
    )
    canceled_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Subscription cancellation time"
    )

    auto_renew_enabled = models.BooleanField(
        default=False,
        help_text="Whether the subscription should renew automatically."
    )
    credit_account = models.ForeignKey(
        CreditAccount,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subscriptions",
        help_text="Linked credit account for quick balance lookups.",
    )
    pending_plan = models.ForeignKey(
        WorkspacePlan,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pending_subscriptions',
        help_text="Target plan scheduled to activate at the next billing period end."
    )
    renewal_attempt_count = models.PositiveIntegerField(
        default=0,
        help_text="Number of consecutive failed renewal attempts."
    )
    last_renewal_attempt_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp of the most recent renewal attempt."
    )
    last_renewal_status = models.CharField(
        max_length=20,
        choices=RenewalStatus.choices,
        default=RenewalStatus.NEVER,
        help_text="Outcome of the most recent renewal attempt."
    )

    # Metadata
    notes = models.TextField(
        blank=True,
        null=True,
        help_text="Admin notes"
    )

    @property
    def is_active(self):
        """Check if the subscription is active"""
        return self.status in ['active', 'trialing']

    @property
    def is_trial(self):
        """Check if the subscription is in trial period."""
        if self.status != "trialing":
            return False
        if not self.trial_end:
            return True
        return self.trial_end > timezone.now()

    @property
    def days_until_renewal(self):
        """Return days remaining until the current period ends."""
        if not self.current_period_end:
            return None
        now = timezone.now()
        if self.current_period_end <= now:
            return 0
        delta = self.current_period_end - now
        return max(delta.days, 0)

    def save(self, *args, **kwargs):
        """
        Sync the workspace’s plan field and limits when saving a subscription
        """
        super().save(*args, **kwargs)

        # Create plan name mapping (WorkspacePlan.name -> workspace.plan)
        plan_name_mapping = {
            'Free': 'free',
            'Basic': 'basic',
            'Pro': 'pro',
            'Professional': 'pro',
            'Enterprise': 'enterprise'
        }

        # Get the corresponding workspace plan string
        workspace_plan_value = plan_name_mapping.get(self.plan.name, 'free')

        # Sync workspace’s plan field
        if self.workspace.plan != workspace_plan_value:
            from workspace.models import Workspace

            # Apply plan limits first
            config = self.workspace.PLAN_CONFIG.get(workspace_plan_value, self.workspace.PLAN_CONFIG['free'])

            # Update the database directly to avoid triggering save signals
            Workspace.objects.filter(pk=self.workspace.pk).update(
                plan=workspace_plan_value,
                max_users=config['max_users'],
                max_storage_gb=config['max_storage_gb']
            )



class PlanChangeRequest(models.Model):
    """
    Plan Change Request - Handles upgrade/downgrade requests

    Records user requests to change subscription plans, supporting immediate effect
    or activation at the start of the next billing cycle
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subscription = models.ForeignKey(
        WorkspaceSubscription,
        on_delete=models.CASCADE,
        related_name='change_requests',
        help_text="Associated subscription"
    )

    # Change details
    from_plan = models.ForeignKey(
        WorkspacePlan,
        on_delete=models.PROTECT,
        related_name='downgrade_requests',
        help_text="Original plan"
    )
    to_plan = models.ForeignKey(
        WorkspacePlan,
        on_delete=models.PROTECT,
        related_name='upgrade_requests',
        help_text="Target plan"
    )

    # Change type
    CHANGE_TYPE_CHOICES = [
        ('upgrade', 'Upgrade'),
        ('downgrade', 'Downgrade'),
        ('change', 'Change'),  # Change to a plan at the same price level
    ]
    change_type = models.CharField(
        max_length=20,
        choices=CHANGE_TYPE_CHOICES,
        help_text="Type of change"
    )

    # Execution timing
    TIMING_CHOICES = [
        ('immediate', 'Immediate'),           # Take effect immediately
        ('end_of_period', 'End of Period'),  # Take effect at the end of the billing cycle
    ]
    effective_timing = models.CharField(
        max_length=20,
        choices=TIMING_CHOICES,
        default='immediate',
        help_text="When the change takes effect"
    )
    effective_date = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Effective date of the plan change"
    )

    # Status management
    STATUS_CHOICES = [
        ('pending', 'Pending'),         # Waiting to be processed
        ('processing', 'Processing'),   # Currently being processed
        ('completed', 'Completed'),     # Successfully completed
        ('failed', 'Failed'),           # Processing failed
        ('canceled', 'Canceled'),       # Request canceled
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
        help_text="Processing status"
    )

    # Requester and processor information
    requested_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='plan_change_requests',
        help_text="User who submitted the request"
    )
    processed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='processed_plan_changes',
        help_text="Admin who processed the request"
    )

    # Timestamps
    requested_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    # Additional information
    reason = models.TextField(
        blank=True,
        null=True,
        help_text="Reason for the change"
    )
    admin_notes = models.TextField(
        blank=True,
        null=True,
        help_text="Admin notes"
    )

    class Meta:
        db_table = "billing_plan_change_request"
        verbose_name = "Plan Change Request"
        verbose_name_plural = "Plan Change Requests"
        ordering = ["-requested_at"]

    def __str__(self):
        return f"PlanChange<{self.from_plan.name} -> {self.to_plan.name}>"



class BillingTransaction(models.Model):
    """Unified immutable transaction view across token, invoice, and refund ledgers."""

    class Category(models.TextChoices):
        TOKEN_PURCHASE = "token_purchase", "Token Purchase"
        TOKEN_CONSUME = "token_consume", "Token Consumption"
        SUBSCRIPTION_INVOICE = "subscription_invoice", "Subscription Invoice"
        CREDIT_ADJUSTMENT = "credit_adjustment", "Credit Adjustment"
        PAYMENT = "payment", "Payment"
        REFUND = "refund", "Refund"
        MANUAL = "manual", "Manual Adjustment"

    class Direction(models.TextChoices):
        CREDIT = "credit", "Credit"
        DEBIT = "debit", "Debit"

    class Status(models.TextChoices):
        POSTED = "posted", "Posted"
        PENDING = "pending", "Pending"
        VOID = "void", "Void"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="billing_transactions",
        help_text="Workspace that owns the transaction when applicable.",
    )
    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="billing_transactions",
        help_text="User responsible for the transaction when scoped to individuals.",
    )
    initiator = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="initiated_billing_transactions",
        help_text="User who initiated the financial event when available.",
    )
    category = models.CharField(
        max_length=40,
        choices=Category.choices,
        help_text="Classification of the transaction.",
    )
    direction = models.CharField(
        max_length=10,
        choices=Direction.choices,
        help_text="Indicates whether the transaction credits or debits the balance.",
    )
    status = models.CharField(
        max_length=12,
        choices=Status.choices,
        default=Status.POSTED,
        help_text="Posting status for reconciliation purposes.",
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
        help_text="Absolute monetary value recorded for the transaction.",
    )
    currency = models.CharField(
        max_length=3,
        default=_default_currency,
        help_text="ISO-4217 currency code (lowercase).",
    )
    source_reference = models.CharField(
        max_length=255,
        blank=True,
        help_text="Deterministic reference to the originating ledger item (Stripe id, token txn id, etc.).",
    )
    token_transaction = models.OneToOneField(
        "TokenTransaction",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="billing_entry",
        help_text="Linked token transaction when applicable.",
    )
    credit_transaction = models.OneToOneField(
        "CreditTransaction",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="billing_entry",
        help_text="Linked credit transaction when applicable.",
    )
    invoice = models.OneToOneField(
        "InvoiceRecord",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="billing_transaction",
        help_text="Linked invoice record when applicable.",
    )
    payment = models.OneToOneField(
        "PaymentRecord",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="billing_transaction",
        help_text="Linked payment record when applicable.",
    )
    refund = models.OneToOneField(
        "RefundRecord",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="billing_transaction",
        help_text="Linked refund record when applicable.",
    )
    description = models.TextField(blank=True)
    metadata = models.JSONField(blank=True, null=True)
    occurred_at = models.DateTimeField(
        help_text="When the underlying financial event took place.",
    )
    archived_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Soft-delete marker for archival workflows.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "billing_transaction"
        verbose_name = "Billing transaction"
        verbose_name_plural = "Billing transactions"
        ordering = ["-occurred_at", "-created_at"]
        indexes = [
            models.Index(fields=["workspace", "-occurred_at"], name="billing_tx_ws_date_idx"),
            models.Index(fields=["category"], name="billing_tx_category_idx"),
            models.Index(fields=["status"], name="billing_tx_status_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                check=~Q(token_transaction__isnull=False, credit_transaction__isnull=False),
                name="billing_tx_single_ledger_source",
            ),
            models.CheckConstraint(
                check=Q(source_reference__gt="")
                | Q(token_transaction__isnull=False)
                | Q(credit_transaction__isnull=False)
                | Q(invoice__isnull=False)
                | Q(payment__isnull=False)
                | Q(refund__isnull=False),
                name="billing_tx_has_reference",
            ),
            models.UniqueConstraint(
                fields=["source_reference"],
                condition=Q(source_reference__gt=""),
                name="billing_tx_source_reference_key",
            ),
        ]

    def clean(self):
        super().clean()
        if self.currency:
            self.currency = self.currency.lower()
        if not self.occurred_at:
            raise ValidationError({"occurred_at": "Occurred at timestamp is required."})
        if self.amount is None or self.amount <= 0:
            raise ValidationError({"amount": "Amount must be greater than zero."})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"BillingTransaction<{self.category}:{self.amount} {self.currency}>"


class InvoiceRecord(models.Model):
    """Local cache of Stripe invoices with workspace scoping."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        OPEN = "open", "Open"
        PAID = "paid", "Paid"
        UNCOLLECTIBLE = "uncollectible", "Uncollectible"
        VOID = "void", "Void"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoice_records",
    )
    stripe_invoice_id = models.CharField(max_length=255, unique=True)
    stripe_customer_id = models.CharField(max_length=255, blank=True)
    initiator = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="initiated_invoices",
        help_text="User who initiated the invoice workflow.",
    )
    status = models.CharField(max_length=20, choices=Status.choices)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    amount_due = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    currency = models.CharField(max_length=3, default=_default_currency)
    hosted_invoice_url = models.CharField(max_length=512, blank=True)
    pdf_storage_path = models.CharField(
        max_length=512,
        blank=True,
        help_text="Internal storage path used for proxying invoice PDFs.",
    )
    issued_at = models.DateTimeField(null=True, blank=True)
    due_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    canceled_at = models.DateTimeField(null=True, blank=True)
    last_payment_attempt_at = models.DateTimeField(null=True, blank=True)
    failure_reason = models.CharField(max_length=255, blank=True)
    metadata = models.JSONField(blank=True, null=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "billing_invoice_record"
        verbose_name = "Invoice record"
        verbose_name_plural = "Invoice records"
        ordering = ["-issued_at", "-created_at"]
        indexes = [
            models.Index(fields=["workspace", "status"], name="billing_invoice_ws_status_idx"),
            models.Index(fields=["issued_at"], name="billing_invoice_issued_idx"),
        ]

    def clean(self):
        super().clean()
        if self.currency:
            self.currency = self.currency.lower()
        if self.amount_due is None:
            self.amount_due = Decimal("0.00")

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"InvoiceRecord<{self.stripe_invoice_id}:{self.status}>"


class PaymentRecord(models.Model):
    """Tracks workspace payment attempts against invoices."""

    class Status(models.TextChoices):
        REQUIRES_PAYMENT_METHOD = "requires_payment_method", "Requires Payment Method"
        REQUIRES_ACTION = "requires_action", "Requires Action"
        PROCESSING = "processing", "Processing"
        SUCCEEDED = "succeeded", "Succeeded"
        FAILED = "failed", "Failed"
        CANCELED = "canceled", "Canceled"
        REFUNDED = "refunded", "Refunded"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(
        InvoiceRecord,
        on_delete=models.CASCADE,
        related_name="payments",
    )
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payment_records",
    )
    initiator = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="initiated_payments",
        help_text="User who initiated this payment attempt.",
    )
    stripe_payment_intent_id = models.CharField(max_length=255, unique=True)
    stripe_charge_id = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=32, choices=Status.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default=_default_currency)
    failure_code = models.CharField(max_length=64, blank=True)
    failure_message = models.CharField(max_length=255, blank=True)
    retryable_until = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp until which automatic retry is permitted.",
    )
    idempotency_key = models.CharField(
        max_length=255,
        blank=True,
        help_text="Deduplication key matching upstream payment attempts.",
    )
    metadata = models.JSONField(blank=True, null=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "billing_payment_record"
        verbose_name = "Payment record"
        verbose_name_plural = "Payment records"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["workspace", "status"], name="billing_payment_ws_status_idx"),
            models.Index(fields=["retryable_until"], name="billing_payment_retry_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["idempotency_key"],
                condition=Q(idempotency_key__gt=""),
                name="billing_payment_idempotency_key",
            )
        ]

    def clean(self):
        super().clean()
        if self.currency:
            self.currency = self.currency.lower()

    def save(self, *args, **kwargs):
        if self.invoice_id and not self.workspace_id:
            self.workspace = self.invoice.workspace
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"PaymentRecord<{self.stripe_payment_intent_id}:{self.status}>"


class RefundRecord(models.Model):
    """Stores refund operations against payments."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SUCCEEDED = "succeeded", "Succeeded"
        FAILED = "failed", "Failed"
        CANCELED = "canceled", "Canceled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment = models.ForeignKey(
        PaymentRecord,
        on_delete=models.CASCADE,
        related_name="refunds",
    )
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="refund_records",
    )
    initiator = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="initiated_refunds",
        help_text="User who requested the refund when applicable.",
    )
    stripe_refund_id = models.CharField(max_length=255, unique=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default=_default_currency)
    status = models.CharField(max_length=16, choices=Status.choices)
    reason = models.CharField(max_length=255, blank=True)
    failure_reason = models.TextField(blank=True)
    actor = models.CharField(
        max_length=255,
        blank=True,
        help_text="Actor or system that initiated the refund.",
    )
    notes = models.TextField(blank=True)
    metadata = models.JSONField(blank=True, null=True)
    idempotency_key = models.CharField(max_length=255, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "billing_refund_record"
        verbose_name = "Refund record"
        verbose_name_plural = "Refund records"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["workspace", "status"], name="billing_refund_ws_status_idx"),
            models.Index(fields=["created_at"], name="billing_refund_created_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["idempotency_key"],
                condition=Q(idempotency_key__gt=""),
                name="billing_refund_idempotency_key",
            )
        ]

    def clean(self):
        super().clean()
        if self.currency:
            self.currency = self.currency.lower()

    def save(self, *args, **kwargs):
        if self.payment_id and not self.workspace_id:
            self.workspace = self.payment.workspace
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"RefundRecord<{self.stripe_refund_id}:{self.status}>"


class BillingIdempotencyKey(models.Model):
    """Stores processed idempotency keys for write endpoints."""

    class Scope(models.TextChoices):
        USER = "user", "User"
        WORKSPACE = "workspace", "Workspace"
        SYSTEM = "system", "System"

    class LastResult(models.TextChoices):
        SUCCESS = "success", "Success"
        FAILURE = "failure", "Failure"
        PENDING = "pending", "Pending"

    id = models.BigAutoField(primary_key=True)
    key = models.CharField(max_length=255, unique=True)
    request_hash = models.CharField(
        max_length=64,
        unique=True,
        help_text="Hash of method, path, and canonical payload.",
    )
    scope = models.CharField(max_length=20, choices=Scope.choices, default=Scope.SYSTEM)
    owner_type = models.CharField(max_length=64, blank=True)
    owner_id = models.CharField(max_length=64, blank=True)
    last_result = models.CharField(
        max_length=20,
        choices=LastResult.choices,
        default=LastResult.PENDING,
    )
    response_code = models.PositiveIntegerField(null=True, blank=True)
    metadata = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "billing_idempotency_key"
        verbose_name = "Billing idempotency key"
        verbose_name_plural = "Billing idempotency keys"
        ordering = ["-last_seen_at"]
        indexes = [
            models.Index(fields=["scope", "owner_type", "owner_id"], name="billing_idempo_owner_idx"),
        ]

    def __str__(self):
        return f"BillingIdempotencyKey<{self.key}>"


