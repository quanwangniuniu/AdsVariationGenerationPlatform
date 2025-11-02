from django.contrib import admin
from django.urls import reverse
from django.utils.html import format_html

from .models import (
    BillingAuditLog,
    BillingEventDeadLetter,
    BillingIdempotencyKey,
    BillingTransaction,
    CreditAccount,
    CreditTransaction,
    InvoiceRecord,
    PaymentRecord,
    PlanChangeRequest,
    RefundRecord,
    TokenAccount,
    TokenTransaction,
    UserBillingProfile,
    UserCreditTransaction,
    WebhookEventLog,
    WorkspacePlan,
    WorkspaceSubscription,
)


@admin.register(TokenAccount)
class TokenAccountAdmin(admin.ModelAdmin):
    """Expose token account ownership and balances."""

    list_display = ("id", "owner_display", "balance", "created_at", "updated_at")
    search_fields = (
        "id",
        "user__username",
        "user__email",
        "workspace__name",
        "workspace__owner__username",
    )
    list_filter = ("created_at", "updated_at")
    readonly_fields = ("owner_display", "created_at", "updated_at")
    ordering = ("-created_at",)
    list_select_related = ("user", "workspace")
    raw_id_fields = ("user", "workspace")

    fieldsets = (
        ("Ownership", {"fields": ("owner_display", "user", "workspace")}),
        ("Balance", {"fields": ("balance",)}),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )

    @admin.display(description="Owner")
    def owner_display(self, obj):
        if obj.user:
            full_name = obj.user.get_full_name()
            label = full_name or obj.user.username
            return f"User: {label}"
        if obj.workspace:
            return f"Workspace: {obj.workspace.name}"
        return "-"


@admin.register(TokenTransaction)
class TokenTransactionAdmin(admin.ModelAdmin):
    """Read-only audit trail for token movements."""

    list_display = (
        "id",
        "account_link",
        "type",
        "amount",
        "created_at",
        "idempotency_key",
        "stripe_payment_id",
    )
    search_fields = (
        "id",
        "account__id",
        "idempotency_key",
        "stripe_payment_id",
    )
    list_filter = ("type", "created_at")
    readonly_fields = (
        "id",
        "account",
        "amount",
        "type",
        "description",
        "idempotency_key",
        "stripe_payment_id",
        "created_at",
    )
    ordering = ("-created_at",)
    list_select_related = ("account",)
    raw_id_fields = ("account",)

    fieldsets = (
        (
            "Transaction Details",
            {
                "fields": (
                    "id",
                    "account",
                    "type",
                    "amount",
                    "description",
                    "idempotency_key",
                    "stripe_payment_id",
                    "created_at",
                )
            },
        ),
    )

    @admin.display(description="Account")
    def account_link(self, obj):
        url = reverse("admin:billing_tokenaccount_change", args=[obj.account.pk])
        return format_html('<a href="{}">{}</a>', url, obj.account_id)

    def has_add_permission(self, request):
        return False


@admin.register(UserBillingProfile)
class UserBillingProfileAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "stripe_customer_id",
        "credit_balance",
        "last_synced_at",
        "updated_at",
    )
    search_fields = (
        "user__username",
        "user__email",
        "stripe_customer_id",
    )
    list_filter = ("last_synced_at", "updated_at")
    readonly_fields = (
        "created_at",
        "updated_at",
        "last_synced_at",
        "last_stripe_balance",
    )
    ordering = ("user__username",)
    list_select_related = ("user",)


@admin.register(UserCreditTransaction)
class UserCreditTransactionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "profile",
        "type",
        "amount",
        "stripe_transaction_id",
        "created_at",
    )
    search_fields = (
        "id",
        "profile__user__username",
        "profile__user__email",
        "stripe_transaction_id",
        "stripe_event_id",
        "idempotency_key",
    )
    list_filter = ("type", "created_at")
    readonly_fields = (
        "id",
        "profile",
        "amount",
        "type",
        "stripe_transaction_id",
        "stripe_event_id",
        "idempotency_key",
        "description",
        "metadata",
        "created_at",
    )
    ordering = ("-created_at",)
    list_select_related = ("profile", "profile__user")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(CreditAccount)
class CreditAccountAdmin(admin.ModelAdmin):
    """Expose workspace credit balances mirrored from Stripe."""

    list_display = (
        "workspace_link",
        "stripe_customer_id",
        "balance",
        "currency",
        "last_synced_at",
        "updated_at",
    )
    search_fields = ("workspace__name", "workspace__owner__username", "stripe_customer_id")
    list_filter = ("currency", "last_synced_at")
    readonly_fields = ("created_at", "updated_at", "last_synced_at", "last_stripe_balance")
    ordering = ("-updated_at",)
    list_select_related = ("workspace", "workspace__owner")
    raw_id_fields = ("workspace",)

    fieldsets = (
        (
            "Workspace",
            {"fields": ("workspace", "stripe_customer_id")},
        ),
        (
            "Balance",
            {
                "fields": (
                    "balance",
                    "currency",
                    "last_stripe_balance",
                    "last_synced_at",
                )
            },
        ),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )

    @admin.display(description="Workspace")
    def workspace_link(self, obj):
        url = reverse("admin:workspace_workspace_change", args=[obj.workspace.pk])
        return format_html('<a href="{}">{}</a>', url, obj.workspace.name)


@admin.register(CreditTransaction)
class CreditTransactionAdmin(admin.ModelAdmin):
    """Read-only audit log for credit ledger movements."""

    list_display = (
        "id",
        "credit_account_link",
        "type",
        "amount",
        "stripe_event_id",
        "stripe_transaction_id",
        "idempotency_key",
        "created_at",
    )
    search_fields = (
        "id",
        "credit_account__workspace__name",
        "stripe_event_id",
        "stripe_transaction_id",
        "idempotency_key",
    )
    list_filter = ("type", "created_at")
    readonly_fields = (
        "credit_account",
        "amount",
        "type",
        "description",
        "stripe_event_id",
        "stripe_transaction_id",
        "idempotency_key",
        "metadata",
        "created_at",
    )
    ordering = ("-created_at",)
    list_select_related = ("credit_account", "credit_account__workspace")
    raw_id_fields = ("credit_account",)

    fieldsets = (
        (
            "Transaction",
            {
                "fields": (
                    "credit_account",
                    "type",
                    "amount",
                    "description",
                    "metadata",
                )
            },
        ),
        (
            "Identifiers",
            {
                "fields": (
                    "stripe_event_id",
                    "stripe_transaction_id",
                    "idempotency_key",
                )
            },
        ),
        ("Timestamps", {"fields": ("created_at",)}),
    )

    @admin.display(description="Credit Account")
    def credit_account_link(self, obj):
        url = reverse("admin:billing_creditaccount_change", args=[obj.credit_account.pk])
        return format_html('<a href="{}">{}</a>', url, obj.credit_account.workspace.name)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(BillingTransaction)
class BillingTransactionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "category",
        "direction",
        "status",
        "amount",
        "currency",
        "workspace",
        "user",
        "occurred_at",
    )
    search_fields = (
        "id",
        "workspace__name",
        "user__username",
        "source_reference",
    )
    list_filter = ("category", "direction", "status", "currency")
    readonly_fields = tuple(
        field.name for field in BillingTransaction._meta.fields  # type: ignore[attr-defined]
    )
    ordering = ("-occurred_at",)
    list_select_related = ("workspace", "user", "initiator")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(InvoiceRecord)
class InvoiceRecordAdmin(admin.ModelAdmin):
    list_display = (
        "stripe_invoice_id",
        "workspace",
        "status",
        "total_amount",
        "amount_due",
        "issued_at",
    )
    search_fields = (
        "stripe_invoice_id",
        "workspace__name",
        "stripe_customer_id",
    )
    list_filter = ("status", "currency")
    readonly_fields = tuple(
        field.name for field in InvoiceRecord._meta.fields  # type: ignore[attr-defined]
    )
    ordering = ("-issued_at", "-created_at")
    list_select_related = ("workspace", "initiator")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(PaymentRecord)
class PaymentRecordAdmin(admin.ModelAdmin):
    list_display = (
        "stripe_payment_intent_id",
        "invoice",
        "workspace",
        "status",
        "amount",
        "currency",
        "created_at",
    )
    search_fields = (
        "stripe_payment_intent_id",
        "stripe_charge_id",
        "workspace__name",
        "invoice__stripe_invoice_id",
    )
    list_filter = ("status", "currency")
    readonly_fields = tuple(
        field.name for field in PaymentRecord._meta.fields  # type: ignore[attr-defined]
    )
    ordering = ("-created_at",)
    list_select_related = ("workspace", "invoice", "initiator")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(RefundRecord)
class RefundRecordAdmin(admin.ModelAdmin):
    list_display = (
        "stripe_refund_id",
        "payment",
        "workspace",
        "status",
        "amount",
        "currency",
        "created_at",
    )
    search_fields = (
        "stripe_refund_id",
        "payment__stripe_payment_intent_id",
        "workspace__name",
    )
    list_filter = ("status", "currency")
    readonly_fields = tuple(
        field.name for field in RefundRecord._meta.fields  # type: ignore[attr-defined]
    )
    ordering = ("-created_at",)
    list_select_related = ("workspace", "payment", "initiator")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(WebhookEventLog)
class WebhookEventLogAdmin(admin.ModelAdmin):
    """Monitor webhook processing progress and failures."""

    list_display = (
        "event_id",
        "event_type",
        "status",
        "handled",
        "workspace_display",
        "created_at",
        "processed_at",
        "last_error_short",
    )
    search_fields = ("event_id", "event_type", "idempotency_key", "workspace__name")
    list_filter = ("status", "handled", "created_at", "processed_at")
    readonly_fields = (
        "event_id",
        "event_type",
        "status",
        "idempotency_key",
        "payload_hash",
        "workspace",
        "created_at",
        "processed_at",
        "last_error",
    )
    ordering = ("-created_at",)

    fieldsets = (
        (
            "Event",
            {"fields": ("event_id", "event_type", "status", "handled")},
        ),
        (
            "Idempotency",
            {"fields": ("idempotency_key", "payload_hash", "workspace")},
        ),
        (
            "Processing",
            {"fields": ("last_error", "created_at", "processed_at")},
        ),
    )

    @admin.display(description="Workspace")
    def workspace_display(self, obj):
        if not obj.workspace_id:
            return "-"
        url = reverse("admin:workspace_workspace_change", args=[obj.workspace_id])
        return format_html('<a href="{}">{}</a>', url, obj.workspace.name)

    @admin.display(description="Last Error")
    def last_error_short(self, obj):
        if not obj.last_error:
            return "-"
        snippet = obj.last_error.strip().splitlines()[0]
        if len(snippet) > 120:
            snippet = f"{snippet[:117]}..."
        return snippet


@admin.register(BillingAuditLog)
class BillingAuditLogAdmin(admin.ModelAdmin):
    """Audit log explorer for billing lifecycle events."""

    list_display = (
        "workspace_link",
        "event_type",
        "stripe_id",
        "actor",
        "created_at",
    )
    search_fields = ("event_type", "stripe_id", "workspace__name", "actor", "request_id")
    list_filter = ("event_type", "created_at")
    readonly_fields = ("workspace", "event_type", "stripe_id", "actor", "request_id", "details", "created_at")
    ordering = ("-created_at",)
    raw_id_fields = ("workspace",)

    fieldsets = (
        (
            "Event",
            {"fields": ("workspace", "event_type", "actor", "request_id")},
        ),
        (
            "Stripe",
            {"fields": ("stripe_id",)},
        ),
        (
            "Details",
            {"fields": ("details", "created_at")},
        ),
    )

    @admin.display(description="Workspace")
    def workspace_link(self, obj):
        url = reverse("admin:workspace_workspace_change", args=[obj.workspace_id])
        return format_html('<a href="{}">{}</a>', url, obj.workspace.name)


@admin.register(BillingEventDeadLetter)
class BillingEventDeadLetterAdmin(admin.ModelAdmin):
    """Allow support to inspect and replay failed webhook events."""

    list_display = (
        "event_id",
        "event_type",
        "workspace_link",
        "retry_count",
        "last_attempt_at",
        "created_at",
    )
    search_fields = ("event_id", "event_type", "workspace__name")
    list_filter = ("event_type", "retry_count", "created_at")
    readonly_fields = (
        "event_id",
        "event_type",
        "payload",
        "failure_reason",
        "workspace",
        "retry_count",
        "last_attempt_at",
        "created_at",
    )
    ordering = ("-created_at",)
    raw_id_fields = ("workspace",)

    fieldsets = (
        (
            "Event",
            {"fields": ("event_id", "event_type", "workspace", "retry_count", "last_attempt_at", "created_at")},
        ),
        (
            "Payload",
            {"fields": ("payload", "failure_reason")},
        ),
    )

    @admin.display(description="Workspace")
    def workspace_link(self, obj):
        if not obj.workspace_id:
            return "-"
        url = reverse("admin:workspace_workspace_change", args=[obj.workspace_id])
        return format_html('<a href="{}">{}</a>', url, obj.workspace.name)


@admin.register(BillingIdempotencyKey)
class BillingIdempotencyKeyAdmin(admin.ModelAdmin):
    list_display = (
        "key",
        "scope",
        "owner_type",
        "owner_id",
        "last_result",
        "response_code",
        "last_seen_at",
    )
    search_fields = ("key", "owner_type", "owner_id", "request_hash")
    list_filter = ("scope", "last_result")
    readonly_fields = tuple(
        field.name for field in BillingIdempotencyKey._meta.fields  # type: ignore[attr-defined]
    )
    ordering = ("-last_seen_at",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(WorkspacePlan)
class WorkspacePlanAdmin(admin.ModelAdmin):
    """Manage subscription plan catalog."""

    list_display = (
        "name",
        "monthly_price",
        "max_users",
        "max_storage_gb",
        "created_at",
        "updated_at",
    )
    search_fields = ("name", "description", "stripe_product_id")
    list_filter = ("created_at", "updated_at")
    ordering = ("monthly_price", "name")
    readonly_fields = ("created_at", "updated_at")

    fieldsets = (
        ("Plan Details", {"fields": ("name", "description", "stripe_product_id")}),
        (
            "Pricing & Limits",
            {"fields": ("monthly_price", "max_users", "max_storage_gb")},
        ),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )


@admin.register(WorkspaceSubscription)
class WorkspaceSubscriptionAdmin(admin.ModelAdmin):
    """Admin interface for workspace subscription lifecycle."""

    list_display = (
        "workspace_link",
        "plan",
        "status",
        "is_active_display",
        "current_period_start",
        "current_period_end",
        "auto_renew_enabled",
        "credit_account_link",
        "pending_plan",
    )
    search_fields = (
        "workspace__name",
        "workspace__owner__username",
        "stripe_subscription_id",
        "stripe_customer_id",
        "credit_account__stripe_customer_id",
    )
    list_filter = (
        "status",
        "auto_renew_enabled",
        "plan",
        "pending_plan",
    )
    readonly_fields = (
        "current_period_start",
        "current_period_end",
        "trial_end",
        "canceled_at",
        "renewal_attempt_count",
        "last_renewal_attempt_at",
        "last_renewal_status",
    )
    ordering = ("-current_period_start",)
    list_select_related = ("workspace", "workspace__owner", "plan", "pending_plan", "credit_account")
    raw_id_fields = ("workspace", "plan", "pending_plan", "credit_account")

    fieldsets = (
        (
            "Workspace",
            {"fields": ("workspace", "plan", "pending_plan")},
        ),
        (
            "Subscription Identifiers",
            {"fields": ("stripe_subscription_id", "stripe_customer_id", "credit_account")},
        ),
        (
            "Status",
            {
                "fields": (
                    "status",
                    "auto_renew_enabled",
                    "notes",
                )
            },
        ),
        (
            "Timing",
            {
                "fields": (
                    "current_period_start",
                    "current_period_end",
                    "trial_end",
                    "canceled_at",
                )
            },
        ),
        (
            "Renewal Attempts",
            {
                "fields": (
                    "renewal_attempt_count",
                    "last_renewal_attempt_at",
                    "last_renewal_status",
                ),
                "classes": ("collapse",),
            },
        ),
    )

    @admin.display(description="Workspace")
    def workspace_link(self, obj):
        url = reverse("admin:workspace_workspace_change", args=[obj.workspace.pk])
        return format_html('<a href="{}">{}</a>', url, obj.workspace.name)

    @admin.display(description="Credit Account")
    def credit_account_link(self, obj):
        if not obj.credit_account_id:
            return "-"
        url = reverse("admin:billing_creditaccount_change", args=[obj.credit_account_id])
        return format_html('<a href="{}">{}</a>', url, obj.credit_account.balance)

    @admin.display(description="Active?", boolean=True)
    def is_active_display(self, obj):
        return obj.is_active


@admin.register(PlanChangeRequest)
class PlanChangeRequestAdmin(admin.ModelAdmin):
    """Track subscription upgrade and downgrade requests."""

    list_display = (
        "subscription_link",
        "from_plan",
        "to_plan",
        "change_type",
        "effective_timing",
        "status",
        "requested_by",
        "processed_by",
        "requested_at",
        "processed_at",
    )
    search_fields = (
        "subscription__workspace__name",
        "subscription__workspace__owner__username",
        "requested_by__username",
        "requested_by__email",
    )
    list_filter = (
        "change_type",
        "effective_timing",
        "status",
        "requested_at",
        "processed_at",
    )
    readonly_fields = ("requested_at", "processed_at")
    ordering = ("-requested_at",)
    list_select_related = (
        "subscription",
        "subscription__workspace",
        "from_plan",
        "to_plan",
        "requested_by",
        "processed_by",
    )
    raw_id_fields = ("subscription", "from_plan", "to_plan", "requested_by", "processed_by")

    fieldsets = (
        (
            "Request",
            {
                "fields": (
                    "subscription",
                    "from_plan",
                    "to_plan",
                    "change_type",
                    "effective_timing",
                    "effective_date",
                )
            },
        ),
        (
            "Status",
            {
                "fields": (
                    "status",
                    "requested_by",
                    "processed_by",
                    "requested_at",
                    "processed_at",
                )
            },
        ),
        (
            "Notes",
            {"fields": ("reason", "admin_notes")},
        ),
    )

    @admin.display(description="Subscription")
    def subscription_link(self, obj):
        url = reverse("admin:billing_workspacesubscription_change", args=[obj.subscription.pk])
        workspace_name = obj.subscription.workspace.name
        return format_html('<a href="{}">{}</a>', url, workspace_name)
