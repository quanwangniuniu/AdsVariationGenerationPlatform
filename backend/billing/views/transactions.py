"""API endpoints exposing billing transactions."""
from __future__ import annotations

from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ReadOnlyModelViewSet

from billing.filters import BillingTransactionFilter
from billing.models import BillingTransaction
from billing.pagination import BoundedPageNumberPagination
from billing.permissions import BillingPermissionLevel, check_workspace_billing_permission
from billing.serializers import BillingTransactionSerializer


class UserBillingTransactionViewSet(ReadOnlyModelViewSet):
    serializer_class = BillingTransactionSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination
    filterset_class = BillingTransactionFilter
    ordering_fields = ("occurred_at", "amount", "created_at", "category")
    ordering = ("-occurred_at", "-created_at")

    def get_queryset(self):
        user = self.request.user
        return (
            BillingTransaction.objects.select_related("workspace", "user", "initiator", "invoice", "payment")
            .filter(initiator=user)
            .order_by("-occurred_at", "-created_at")
        )


class WorkspaceBillingTransactionViewSet(ReadOnlyModelViewSet):
    serializer_class = BillingTransactionSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination
    filterset_class = BillingTransactionFilter
    ordering_fields = ("occurred_at", "amount", "created_at", "category")
    ordering = ("-occurred_at", "-created_at")

    def get_queryset(self):
        workspace, _ = check_workspace_billing_permission(
            user=self.request.user,
            workspace_id=self.kwargs["workspace_id"],
            level=BillingPermissionLevel.VIEW_BILLING,
        )
        self.request.workspace = workspace
        return (
            BillingTransaction.objects.select_related("workspace", "user", "initiator", "invoice", "payment")
            .filter(workspace=workspace)
            .order_by("-occurred_at", "-created_at")
        )
