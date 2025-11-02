"""Invoice list endpoints for user and workspace scopes."""
from __future__ import annotations

from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ReadOnlyModelViewSet

from billing.filters import InvoiceRecordFilter
from billing.models import InvoiceRecord
from billing.pagination import BoundedPageNumberPagination
from billing.permissions import BillingPermissionLevel, check_workspace_billing_permission
from billing.serializers import InvoiceRecordSerializer


class UserInvoiceViewSet(ReadOnlyModelViewSet):
    serializer_class = InvoiceRecordSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination
    filterset_class = InvoiceRecordFilter
    ordering_fields = ("issued_at", "due_at", "total_amount")
    ordering = ("-issued_at", "-created_at")

    def get_queryset(self):
        user = self.request.user
        return (
            InvoiceRecord.objects.select_related("workspace", "initiator")
            .filter(initiator=user)
            .order_by("-issued_at", "-created_at")
        )


class WorkspaceInvoiceViewSet(ReadOnlyModelViewSet):
    serializer_class = InvoiceRecordSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination
    filterset_class = InvoiceRecordFilter
    ordering_fields = ("issued_at", "due_at", "total_amount")
    ordering = ("-issued_at", "-created_at")

    def get_queryset(self):
        workspace, _ = check_workspace_billing_permission(
            user=self.request.user,
            workspace_id=self.kwargs["workspace_id"],
            level=BillingPermissionLevel.VIEW_BILLING,
        )
        self.request.workspace = workspace
        return (
            InvoiceRecord.objects.select_related("workspace", "initiator")
            .filter(workspace=workspace)
            .order_by("-issued_at", "-created_at")
        )
