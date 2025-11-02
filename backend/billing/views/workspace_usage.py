"""Usage metrics for workspace billing dashboard."""
from __future__ import annotations

from decimal import Decimal

from django.db.models import Sum
from django.db.models.functions import Coalesce
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from assets.models import Asset
from billing.permissions import BillingPermissionLevel, check_workspace_billing_permission


class WorkspaceUsageView(APIView):
    """Expose member and storage usage for a workspace."""

    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, workspace_id):
        workspace, _ = check_workspace_billing_permission(
            user=request.user,
            workspace_id=workspace_id,
            level=BillingPermissionLevel.VIEW_BASIC,
        )

        member_count = workspace.memberships.filter(is_active=True).count()
        max_users = workspace.max_users or 0

        storage_used_bytes = (
            Asset.objects.filter(workspace=workspace, is_active=True)
            .aggregate(total=Coalesce(Sum('size'), 0))
            .get('total')
        )
        storage_used_bytes = storage_used_bytes or 0
        storage_used_gb = float(Decimal(storage_used_bytes) / Decimal(1024 ** 3)) if storage_used_bytes else 0.0
        max_storage_gb = workspace.max_storage_gb or 0

        payload = {
            'member_count': member_count,
            'max_users': max_users,
            'storage_used_gb': round(storage_used_gb, 3),
            'max_storage_gb': max_storage_gb,
        }
        return Response(payload)
