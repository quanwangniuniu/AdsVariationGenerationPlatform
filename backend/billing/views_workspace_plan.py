"""Workspace billing endpoints for plan catalog and subscription management."""
from __future__ import annotations

import logging
from typing import Optional

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from workspace.models import Workspace
from .models import PlanChangeRequest, UserBillingProfile, WorkspacePlan, WorkspaceSubscription
from .permissions import BillingPermissionLevel, check_workspace_billing_permission
from .serializers import (
    PlanChangeActionSerializer,
    PlanChangeRequestSerializer,
    WorkspacePlanChangeSerializer,
    WorkspacePlanSerializer,
    WorkspaceSubscriptionSerializer,
    resolve_plan_name,
)
from .services.stripe_payments import (
    StripeConfigurationError,
    StripeServiceError,
    create_workspace_plan_checkout_session,
)
from billing.services.subscription_lifecycle import (
    SubscriptionLifecycleError,
    assign_billing_owner,
    execute_scheduled_change,
    release_billing_owner,
    schedule_plan_change,
    upgrade_subscription,
)

logger = logging.getLogger(__name__)


def _resolve_workspace_plan(plan_key: Optional[str]) -> Optional[WorkspacePlan]:
    if not plan_key:
        plan_key = "free"
    plan_name = resolve_plan_name(plan_key)
    return WorkspacePlan.objects.filter(name__iexact=plan_name).first()


def _ensure_subscription(workspace) -> WorkspaceSubscription:
    try:
        subscription = workspace.subscription
    except WorkspaceSubscription.DoesNotExist:
        plan = _resolve_workspace_plan(getattr(workspace, "plan", "free"))
        if not plan:
            raise WorkspacePlan.DoesNotExist("Workspace plan configuration is missing.")
        return WorkspaceSubscription.objects.create(workspace=workspace, plan=plan, status="active")

    if not isinstance(subscription.plan, WorkspacePlan) or subscription.plan is None:
        plan = _resolve_workspace_plan(getattr(workspace, "plan", "free"))
        if plan:
            subscription.plan = plan
            subscription.save(update_fields=["plan"])
        else:
            logger.warning(
                "Workspace %s subscription %s missing plan and fallback resolution failed.",
                workspace.id,
                subscription.id,
            )

    return subscription




def _actor_identity(user) -> str:
    if getattr(user, "email", None):
        return f"user:{user.email}"
    return f"user:{getattr(user, 'id', 'unknown')}"


class WorkspacePlanListView(APIView):
    """Expose available workspace plans and highlight the current selection."""

    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, workspace_id):
        try:
            workspace, permissions = check_workspace_billing_permission(
                user=request.user,
                workspace_id=workspace_id,
                level=BillingPermissionLevel.VIEW_BASIC,
            )
        except Workspace.DoesNotExist:
            return Response(
                {"detail": "Workspace not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        permissions  # ensure membership access for linters

        try:
            subscription = workspace.subscription
            subscription_plan_name = subscription.plan.name if subscription.plan else None
        except WorkspaceSubscription.DoesNotExist:
            subscription = None
            subscription_plan_name = None

        current_plan_name = subscription_plan_name or resolve_plan_name(getattr(workspace, "plan", "free"))
        plans = WorkspacePlan.objects.all().order_by("monthly_price", "name")
        serialized_plans = WorkspacePlanSerializer(
            plans,
            many=True,
            context={
                "current_plan_name": current_plan_name,
                "current_plan_key": getattr(workspace, "plan", "free"),
            },
        ).data

        payload = {
            "plans": serialized_plans,
            "current_plan": {
                "key": getattr(workspace, "plan", "free"),
                "name": current_plan_name,
            },
        }
        if subscription:
            payload["subscription_id"] = str(subscription.id)

        return Response(payload)


class WorkspaceSubscriptionView(APIView):
    """Return subscription snapshot for a workspace."""

    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, workspace_id):
        try:
            workspace, permissions = check_workspace_billing_permission(
                user=request.user,
                workspace_id=workspace_id,
                level=BillingPermissionLevel.VIEW_BILLING,
            )
        except Workspace.DoesNotExist:
            return Response(
                {"detail": "Workspace not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        permissions  # keep reference for linters

        try:
            subscription = workspace.subscription
        except WorkspaceSubscription.DoesNotExist:
            return Response(status=status.HTTP_204_NO_CONTENT)

        serializer = WorkspaceSubscriptionSerializer(
            subscription,
            context={
                "current_plan_name": subscription.plan.name if subscription.plan else None,
                "current_plan_key": getattr(workspace, "plan", "free"),
            },
        )
        return Response(serializer.data)


class WorkspacePlanPurchaseView(APIView):
    """Initiate Stripe checkout sessions for workspace plan upgrades."""

    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, workspace_id):
        try:
            workspace, permissions = check_workspace_billing_permission(
                user=request.user,
                workspace_id=workspace_id,
                level=BillingPermissionLevel.MANAGE_BILLING,
            )
        except Workspace.DoesNotExist:
            return Response(
                {"detail": "Workspace not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            subscription = _ensure_subscription(workspace)
        except WorkspacePlan.DoesNotExist:
            return Response(
                {"detail": "Workspace plan configuration is missing. Please contact support."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if subscription.billing_owner_id and subscription.billing_owner_id != request.user.id:
            return Response(
                {
                    "detail": "Workspace subscription is bound to another billing owner. Ask them to release ownership before modifying plan changes.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if subscription.billing_owner_id and subscription.billing_owner_id != request.user.id:
            return Response(
                {
                    "detail": "Workspace subscription is bound to another billing owner. Ask them to release ownership before purchasing.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = WorkspacePlanChangeSerializer(
            data=request.data,
            context={
                "request": request,
                "workspace_permissions": permissions,
                "subscription": subscription,
            },
        )
        serializer.is_valid(raise_exception=True)

        target_plan = serializer.validated_data["target_plan_obj"]
        effective_timing = serializer.validated_data["effective_timing"]
        change_type = serializer.validated_data["change_type"]
        reason = serializer.validated_data.get("reason")
        billing_cycle = serializer.validated_data["billing_cycle"]

        # Decide whether to route through Stripe Checkout.
        # Always require Checkout for first-time purchases and upgrades so payment is confirmed before plan change.
        force_checkout = (not subscription.stripe_subscription_id) or change_type == "upgrade"

        if force_checkout:
            metadata_payload = {
                "change_type": change_type,
                "effective_timing": effective_timing,
            }
            if serializer.validated_data.get("effective_date"):
                metadata_payload["effective_date"] = serializer.validated_data["effective_date"].isoformat()
            if reason:
                metadata_payload["plan_change_reason"] = reason

            try:
                session_info = create_workspace_plan_checkout_session(
                    user=request.user,
                    workspace=workspace,
                    target_plan=target_plan,
                    plan_key=serializer.validated_data.get("target_plan"),
                    subscription=subscription,
                    billing_cycle=billing_cycle,
                    metadata=metadata_payload,
                )
            except (StripeConfigurationError, StripeServiceError) as exc:
                logger.warning("Unable to create workspace Stripe checkout session: %s", exc)
                return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

            response_payload = {
                "checkout_url": session_info.get("url"),
                "checkout_session_id": session_info.get("id"),
                "message": "Please complete payment via Stripe Checkout",
            }
            return Response(response_payload, status=status.HTTP_201_CREATED)

        # Existing subscription: upgrade/downgrade directly
        actor = _actor_identity(request.user)
        request_id = request.headers.get("X-Request-ID")

        try:
            if effective_timing == "immediate":
                result = upgrade_subscription(
                    subscription=subscription,
                    target_plan=target_plan,
                    requested_by=request.user,
                    change_type=change_type,
                    processed_by=request.user,
                    actor=actor,
                    request_id=request_id,
                    reason=reason,
                    billing_cycle=billing_cycle,
                )
                response_status = status.HTTP_201_CREATED
            else:
                result = schedule_plan_change(
                    subscription=subscription,
                    target_plan=target_plan,
                    change_type=change_type,
                    effective_date=serializer.validated_data.get("effective_date"),
                    requested_by=request.user,
                    actor=actor,
                    reason=reason,
                )
                response_status = status.HTTP_202_ACCEPTED
        except SubscriptionLifecycleError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        result_subscription = result.subscription
        result_subscription.refresh_from_db()
        result_subscription.workspace.refresh_from_db()
        result.plan_change.refresh_from_db()

        subscription_payload = WorkspaceSubscriptionSerializer(
            result_subscription,
            context={
                "current_plan_name": result_subscription.plan.name if result_subscription.plan else None,
                "current_plan_key": result_subscription.workspace.plan,
            },
        ).data

        response_payload = {
            "plan_change_request": PlanChangeRequestSerializer(result.plan_change).data,
            "subscription": subscription_payload,
        }
        return Response(response_payload, status=response_status)

    def patch(self, request, workspace_id):
        try:
            workspace, permissions = check_workspace_billing_permission(
                user=request.user,
                workspace_id=workspace_id,
                level=BillingPermissionLevel.MANAGE_BILLING,
            )
        except Workspace.DoesNotExist:
            return Response(
                {"detail": "Workspace not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            subscription = _ensure_subscription(workspace)
        except WorkspacePlan.DoesNotExist:
            return Response(
                {"detail": "Workspace plan configuration is missing. Please contact support."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        serializer = PlanChangeActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        action = serializer.validated_data["action"]
        admin_notes = serializer.validated_data.get("admin_notes")

        actor = _actor_identity(request.user)
        request_id = request.headers.get("X-Request-ID")

        with transaction.atomic():
            locked_subscription = (
                WorkspaceSubscription.objects.select_for_update()
                .select_related("plan", "workspace")
                .get(pk=subscription.pk)
            )
            plan_change = (
                PlanChangeRequest.objects.select_for_update()
                .select_related("to_plan", "from_plan")
                .filter(subscription=locked_subscription)
                .order_by("-requested_at")
                .first()
            )
            if not plan_change:
                return Response(
                    {"detail": "No plan change request found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            now = timezone.now()

            if action == "cancel":
                if plan_change.status != "pending":
                    return Response(
                        {"detail": "Only pending requests can be canceled."},
                        status=status.HTTP_409_CONFLICT,
                    )
                plan_change.status = "canceled"
                plan_change.admin_notes = admin_notes or plan_change.admin_notes
                plan_change.processed_by = request.user
                plan_change.processed_at = now
                plan_change.save(update_fields=["status", "admin_notes", "processed_by", "processed_at"])

                if locked_subscription.pending_plan_id is not None:
                    locked_subscription.pending_plan = None
                    locked_subscription.save(update_fields=["pending_plan"])
            else:  # confirm
                if plan_change.status in ("completed", "canceled"):
                    return Response(
                        {"detail": "Plan change request is already finalized."},
                        status=status.HTTP_409_CONFLICT,
                    )
                try:
                    result = execute_scheduled_change(
                        plan_change=plan_change,
                        actor=actor,
                        request_id=request_id,
                        processed_by=request.user,
                    )
                except SubscriptionLifecycleError as exc:
                    return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

                locked_subscription = result.subscription
                plan_change = result.plan_change
                if admin_notes:
                    plan_change.admin_notes = admin_notes
                    plan_change.save(update_fields=["admin_notes"])

            locked_subscription.refresh_from_db()
            locked_subscription.workspace.refresh_from_db()
            plan_change.refresh_from_db()

        subscription_payload = WorkspaceSubscriptionSerializer(
            locked_subscription,
            context={
                "current_plan_name": locked_subscription.plan.name if locked_subscription.plan else None,
                "current_plan_key": locked_subscription.workspace.plan,
            },
        ).data

        response_payload = {
            "plan_change_request": PlanChangeRequestSerializer(plan_change).data,
            "subscription": subscription_payload,
        }
        return Response(response_payload)


class WorkspaceSubscriptionOwnerView(APIView):
    """Expose and manage the billing owner binding for a workspace subscription."""

    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, workspace_id):
        workspace, _ = check_workspace_billing_permission(
            user=request.user,
            workspace_id=workspace_id,
            level=BillingPermissionLevel.MANAGE_BILLING,
        )
        try:
            subscription = workspace.subscription
        except WorkspaceSubscription.DoesNotExist:
            return Response({"owner": None}, status=status.HTTP_200_OK)

        owner = subscription.billing_owner
        if not owner:
            return Response({"owner": None}, status=status.HTTP_200_OK)

        profile = getattr(owner, "billing_profile", None)
        payload = {
            "owner": {
                "id": str(owner.id),
                "username": owner.username,
                "email": owner.email,
            },
            "stripe_customer_id": subscription.stripe_customer_id,
        }
        if isinstance(profile, UserBillingProfile):
            payload["credit_balance"] = str(profile.credit_balance)

        return Response(payload, status=status.HTTP_200_OK)

    def delete(self, request, workspace_id):
        workspace, _ = check_workspace_billing_permission(
            user=request.user,
            workspace_id=workspace_id,
            level=BillingPermissionLevel.MANAGE_BILLING,
        )
        try:
            subscription = workspace.subscription
        except WorkspaceSubscription.DoesNotExist:
            return Response(status=status.HTTP_204_NO_CONTENT)

        if not subscription.billing_owner_id:
            return Response(status=status.HTTP_204_NO_CONTENT)

        if subscription.billing_owner_id != request.user.id:
            return Response(
                {
                    "detail": "Only the current billing owner can release the subscription binding.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            release_billing_owner(subscription)
        except SubscriptionLifecycleError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        return Response(status=status.HTTP_204_NO_CONTENT)
