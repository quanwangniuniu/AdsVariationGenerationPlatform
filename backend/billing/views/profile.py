"""User billing profile views."""
from __future__ import annotations

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from billing.models import UserBillingProfile, WorkspaceSubscription
from billing.serializers import UserBillingProfileSerializer, WorkspaceSubscriptionSerializer


class UserBillingProfileCreditView(APIView):
    """Return the authenticated user's billing profile and credit summary."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = UserBillingProfile.get_or_create_for_user(request.user)
        serializer = UserBillingProfileSerializer(profile, context={"request": request})
        return Response(serializer.data)


class UserWorkspaceSubscriptionListView(APIView):
    """List workspace subscriptions the current user can access."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from workspace.models import Workspace
        from billing.views_workspace_plan import _ensure_subscription

        workspaces = (
            Workspace.objects.filter(memberships__user=request.user, memberships__is_active=True)
            .select_related(
                'subscription__plan',
                'subscription__pending_plan',
                'subscription__billing_owner',
            )
            .distinct()
            .order_by('name')
        )

        subscriptions: list[WorkspaceSubscription] = []
        for workspace in workspaces:
            try:
                subscription = workspace.subscription
            except WorkspaceSubscription.DoesNotExist:
                subscription = _ensure_subscription(workspace)
            subscriptions.append(subscription)

        serializer = WorkspaceSubscriptionSerializer(
            subscriptions,
            many=True,
            context={'request': request},
        )
        return Response(serializer.data)
