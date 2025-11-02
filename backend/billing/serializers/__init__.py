"""DRF serializers for billing flows (token purchases, consumption, plan changes)."""
from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict, Optional

from django.utils.translation import gettext_lazy as _
from rest_framework import serializers
from rest_framework.exceptions import NotAuthenticated, PermissionDenied

from billing.models import (
    BillingAuditLog,
    BillingTransaction,
    InvoiceRecord,
    PaymentRecord,
    PlanChangeRequest,
    RefundRecord,
    TokenAccount,
    WebhookEventLog,
    WorkspacePlan,
    WorkspaceSubscription,
    UserBillingProfile,
)
from billing.permissions import BillingPermissionLevel, WorkspaceBillingPermissions
from billing.services.product_catalog import (
    CatalogConfigurationError,
    ProductNotFound,
    get_token_product,
    get_workspace_plan_product,
)

TOKEN_PURCHASE_MAX_QUANTITY = 10


class BaseTokenAccountSerializer(serializers.Serializer):
    """Shared helpers for serializers that operate on a token account."""

    def get_token_account(self) -> TokenAccount:
        account = self.context.get("token_account")
        if not isinstance(account, TokenAccount):
            raise serializers.ValidationError({"non_field_errors": [_("Token account context is missing.")]})
        return account

    def ensure_authenticated(self) -> None:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            raise NotAuthenticated(_("Authentication required."))


class BaseTokenPurchaseSerializer(BaseTokenAccountSerializer):
    product_key = serializers.CharField()
    quantity = serializers.IntegerField(min_value=1, max_value=TOKEN_PURCHASE_MAX_QUANTITY, default=1)

    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        attrs = super().validate(attrs)
        try:
            attrs["token_product"] = get_token_product(attrs["product_key"])
        except (ProductNotFound, CatalogConfigurationError) as exc:
            raise serializers.ValidationError({"product_key": _(str(exc))}) from exc
        attrs["token_account"] = self.get_token_account()
        return attrs


class UserTokenPurchaseSerializer(BaseTokenPurchaseSerializer):
    """Token purchase request initiated by an individual user."""

    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        self.ensure_authenticated()
        attrs = super().validate(attrs)
        request = self.context["request"]
        account = attrs["token_account"]
        if account.user != request.user:
            raise serializers.ValidationError({"non_field_errors": [_("Token account does not belong to the user.")]})
        return attrs


class WorkspaceTokenPurchaseSerializer(BaseTokenPurchaseSerializer):
    """Token purchase request scoped to a workspace."""

    def get_workspace_permissions(self) -> WorkspaceBillingPermissions:
        permissions = self.context.get("workspace_permissions")
        if not isinstance(permissions, WorkspaceBillingPermissions):
            raise serializers.ValidationError({"non_field_errors": [_("Workspace permissions context is missing.")]})
        return permissions

    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        attrs = super().validate(attrs)
        permissions = self.get_workspace_permissions()
        try:
            permissions.check_permission(BillingPermissionLevel.MANAGE_TOKENS)
        except PermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc

        account = attrs["token_account"]
        if account.workspace != permissions.workspace:
            raise serializers.ValidationError({"non_field_errors": [_("Token account does not match workspace.")]})
        attrs["workspace"] = permissions.workspace
        return attrs


class BaseTokenConsumptionSerializer(BaseTokenAccountSerializer):
    amount = serializers.IntegerField(min_value=1)
    description = serializers.CharField(required=False, allow_blank=True, max_length=255)

    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        attrs = super().validate(attrs)
        account = self.get_token_account()
        if account.balance < attrs["amount"]:
            raise serializers.ValidationError({"amount": [_("Insufficient token balance.")]})
        attrs["token_account"] = account
        return attrs


class UserTokenConsumptionSerializer(BaseTokenConsumptionSerializer):
    """Token deduction initiated by a user (e.g., personal usage)."""

    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        self.ensure_authenticated()
        attrs = super().validate(attrs)
        request = self.context["request"]
        account = attrs["token_account"]
        if account.user != request.user:
            raise serializers.ValidationError({"non_field_errors": [_("Token account does not belong to the user.")]})
        return attrs


class WorkspaceTokenConsumptionSerializer(BaseTokenConsumptionSerializer):
    """Token deduction billed to a workspace."""

    def get_workspace_permissions(self) -> WorkspaceBillingPermissions:
        permissions = self.context.get("workspace_permissions")
        if not isinstance(permissions, WorkspaceBillingPermissions):
            raise serializers.ValidationError({"non_field_errors": [_("Workspace permissions context is missing.")]})
        return permissions

    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        attrs = super().validate(attrs)
        permissions = self.get_workspace_permissions()
        try:
            permissions.check_permission(BillingPermissionLevel.MANAGE_TOKENS)
        except PermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc

        account = attrs["token_account"]
        if account.workspace != permissions.workspace:
            raise serializers.ValidationError({"non_field_errors": [_("Token account does not match workspace.")]})
        attrs["workspace"] = permissions.workspace
        return attrs


PLAN_KEY_OVERRIDES = {
    "free": "Free",
    "basic": "Basic",
    "pro": "Pro",
    "enterprise": "Enterprise",
}


PLAN_LABEL_TO_KEY = {label.lower(): key for key, label in PLAN_KEY_OVERRIDES.items()}

def resolve_plan_name(key: str) -> str:
    label = PLAN_KEY_OVERRIDES.get(key)
    if label:
        return label
    return key.replace("_", " ").title()


def resolve_plan_key(name: str) -> str:
    normalized = (name or '').strip().lower()
    if not normalized:
        return normalized
    if normalized in PLAN_LABEL_TO_KEY:
        return PLAN_LABEL_TO_KEY[normalized]
    return normalized.replace(' ', '_')


class WorkspacePlanSerializer(serializers.ModelSerializer):
    """Expose plan catalog details with a computed key and current flag."""

    key = serializers.SerializerMethodField()
    is_current = serializers.SerializerMethodField()

    class Meta:
        model = WorkspacePlan
        fields = (
            'id',
            'key',
            'name',
            'description',
            'monthly_price',
            'max_users',
            'max_storage_gb',
            'is_current',
        )
        read_only_fields = fields

    def get_key(self, obj: WorkspacePlan) -> str:
        return resolve_plan_key(obj.name)

    def get_is_current(self, obj: WorkspacePlan) -> bool:
        current_plan_name = self.context.get('current_plan_name')
        if isinstance(current_plan_name, str) and current_plan_name.lower() == obj.name.lower():
            return True
        current_plan_key = self.context.get('current_plan_key')
        if isinstance(current_plan_key, str):
            return resolve_plan_key(obj.name) == current_plan_key.strip().lower()
        return False


class WorkspaceSubscriptionSerializer(serializers.ModelSerializer):
    """Snapshot of a workspace subscription and its associated plan."""

    plan = WorkspacePlanSerializer(read_only=True)
    plan_key = serializers.SerializerMethodField()
    latest_invoice_message = serializers.SerializerMethodField()
    pending_plan = serializers.SerializerMethodField()
    pending_plan_key = serializers.SerializerMethodField()
    billing_owner = serializers.SerializerMethodField()
    workspace_id = serializers.UUIDField(source="workspace.id", read_only=True)
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)

    class Meta:
        model = WorkspaceSubscription
        fields = (
            'id',
            'workspace_id',
            'workspace_name',
            'plan',
            'plan_key',
            'pending_plan',
            'pending_plan_key',
            'status',
            'current_period_start',
            'current_period_end',
            'trial_end',
            'canceled_at',
            'stripe_subscription_id',
            'stripe_customer_id',
            'auto_renew_enabled',
            'renewal_attempt_count',
            'last_renewal_attempt_at',
            'last_renewal_status',
            'notes',
            'latest_invoice_message',
            'billing_owner',
        )
        read_only_fields = fields

    def get_plan_key(self, obj: WorkspaceSubscription) -> Optional[str]:
        plan = getattr(obj, 'plan', None)
        if not isinstance(plan, WorkspacePlan):
            return None
        return resolve_plan_key(plan.name)

    def get_latest_invoice_message(self, obj: WorkspaceSubscription) -> Optional[str]:
        notes = getattr(obj, 'notes', '') or ''
        for line in reversed(notes.splitlines()):
            line = line.strip()
            if line:
                return line
        return None

    def get_pending_plan(self, obj: WorkspaceSubscription) -> Optional[dict[str, object]]:
        plan = getattr(obj, 'pending_plan', None)
        if not isinstance(plan, WorkspacePlan):
            return None
        return {
            'id': str(plan.id),
            'key': resolve_plan_key(plan.name),
            'name': plan.name,
            'monthly_price': str(plan.monthly_price),
            'max_users': plan.max_users,
            'max_storage_gb': plan.max_storage_gb,
        }

    def get_pending_plan_key(self, obj: WorkspaceSubscription) -> Optional[str]:
        plan = getattr(obj, 'pending_plan', None)
        if not isinstance(plan, WorkspacePlan):
            return None
        return resolve_plan_key(plan.name)

    def get_billing_owner(self, obj: WorkspaceSubscription) -> Optional[dict[str, object]]:
        owner = getattr(obj, 'billing_owner', None)
        if not owner:
            return None
        return {
            'id': str(owner.id),
            'username': owner.username,
            'email': owner.email,
        }


class PlanChangeRequestSerializer(serializers.ModelSerializer):
    """Representation for plan change request records."""

    from_plan = serializers.SerializerMethodField()
    to_plan = serializers.SerializerMethodField()
    requested_by = serializers.SerializerMethodField()
    processed_by = serializers.SerializerMethodField()

    class Meta:
        model = PlanChangeRequest
        fields = (
            'id',
            'change_type',
            'effective_timing',
            'effective_date',
            'status',
            'reason',
            'admin_notes',
            'requested_at',
            'processed_at',
            'requested_by',
            'processed_by',
            'from_plan',
            'to_plan',
        )
        read_only_fields = fields

    @staticmethod
    def _plan_payload(plan: Optional[WorkspacePlan]) -> Optional[dict[str, object]]:
        if not isinstance(plan, WorkspacePlan):
            return None
        return {
            'id': str(plan.id),
            'key': resolve_plan_key(plan.name),
            'name': plan.name,
            'monthly_price': str(plan.monthly_price),
            'max_users': plan.max_users,
            'max_storage_gb': plan.max_storage_gb,
        }

    def get_from_plan(self, obj: PlanChangeRequest) -> Optional[dict[str, object]]:
        return self._plan_payload(obj.from_plan)

    def get_to_plan(self, obj: PlanChangeRequest) -> Optional[dict[str, object]]:
        return self._plan_payload(obj.to_plan)

    @staticmethod
    def _user_payload(user) -> Optional[dict[str, object]]:
        if not user:
            return None
        return {
            'id': str(getattr(user, 'id', '')),
            'username': getattr(user, 'username', None),
            'email': getattr(user, 'email', None),
        }

    def get_requested_by(self, obj: PlanChangeRequest) -> Optional[dict[str, object]]:
        return self._user_payload(obj.requested_by)

    def get_processed_by(self, obj: PlanChangeRequest) -> Optional[dict[str, object]]:
        return self._user_payload(obj.processed_by)


class UserBillingProfileSerializer(serializers.ModelSerializer):
    """Expose user-level Stripe billing profile and credit metadata."""

    user = serializers.SerializerMethodField()
    currency = serializers.SerializerMethodField()

    class Meta:
        model = UserBillingProfile
        fields = (
            "user",
            "stripe_customer_id",
            "default_payment_method_id",
            "credit_balance",
            "currency",
            "last_synced_at",
            "last_stripe_balance",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_user(self, obj: UserBillingProfile) -> dict[str, object]:
        user = obj.user
        return {
            "id": str(user.id),
            "username": getattr(user, "username", None),
            "email": getattr(user, "email", None),
        }

    def get_currency(self, obj: UserBillingProfile) -> str:
        from billing.models import _default_currency  # Lazy import to reuse helper

        return _default_currency()


class PlanChangeActionSerializer(serializers.Serializer):
    """Validate user actions to mutate plan change request state."""

    action = serializers.ChoiceField(choices=('cancel', 'confirm'))
    admin_notes = serializers.CharField(required=False, allow_blank=True)


class WorkspacePlanChangeSerializer(serializers.Serializer):
    """Serializer for workspace plan upgrade/downgrade requests."""

    target_plan = serializers.CharField()
    effective_timing = serializers.ChoiceField(
        choices=[choice[0] for choice in PlanChangeRequest.TIMING_CHOICES],
        required=False,
        allow_null=True,
    )
    effective_date = serializers.DateTimeField(required=False)
    reason = serializers.CharField(required=False, allow_blank=True)
    billing_cycle = serializers.ChoiceField(
        choices=("monthly", "yearly"),
        required=False,
        allow_null=True,
    )

    def get_workspace_permissions(self) -> WorkspaceBillingPermissions:
        permissions = self.context.get("workspace_permissions")
        if not isinstance(permissions, WorkspaceBillingPermissions):
            raise serializers.ValidationError({"non_field_errors": [_("Workspace permissions context is missing.")]})
        return permissions

    def get_subscription(self) -> WorkspaceSubscription:
        subscription = self.context.get("subscription")
        if not isinstance(subscription, WorkspaceSubscription):
            raise serializers.ValidationError({"non_field_errors": [_("Workspace subscription context is missing.")]})
        return subscription

    def validate_target_plan(self, value: str) -> str:
        try:
            get_workspace_plan_product(value)
        except (ProductNotFound, CatalogConfigurationError) as exc:
            raise serializers.ValidationError(str(exc)) from exc
        return value

    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        attrs = super().validate(attrs)
        permissions = self.get_workspace_permissions()
        try:
            permissions.check_permission(BillingPermissionLevel.MANAGE_BILLING)
        except PermissionDenied as exc:
            raise PermissionDenied(detail=str(exc)) from exc

        subscription = self.get_subscription()
        current_plan = subscription.plan
        if not isinstance(current_plan, WorkspacePlan):
            raise serializers.ValidationError({"non_field_errors": [_("Current subscription plan is invalid.")]})

        target_key = attrs["target_plan"]
        target_name = resolve_plan_name(target_key)

        if current_plan.name.lower() == target_name.lower():
            raise serializers.ValidationError({"target_plan": [_("Workspace is already on the requested plan.")]})

        target_plan_obj = WorkspacePlan.objects.filter(name__iexact=target_name).first()
        if not target_plan_obj:
            raise serializers.ValidationError({"target_plan": [_("Requested plan is not available.")]})

        attrs["subscription"] = subscription
        attrs["target_plan_obj"] = target_plan_obj
        change_type = self._determine_change_type(current_plan, target_plan_obj)
        attrs["change_type"] = change_type
        billing_cycle = attrs.get("billing_cycle") or "monthly"
        attrs["billing_cycle"] = billing_cycle.lower()

        # Auto-determine effective_timing based on change type if not explicitly provided
        if not attrs.get("effective_timing"):
            if change_type == "downgrade":
                # Downgrades are scheduled for end of current billing period
                attrs["effective_timing"] = "end_of_period"
            else:
                # Upgrades and lateral changes are immediate
                attrs["effective_timing"] = "immediate"

        if attrs["effective_timing"] == "immediate":
            attrs.pop("effective_date", None)
        elif "effective_date" not in attrs:
            # For end_of_period, effective_date will be set in the view to current_period_end
            pass

        if attrs["change_type"] == "downgrade" and attrs["effective_timing"] != "end_of_period":
            raise serializers.ValidationError(
                {"effective_timing": [_("Downgrades must take effect at the end of the current period.")]}
            )

        return attrs

    @staticmethod
    def _determine_change_type(from_plan: WorkspacePlan, to_plan: WorkspacePlan) -> str:
        if to_plan.monthly_price > from_plan.monthly_price:
            return "upgrade"
        if to_plan.monthly_price < from_plan.monthly_price:
            return "downgrade"
        return "change"


class BillingTransactionSerializer(serializers.ModelSerializer):
    workspace_id = serializers.UUIDField(source="workspace.id", read_only=True)
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    initiator = serializers.SerializerMethodField()

    class Meta:
        model = BillingTransaction
        fields = (
            "id",
            "workspace_id",
            "user_id",
            "initiator",
            "category",
            "direction",
            "status",
            "amount",
            "currency",
            "source_reference",
            "occurred_at",
            "description",
            "metadata",
            "created_at",
        )
        read_only_fields = fields

    def get_initiator(self, obj: BillingTransaction) -> Optional[dict[str, object]]:
        user = getattr(obj, "initiator", None)
        if not user:
            return None
        return {
            'id': str(user.id),
            'username': user.username,
            'email': user.email,
        }


class InvoiceRecordSerializer(serializers.ModelSerializer):
    workspace_id = serializers.UUIDField(source="workspace.id", read_only=True)
    initiator = serializers.SerializerMethodField()

    class Meta:
        model = InvoiceRecord
        fields = (
            "id",
            "workspace_id",
            "stripe_invoice_id",
            "status",
            "total_amount",
            "amount_due",
            "currency",
            "hosted_invoice_url",
            "pdf_storage_path",
            "issued_at",
            "due_at",
            "paid_at",
            "canceled_at",
            "last_payment_attempt_at",
            "failure_reason",
            "metadata",
            "created_at",
            "updated_at",
            "initiator",
        )
        read_only_fields = fields

    def get_initiator(self, obj: InvoiceRecord) -> Optional[dict[str, object]]:
        user = getattr(obj, "initiator", None)
        if not user:
            return None
        return {
            'id': str(user.id),
            'username': user.username,
            'email': user.email,
        }


class PaymentRecordSerializer(serializers.ModelSerializer):
    workspace_id = serializers.UUIDField(source="workspace.id", read_only=True)
    invoice = InvoiceRecordSerializer(read_only=True)
    initiator = serializers.SerializerMethodField()

    class Meta:
        model = PaymentRecord
        fields = (
            "id",
            "workspace_id",
            "stripe_payment_intent_id",
            "stripe_charge_id",
            "status",
            "amount",
            "currency",
            "failure_code",
            "failure_message",
            "retryable_until",
            "idempotency_key",
            "metadata",
            "created_at",
            "updated_at",
            "invoice",
            "initiator",
        )
        read_only_fields = fields

    def get_initiator(self, obj: PaymentRecord) -> Optional[dict[str, object]]:
        user = getattr(obj, "initiator", None)
        if not user:
            return None
        return {
            'id': str(user.id),
            'username': user.username,
            'email': user.email,
        }

    def to_representation(self, instance: PaymentRecord) -> dict[str, Any]:
        data = super().to_representation(instance)
        request = self.context.get("request")
        if not request:
            return data

        initiator_id = getattr(instance.initiator, "id", None)
        if initiator_id and initiator_id != getattr(request.user, "id", None):
            data.pop("stripe_payment_intent_id", None)
            data.pop("stripe_charge_id", None)
            data.pop("idempotency_key", None)
            data["metadata"] = {}
        return data


class RefundRecordSerializer(serializers.ModelSerializer):
    workspace_id = serializers.UUIDField(source="workspace.id", read_only=True)

    class Meta:
        model = RefundRecord
        fields = (
            "id",
            "workspace_id",
            "stripe_refund_id",
            "amount",
            "currency",
            "status",
            "reason",
            "failure_reason",
            "actor",
            "notes",
            "metadata",
            "processed_at",
            "created_at",
        )
        read_only_fields = fields


class PaymentRefundRequestSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    currency = serializers.CharField(max_length=3, required=False)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=255)
    metadata = serializers.DictField(required=False)

    def validate_amount(self, value: Decimal) -> Decimal:
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value


class BillingAuditLogSerializer(serializers.ModelSerializer):
    workspace_id = serializers.UUIDField(source="workspace.id", read_only=True)

    class Meta:
        model = BillingAuditLog
        fields = (
            "id",
            "workspace_id",
            "event_type",
            "stripe_id",
            "actor",
            "request_id",
            "details",
            "created_at",
        )
        read_only_fields = fields


class WebhookEventLogSerializer(serializers.ModelSerializer):
    workspace_id = serializers.UUIDField(source="workspace.id", read_only=True)

    class Meta:
        model = WebhookEventLog
        fields = (
            "id",
            "event_id",
            "workspace_id",
            "event_type",
            "status",
            "handled",
            "processed_at",
            "payload_hash",
            "last_error",
            "created_at",
        )
        read_only_fields = fields
