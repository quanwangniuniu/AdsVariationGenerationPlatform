from rest_framework import permissions
from .models import Membership, WorkspacePermission, InvitationLink, Workspace

class BaseWorkspacePermission(permissions.BasePermission):
    """
    Base helper class for common membership lookups.
    """

    def get_membership(self, workspace, user):
        try:
            return workspace.memberships.get(user=user, is_active=True)
        except Membership.DoesNotExist:
            return None

class WorkspacePermissions(permissions.BasePermission):
    """
    Custom permission class for workspace operations.
    Ensures that users can only access and modify workspaces where they have
    appropriate membership and permissions. Supports the multi-tenant architecture
    requirements specified throughout the URS.

    Permission Matrix:
    - Owner: Full access to all workspace operations including deletion and billing
    - Admin: All operations except billing management and ownership transfer
    - Member: Read access and basic workspace usage, no management operations
    - Viewer: Read-only access to workspace information
    """
    # Map view actions to fine-grained permissions
    action_permission_map = {
        'update': 'can_manage_settings',
        'partial_update': 'can_manage_settings',
        'destroy': 'can_delete_workspace',
        'add_member': 'can_manage_users',
        'update_token_balance': 'can_update_token_balance',
        'transfer_ownership': 'can_transfer_ownership',
    }
    def has_permission(self, request, view):
        """
        Check if user has permission to access workspace endpoints.

        All workspace operations require authentication. Additional permissions
        are checked at the object level based on user's membership role.
        """
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        """
        Check object-level permissions for workspace operations.

        Validates user's role within the specific workspace and determines
        allowed operations based on URS role matrix
        """
        # Get user's membership in this workspace
        # Map view actions to fine-grained permissions
        action_permission_map = {
            'update': 'can_manage_settings',
            'partial_update': 'can_manage_settings',
            'destroy': 'can_delete_workspace',
            'add_member': 'can_manage_users',
            'update_token_balance': 'can_update_token_balance',
            'transfer_ownership': 'can_transfer_ownership',
        }
        try:
            membership = obj.memberships.get(user=request.user, is_active=True)
        except Membership.DoesNotExist:
            return False

        # Read permissions (GET, HEAD, OPTIONS)
        if request.method in permissions.SAFE_METHODS:
            # All active members can view workspace details
            return membership.is_active

        required_perm = action_permission_map.get(view.action)
        if not required_perm:
            return False
        return membership.has_permission(required_perm)


class MembershipPermissions(permissions.BasePermission):
    """
    Permission class for workspace membership management.

    Controls access to membership CRUD operations based on user roles
    within workspaces. Implements URS team management requirements by
    ensuring only authorized users can modify team composition and roles.
    """
    action_permission_map = {
            'create': 'can_manage_users',
            'update': 'can_manage_users',
            'partial_update': 'can_manage_users',
            'destroy': 'can_manage_users',
            'remove_member': 'can_manage_users',
    }
    def has_permission(self, request, view):
        """Check basic authentication for membership operations"""
        if not (request.user and request.user.is_authenticated):
            return False
        workspace_id = view.kwargs.get("workspace_pk")
        if not workspace_id:
            return False
        try:
            workspace = Workspace.objects.get(pk=workspace_id)
            membership = workspace.memberships.get(user=request.user, is_active=True)
        except (Workspace.DoesNotExist, Membership.DoesNotExist):
            return False

        if request.method in permissions.SAFE_METHODS:
            return membership.is_active

        required_perm = self.action_permission_map.get(view.action)
        return required_perm and membership.has_permission(required_perm)

    def has_object_permission(self, request, view, obj):
        """
        Check permissions for specific membership operations.

        Validates that users can only manage memberships in workspaces
        where they have appropriate permissions, following URS role hierarchy.
        """
        # Get user's membership in the target workspace
        try:
            user_membership = obj.workspace.memberships.get(
                user=request.user,
                is_active=True
            )
        except Membership.DoesNotExist:
            return False

        # Read permissions
        if request.method in permissions.SAFE_METHODS:
            # Any active member (Owner/Admin/Member/Viewer) can view memberships
            return user_membership.is_active
        required_perm = self.action_permission_map.get(view.action)
        if not required_perm:
            return False

        if view.action == 'destroy' and obj.role == 'owner':
            return user_membership.role == 'owner'

        if obj.user == request.user and view.action in ['update', 'partial_update']:
            # Prevent self role modification
            if 'role' in request.data:
                return False
            if 'permissions' in request.data:
                return user_membership.role == 'owner'

        if 'custom_permissions' in request.data:
            return user_membership.role == 'owner'

        return user_membership.has_permission(required_perm)

class WorkspacePermissionPermissions(permissions.BasePermission):
    """
    Permission class for viewing and editing fine-grained workspace permissions.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        workspace_id = view.kwargs.get("workspace_pk")
        if not workspace_id:
            return False
        try:
            workspace = Workspace.objects.get(pk=workspace_id)
            membership = workspace.memberships.get(user=request.user, is_active=True)
        except (Workspace.DoesNotExist, Membership.DoesNotExist):
            return False

        if request.method in permissions.SAFE_METHODS:
            return True
        return membership.has_permission("can_manage_users")

    def has_object_permission(self, request, view, obj):
        try:
            user_membership = obj.workspace.memberships.get(
                user=request.user,
                is_active=True
            )
        except Membership.DoesNotExist:
            return False

        # Read permissions: users can see their own, or require can_manage_users for others
        if request.method in permissions.SAFE_METHODS:
            return obj.membership.user == request.user or user_membership.has_permission("can_manage_invitations")

        return user_membership.has_permission("can_manage_users")

class InvitationLinkPermissions(permissions.BasePermission):
    """
    Permission class for invitation link management.

    Controls creation, modification, and usage of invitation links based
    on workspace membership roles. Supports secure team onboarding workflow
    as specified in URS requirements.
    """

    def has_permission(self, request, view):
        """Check authentication for invitation operations"""
        # Global invitation actions that don't require authentication
        if view.action == 'validate_token':
            return True  # Public access for token validation

        # Actions that require authentication
        if view.action == 'accept_invitation':
            return request.user and request.user.is_authenticated

        # All other actions require authentication
        if not (request.user and request.user.is_authenticated):
            return False

        if view.action == 'create':
            return True

        workspace_id = view.kwargs.get("workspace_pk")
        if not workspace_id:
            return False
        try:
            workspace = Workspace.objects.get(pk=workspace_id)
            membership = workspace.memberships.get(user=request.user, is_active=True)
        except (Workspace.DoesNotExist, Membership.DoesNotExist):
            return False

        if request.method in permissions.SAFE_METHODS:
            return membership.is_active
        return membership.has_permission("can_manage_invitations")

    def has_object_permission(self, request, view, obj):
        """
        Check permissions for invitation link operations.

        Ensures only authorized workspace members can manage invitation
        links, with appropriate role-based restrictions for security.
        """
        # Global invitation actions that don't require workspace membership
        if view.action == 'validate_token':
            return True  # Public access for token validation

        if view.action == 'accept_invitation':
            return request.user and request.user.is_authenticated

        # Get user's membership in the workspace
        if view.action == 'create':
            return True

        try:
            membership = obj.workspace.memberships.get(
                user=request.user,
                is_active=True
            )
        except Membership.DoesNotExist:
            return False

        # Read permissions
        if request.method in permissions.SAFE_METHODS:
            return obj.created_by == request.user or membership.has_permission("can_manage_invitations")

        # Write permissions
        if view.action in ['update', 'partial_update', 'destroy', 'deactivate']:
            return obj.created_by == request.user or membership.has_permission("can_manage_invitations")

        return False

class InvitationRolePermission(BaseWorkspacePermission):
    """
    Extra check for invitation role assignment.
    """

    allowed_roles = {
        'owner': ['admin', 'member', 'viewer'],
        'admin': ['admin', 'member', 'viewer'],
        'member': ['member', 'viewer'],
        'viewer': ['viewer'],
    }

    def can_assign_role(self, requester_membership, target_role):
        if target_role == 'owner':
            return False
        return target_role in self.allowed_roles.get(requester_membership.role, [])

#The following feature is temporarily deprecated due to incomplete related modules.
# Please IGNORE it for now!!!!
class WorkspaceResourcePermission(permissions.BasePermission):
    """
    Permission class for workspace resource access (assets, generations, etc.).

    Implements fine-grained resource permissions based on WorkspacePermission
    model settings. Supports URS FR-5.6.3 detailed permission control beyond
    basic roles for specific workspace capabilities.
    """

    def __init__(self, required_permission=None):
        """
        Initialize with specific permission requirement.

        Args:
            required_permission (str): Specific permission to check
                (e.g., 'can_upload_assets', 'can_generate_variants')
        """
        self.required_permission = required_permission

    def has_permission(self, request, view):
        """Check basic authentication"""
        if not (request.user and request.user.is_authenticated):
            return False
        workspace_id = view.kwargs.get("workspace_pk")
        if not workspace_id:
            return False
        try:
            workspace = Workspace.objects.get(pk=workspace_id)
            membership = workspace.memberships.get(user=request.user, is_active=True)
        except (Workspace.DoesNotExist, Membership.DoesNotExist):
            return False

        if self.required_permission:
            return membership.has_permission(self.required_permission)

        if request.method in permissions.SAFE_METHODS:
            return membership.has_permission("can_view_library")
        return membership.has_permission("can_upload_assets")

    def has_object_permission(self, request, view, obj):
        """
        Check resource-specific permissions.

        Validates user's detailed permissions for specific workspace
        resources and operations based on WorkspacePermission settings.
        """
        # Determine workspace (obj might be workspace or related object)
        if hasattr(obj, 'workspace'):
            workspace = obj.workspace
        else:
            workspace = obj

        # Get user's membership and permissions
        try:
            membership = workspace.memberships.get(
                user=request.user,
                is_active=True
            )
            permissions = workspace.user_permissions.get(user=request.user)
        except (Membership.DoesNotExist, WorkspacePermission.DoesNotExist):
            return False

        # Check specific permission if required
        if self.required_permission:
            return membership.has_permission(self.required_permission)

        # Default role-based access for read operations
        if request.method in permissions.SAFE_METHODS:
            return membership.has_permission("can_view_library")

        # Write operations require at least member role
        return membership.has_permission("can_upload_assets")
