"""Workspace webhook event listing endpoints."""
from __future__ import annotations

from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ReadOnlyModelViewSet

from billing.filters import WebhookEventLogFilter
from billing.models import WebhookEventLog
from billing.pagination import BoundedPageNumberPagination
from billing.permissions import BillingPermissionLevel, check_workspace_billing_permission
from billing.serializers import WebhookEventLogSerializer


class WorkspaceWebhookEventViewSet(ReadOnlyModelViewSet):
    serializer_class = WebhookEventLogSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination
    filterset_class = WebhookEventLogFilter
    ordering_fields = ("created_at", "status")
    ordering = ("-created_at",)

    def get_queryset(self):
        workspace, _ = check_workspace_billing_permission(
            user=self.request.user,
            workspace_id=self.kwargs["workspace_id"],
            level=BillingPermissionLevel.VIEW_BILLING,
        )
        self.request.workspace = workspace
        return WebhookEventLog.objects.filter(workspace=workspace).order_by("-created_at")
