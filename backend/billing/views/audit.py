"""Workspace billing audit log endpoints."""
from __future__ import annotations

from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ReadOnlyModelViewSet

from billing.filters import BillingAuditLogFilter
from billing.models import BillingAuditLog
from billing.pagination import BoundedPageNumberPagination
from billing.permissions import BillingPermissionLevel, check_workspace_billing_permission
from billing.serializers import BillingAuditLogSerializer


class WorkspaceBillingAuditLogViewSet(ReadOnlyModelViewSet):
    serializer_class = BillingAuditLogSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination
    filterset_class = BillingAuditLogFilter
    ordering_fields = ("created_at", "event_type")
    ordering = ("-created_at",)

    def get_queryset(self):
        workspace, _ = check_workspace_billing_permission(
            user=self.request.user,
            workspace_id=self.kwargs["workspace_id"],
            level=BillingPermissionLevel.VIEW_BILLING,
        )
        self.request.workspace = workspace
        return BillingAuditLog.objects.filter(workspace=workspace).order_by("-created_at")
