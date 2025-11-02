"""
Billing Permission Management - Unified workspace billing permission checks

Defines four levels of permissions:
1. VIEW_BASIC: View basic information (token balance, current plan)
2. VIEW_BILLING: View detailed billing information (transaction records, subscription details)
3. MANAGE_TOKENS: Manage tokens (top-up, purchase)
4. MANAGE_BILLING: Manage billing (change plans, subscription management)
"""
import logging
from enum import Enum
from typing import Optional

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, NotAuthenticated
from rest_framework.response import Response

from workspace.models import Workspace, Membership

logger = logging.getLogger(__name__)
User = get_user_model()


class BillingPermissionLevel(Enum):
    """Billing permission level enumeration"""
    VIEW_BASIC = "view_basic"           # View basic information
    VIEW_BILLING = "view_billing"       # View billing details
    MANAGE_TOKENS = "manage_tokens"     # Manage tokens
    MANAGE_BILLING = "manage_billing"   # Manage billing/plans


class WorkspaceBillingPermissions:
    """
    Workspace Billing Permission Checker

    Provides unified permission validation methods to ensure that users
    have the correct permissions to access billing functions
    """

    def __init__(self, user: User, workspace: Workspace):
        self.user = user
        self.workspace = workspace
        self._membership = None

    @property
    def membership(self) -> Optional[Membership]:
        """Get the user’s membership in the workspace"""
        if self._membership is None:
            try:
                self._membership = Membership.objects.get(
                    workspace=self.workspace,
                    user=self.user,
                    is_active=True
                )
            except Membership.DoesNotExist:
                self._membership = False  # Use False as a marker for non-existence
        return self._membership if self._membership is not False else None

    def is_member(self) -> bool:
        """Check whether the user is a workspace member"""
        return self.membership is not None

    def is_owner(self) -> bool:
        """Check whether the user is the workspace owner"""
        return self.workspace.owner == self.user

    def has_permission(self, permission_name: str) -> bool:
        """
        Check whether the user has the specified permission

        Args:
            permission_name: Permission name (e.g. "can_view_billing")

        Returns:
            bool: Whether the user has the permission
        """
        # The owner always has all permissions
        if self.is_owner():
            return True

        # Check membership permissions
        membership = self.membership
        if not membership:
            return False

        return membership.has_permission(permission_name)

    def check_permission(self, level: BillingPermissionLevel) -> None:
        """
        Validate the required permission; raise an exception if not granted

        Args:
            level: Required permission level

        Raises:
            NotAuthenticated: User not logged in
            PermissionDenied: Insufficient permission
        """
        if not self.user or not self.user.is_authenticated:
            raise NotAuthenticated("User not logged in")

        # Check whether the user is a workspace member
        if not self.is_member():
            raise PermissionDenied("You are not a member of this workspace")

        # Map required permission by level
        permission_mapping = {
            BillingPermissionLevel.VIEW_BASIC: None,  # Members can view basic info
            BillingPermissionLevel.VIEW_BILLING: "can_view_billing",
            BillingPermissionLevel.MANAGE_TOKENS: "can_update_token_balance",
            BillingPermissionLevel.MANAGE_BILLING: "can_manage_billing",
        }

        required_permission = permission_mapping[level]

        # If a specific permission is required, check it
        if required_permission and not self.has_permission(required_permission):
            permission_names = {
                "can_view_billing": "view billing information",
                "can_update_token_balance": "manage token top-ups",
                "can_manage_billing": "manage billing and plans",
            }
            permission_desc = permission_names.get(required_permission, required_permission)
            raise PermissionDenied(f"You do not have permission to {permission_desc}")

        logger.debug(
            f"Permission granted: user {self.user.id} has {level.value} "
            f"permission for workspace {self.workspace.id}"
        )



def check_workspace_billing_permission(
    user: User,
    workspace_id: str,
    level: BillingPermissionLevel
) -> tuple[Workspace, WorkspaceBillingPermissions]:
    """
    Convenience function: check workspace billing permission

    Args:
        user: User object
        workspace_id: Workspace ID
        level: Required permission level

    Returns:
        tuple: (workspace object, permission checker object)

    Raises:
        Workspace.DoesNotExist: Workspace does not exist
        NotAuthenticated: User not logged in
        PermissionDenied: Insufficient permission
    """
    try:
        workspace = Workspace.objects.get(id=workspace_id)
    except Workspace.DoesNotExist:
        raise Workspace.DoesNotExist("Workspace does not exist")

    permissions = WorkspaceBillingPermissions(user, workspace)
    permissions.check_permission(level)

    return workspace, permissions

def require_workspace_billing_permission(level: BillingPermissionLevel):
    """
    Decorator: requires a specific workspace billing permission

    Usage:
        @require_workspace_billing_permission(BillingPermissionLevel.MANAGE_TOKENS)
        def my_view(request, workspace_id):
            # At this point, the user is guaranteed to have MANAGE_TOKENS permission
            pass
    """
    def decorator(view_func):
        def wrapper(request, workspace_id, *args, **kwargs):
            try:
                workspace, permissions = check_workspace_billing_permission(
                    user=request.user,
                    workspace_id=workspace_id,
                    level=level
                )
            except NotAuthenticated as exc:
                return Response({"detail": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)
            except PermissionDenied as exc:
                return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
            except Workspace.DoesNotExist as exc:
                return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)

            # Attach workspace and permissions to the request for use inside the view
            request.workspace = workspace
            request.workspace_permissions = permissions

            return view_func(request, workspace_id, *args, **kwargs)

        return wrapper
    return decorator

def check_view_basic_permission(user: User, workspace_id: str):
    """Check permission to view basic information (membership required)"""
    return check_workspace_billing_permission(user, workspace_id, BillingPermissionLevel.VIEW_BASIC)


def check_view_billing_permission(user: User, workspace_id: str):
    """Check permission to view billing details"""
    return check_workspace_billing_permission(user, workspace_id, BillingPermissionLevel.VIEW_BILLING)


def check_manage_tokens_permission(user: User, workspace_id: str):
    """Check permission to manage tokens"""
    return check_workspace_billing_permission(user, workspace_id, BillingPermissionLevel.MANAGE_TOKENS)


def check_manage_billing_permission(user: User, workspace_id: str):
    """Check permission to manage billing"""
    return check_workspace_billing_permission(user, workspace_id, BillingPermissionLevel.MANAGE_BILLING)



