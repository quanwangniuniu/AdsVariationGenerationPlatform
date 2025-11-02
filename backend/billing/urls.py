"""URL routes for billing endpoints."""
from django.urls import path

from .views import (
    TokenProductListView,
    TokenPurchaseView,
    WorkspaceTokenProductListView,
    WorkspaceTokenPurchaseView,
)
from .views_webhook import StripeWebhookView
from .views_workspace_plan import (
    WorkspacePlanListView,
    WorkspacePlanPurchaseView,
    WorkspaceSubscriptionOwnerView,
    WorkspaceSubscriptionView,
)
from .views.transactions import (
    UserBillingTransactionViewSet,
    WorkspaceBillingTransactionViewSet,
)
from .views.invoices import (
    UserInvoiceViewSet,
    WorkspaceInvoiceViewSet,
)
from .views.invoice_pdf import UserInvoicePdfView, WorkspaceInvoicePdfView
from .views.subscription_auto_renew import WorkspaceAutoRenewView
from .views.payments import (PaymentRefundView, PaymentRetryView, UserPaymentViewSet, WorkspacePaymentViewSet)
from .views.profile import UserBillingProfileCreditView, UserWorkspaceSubscriptionListView
from .views.audit import WorkspaceBillingAuditLogViewSet
from .views.webhooks import WorkspaceWebhookEventViewSet
from .views.workspace_usage import WorkspaceUsageView

app_name = "billing"

urlpatterns = [
    path("token-products/", TokenProductListView.as_view(), name="token-products"),
    path("purchase/", TokenPurchaseView.as_view(), name="token-purchase"),
    path(
        "workspaces/<uuid:workspace_id>/billing/token-products/",
        WorkspaceTokenProductListView.as_view(),
        name="workspace-token-products",
    ),
    path(
        "workspaces/<uuid:workspace_id>/billing/purchase/",
        WorkspaceTokenPurchaseView.as_view(),
        name="workspace-token-purchase",
    ),
    path(
        "workspaces/<uuid:workspace_id>/billing/purchase/plan/",
        WorkspacePlanPurchaseView.as_view(),
        name="workspace-plan-purchase",
    ),
    path(
        "workspaces/<uuid:workspace_id>/billing/plans/",
        WorkspacePlanListView.as_view(),
        name="workspace-plan-list",
    ),
    path(
        "workspaces/<uuid:workspace_id>/billing/subscription/",
        WorkspaceSubscriptionView.as_view(),
        name="workspace-subscription",
    ),
    path(
        "workspaces/<uuid:workspace_id>/billing/subscription/owner/",
        WorkspaceSubscriptionOwnerView.as_view(),
        name="workspace-subscription-owner",
    ),
    path(
        "workspaces/<uuid:workspace_id>/billing/plan-change/",
        WorkspacePlanPurchaseView.as_view(),
        name="workspace-plan-change",
    ),
    path("webhook/stripe/", StripeWebhookView.as_view(), name="stripe-webhook"),
    # User-level billing endpoints (no "billing/" prefix - already in main urls.py)
    path(
        "transactions/",
        UserBillingTransactionViewSet.as_view({"get": "list"}),
        name="billing-transactions",
    ),
    path(
        "invoices/",
        UserInvoiceViewSet.as_view({"get": "list"}),
        name="billing-invoices",
    ),
    path(
        "invoices/<uuid:invoice_id>/pdf/",
        UserInvoicePdfView.as_view(),
        name="billing-invoice-pdf",
    ),
    path(
        "payments/<uuid:payment_id>/retry/",
        PaymentRetryView.as_view(),
        name="billing-payments-retry",
    ),
    path(
        "payments/<uuid:payment_id>/refund/",
        PaymentRefundView.as_view(),
        name="billing-payments-refund",
    ),
    path(
        "payments/",
        UserPaymentViewSet.as_view({"get": "list"}),
        name="billing-payments",
    ),
    path(
        "profile/credit/",
        UserBillingProfileCreditView.as_view(),
        name="billing-profile-credit",
    ),
    path(
        "workspaces/subscriptions/",
        UserWorkspaceSubscriptionListView.as_view(),
        name="user-workspace-subscriptions",
    ),
    path(
        "workspaces/<uuid:workspace_id>/billing/transactions/",
        WorkspaceBillingTransactionViewSet.as_view({"get": "list"}),
        name="workspace-billing-transactions",
    ),
    path(
        "workspaces/<uuid:workspace_id>/billing/invoices/",
        WorkspaceInvoiceViewSet.as_view({"get": "list"}),
        name="workspace-billing-invoices",
    ),
    path(
        "workspaces/<uuid:workspace_id>/billing/invoices/<uuid:invoice_id>/pdf/",
        WorkspaceInvoicePdfView.as_view(),
        name="workspace-billing-invoice-pdf",
    ),
    path(
        "workspaces/<uuid:workspace_id>/billing/subscription/auto-renew/",
        WorkspaceAutoRenewView.as_view(),
        name="workspace-billing-auto-renew",
    ),
    path(
        "workspaces/<uuid:workspace_id>/billing/payments/<uuid:payment_id>/retry/",
        PaymentRetryView.as_view(),
        name="workspace-billing-payments-retry",
    ),
    path(
        "workspaces/<uuid:workspace_id>/billing/payments/<uuid:payment_id>/refund/",
        PaymentRefundView.as_view(),
        name="workspace-billing-payments-refund",
    ),
    path(
        "workspaces/<uuid:workspace_id>/billing/payments/",
        WorkspacePaymentViewSet.as_view({"get": "list"}),
        name="workspace-billing-payments",
    ),
    path(
        "workspaces/<uuid:workspace_id>/billing/audit-logs/",
        WorkspaceBillingAuditLogViewSet.as_view({"get": "list"}),
        name="workspace-billing-audit-logs",
    ),
    path(
        "workspaces/<uuid:workspace_id>/billing/webhook-events/",
        WorkspaceWebhookEventViewSet.as_view({"get": "list"}),
        name="workspace-billing-webhook-events",
    ),
    path(
        "workspaces/<uuid:workspace_id>/billing/usage/",
        WorkspaceUsageView.as_view(),
        name="workspace-billing-usage",
    ),
]
