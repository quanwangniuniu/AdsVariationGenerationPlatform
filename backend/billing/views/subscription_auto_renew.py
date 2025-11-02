from __future__ import annotations

from django.http import JsonResponse, Http404
from django.utils.translation import gettext_lazy as _
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from billing.models import WorkspaceSubscription
from billing.permissions import BillingPermissionLevel, check_workspace_billing_permission
from billing.services.subscription_toggle import set_auto_renew


class WorkspaceAutoRenewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, workspace_id: str, *args, **kwargs):
        subscription = self._get_subscription(request.user, workspace_id, BillingPermissionLevel.VIEW_BILLING)
        return JsonResponse(
            {
                "auto_renew_enabled": subscription.auto_renew_enabled,
                "status": subscription.status,
                "current_plan_id": str(subscription.plan_id),
                "workspace_id": str(subscription.workspace_id),
            }
        )

    def patch(self, request, workspace_id: str, *args, **kwargs):
        subscription = self._get_subscription(request.user, workspace_id, BillingPermissionLevel.MANAGE_BILLING)
        enabled = request.data.get("enabled")
        if not isinstance(enabled, bool):
            return JsonResponse(
                {
                    "code": "invalid_payload",
                    "message": _("Field 'enabled' must be a boolean."),
                    "details": {},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = set_auto_renew(
            subscription=subscription,
            enabled=enabled,
            actor=f"user:{request.user.id}",
            request_id=request.headers.get("X-Request-ID", ""),
        )
        subscription = result.subscription
        return JsonResponse(
            {
                "auto_renew_enabled": subscription.auto_renew_enabled,
                "status": subscription.status,
                "current_plan_id": str(subscription.plan_id),
                "workspace_id": str(subscription.workspace_id),
                "previous": result.previous,
            }
        )

    def _get_subscription(self, user, workspace_id: str, level: BillingPermissionLevel) -> WorkspaceSubscription:
        workspace, _perms = check_workspace_billing_permission(user=user, workspace_id=workspace_id, level=level)
        try:
            subscription = WorkspaceSubscription.objects.select_related("workspace", "plan").get(workspace=workspace)
        except WorkspaceSubscription.DoesNotExist as exc:
            raise Http404(_("Workspace subscription not found.")) from exc
        return subscription
