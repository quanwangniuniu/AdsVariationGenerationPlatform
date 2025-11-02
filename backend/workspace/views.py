from rest_framework import viewsets, status, permissions as drf_permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError, PermissionDenied, NotFound
from django.db import transaction, IntegrityError
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.contrib.auth import get_user_model
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.db import models
from uuid import UUID

from .models import (
    Workspace, Membership, WorkspacePermission,
    InvitationLink, InvitationUsage
)
from .serializers import (
    WorkspaceSerializer, MembershipSerializer, WorkspacePermissionSerializer,
    InvitationLinkSerializer, InvitationUsageSerializer, InvitationTokenValidationSerializer
)
from .permissions import (
    WorkspacePermissions, MembershipPermissions, InvitationLinkPermissions,
    WorkspacePermissionPermissions
)

User = get_user_model()


class WorkspaceViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing workspace operations with comprehensive RBAC.

    Provides complete CRUD functionality for workspaces with role-based access control.
    Supports workspace lifecycle management including ownership transfer and dissolution.

    Key Features:
    - Role-based permissions (Owner/Admin/Member/Viewer hierarchy)
    - Ownership transfer with proper validation and cleanup
    - Workspace dissolution with cascade handling
    - Token balance management for billing integration
    - Multi-tenant data isolation

    Permissions:
    - LIST/RETRIEVE: Any authenticated user (filtered by membership)
    - CREATE: Any authenticated user (becomes owner)
    - UPDATE: Requires can_manage_settings permission
    - DELETE: Requires can_delete_workspace permission (owner only)
    """

    serializer_class = WorkspaceSerializer
    permission_classes = [drf_permissions.IsAuthenticated, WorkspacePermissions]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['plan', 'workspace_type', 'is_active']
    search_fields = ['name', 'description']
    ordering_fields = ['created_at', 'updated_at', 'name']
    ordering = ['-created_at']

    def get_queryset(self):
        """
        Filter workspaces based on user membership for multi-tenant isolation.

        Returns only workspaces where the authenticated user has active membership,
        ensuring proper data isolation and security in multi-tenant architecture.
        """
        if not self.request.user.is_authenticated:
            return Workspace.objects.none()

        # Get workspaces where user has active membership
        user_workspaces = Workspace.objects.filter(
            memberships__user=self.request.user,
            memberships__is_active=True
        ).distinct()

        return user_workspaces

    def perform_create(self, serializer):
        """
        Create workspace with automatic owner membership setup.

        When a workspace is created, the creating user automatically becomes
        the owner with full permissions. This includes creating the initial
        Membership and WorkspacePermission records.
        """
        # Workspace creation and owner setup is handled in serializer.create()
        workspace = serializer.save()

        # Log workspace creation for audit trail
        self.log_workspace_activity(workspace, 'created')

    def perform_update(self, serializer):
        """
        Update workspace with activity logging and plan limit enforcement.

        Handles workspace updates while maintaining data integrity and
        applying new plan limits when subscription changes occur.
        """
        workspace = serializer.save()
        self.log_workspace_activity(workspace, 'updated')

    def perform_destroy(self, serializer):
        """
        Handle workspace deletion with proper cleanup.

        Only workspace owners can delete workspaces. This operation cascades
        to remove all related data including memberships, permissions, and
        invitation links as defined in the model relationships.
        """
        workspace = serializer
        workspace_name = workspace.name

        # Log before deletion
        self.log_workspace_activity(workspace, 'deleted')

        # Django CASCADE will handle related object cleanup
        workspace.delete()

    @action(detail=True, methods=['post'], permission_classes=[WorkspacePermissions])
    def transfer_ownership(self, request, pk=None):
        """
        Transfer workspace ownership to another member.

        Critical operation that requires current owner privileges and careful
        validation to maintain workspace integrity and security.

        Process:
        1. Validate current user is workspace owner
        2. Validate target user is active workspace member
        3. Update both users' memberships and permissions
        4. Log ownership transfer for audit trail

        Args:
            new_owner_id (int): ID of user to transfer ownership to

        Returns:
            Response: Success message with updated ownership details
        """
        workspace = self.get_object()
        new_owner_id = request.data.get('new_owner_id')

        if not new_owner_id:
            return Response(
                {'error': 'new_owner_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get current owner membership
        try:
            current_owner_membership = workspace.memberships.get(
                user=request.user,
                role='owner',
                is_active=True
            )
        except Membership.DoesNotExist:
            raise PermissionDenied("Only the workspace owner can transfer ownership.")

        # Get target user and their membership
        try:
            new_owner = User.objects.get(id=new_owner_id)
            new_owner_membership = workspace.memberships.get(
                user=new_owner,
                is_active=True
            )
        except User.DoesNotExist:
            return Response(
                {'error': 'Target user not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Membership.DoesNotExist:
            return Response(
                {'error': 'Target user is not a member of this workspace'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Perform ownership transfer in transaction
        try:
            with transaction.atomic():
                # Update current owner to admin role
                current_owner_membership.role = 'admin'
                current_owner_membership.save()

                # Update new owner role
                new_owner_membership.role = 'owner'
                new_owner_membership.save()

                # Update workspace owner reference
                workspace.owner = new_owner
                workspace.save()

                # Update permissions for both users
                WorkspacePermission.objects.filter(membership=new_owner_membership).delete()
                WorkspacePermission.create_default_permissions(new_owner_membership)

                WorkspacePermission.objects.filter(membership=current_owner_membership).delete()
                WorkspacePermission.create_default_permissions(current_owner_membership)


        except IntegrityError as e:
            return Response(
                {'error': 'Failed to transfer ownership due to database constraint'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        return Response({
            'message': f'Ownership successfully transferred to {new_owner.username}',
            'new_owner': new_owner.username,
            'former_owner': request.user.username
        }, status=status.HTTP_200_OK)

    def log_workspace_activity(self, workspace, action, details=None):
        """
        Log workspace activities for audit trail.

        Creates audit logs for important workspace operations including
        creation, updates, ownership transfers, and deletions.

        Args:
            workspace (Workspace): Target workspace
            action (str): Type of action performed
            details (str, optional): Additional context about the action
        """
        # This would integrate with your audit logging system
        # For now, we'll just update the last_activity_at timestamp
        if hasattr(workspace, 'pk') and workspace.pk:  # Ensure workspace still exists
            workspace.last_activity_at = timezone.now()
            workspace.save(update_fields=['last_activity_at'])


class MembershipViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing workspace membership with role-based access control.

    Handles user membership lifecycle including invitation acceptance, role changes,
    voluntary departure, and administrative removal. Implements comprehensive
    permission validation to prevent unauthorized role escalation.

    Key Features:
    - Role hierarchy enforcement (Owner > Admin > Member > Viewer)
    - Self-service departure (except for owners)
    - Administrative member management
    - Permission synchronization with role changes
    - Membership capacity validation

    Permissions:
    - LIST/RETRIEVE: Workspace members can view membership list
    - CREATE: Admins/Owners can add new members
    - UPDATE: Admins/Owners can modify roles (with restrictions)
    - DELETE: Admins/Owners can remove members, users can remove themselves
    """

    serializer_class = MembershipSerializer
    permission_classes = [drf_permissions.IsAuthenticated, MembershipPermissions]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['workspace', 'role', 'is_active']
    search_fields = ['user__username', 'user__email', 'user__first_name', 'user__last_name']
    ordering_fields = ['assigned_at', 'role']
    ordering = ['-assigned_at']

    def get_queryset(self):
        """
        Filter memberships based on user's workspace access.

        Returns memberships only for workspaces where the requesting user
        has active membership, ensuring proper data isolation.
        """
        if not self.request.user.is_authenticated:
            return Membership.objects.none()

        workspace_pk = self.kwargs.get("workspace_pk")
        if workspace_pk:
            return Membership.objects.filter(
                workspace_id=workspace_pk,
                is_active=True
            ).select_related("user", "workspace", "invited_by")
        # Get all memberships for workspaces where user has access
        user_workspace_ids = Membership.objects.filter(
            user=self.request.user,
            is_active=True
        ).values_list('workspace_id', flat=True)

        return Membership.objects.filter(
            workspace_id__in=user_workspace_ids
        ).select_related('user', 'workspace', 'invited_by')

    @action(detail=False, methods=['post'])
    def leave_workspace(self, request,workspace_pk=None,*args, **kwargs):
        """
        Allow users to voluntarily leave a workspace.

        Handles self-service departure from workspaces with proper validation
        to prevent owners from leaving without transferring ownership first.

        Args:
            workspace_id (uuid): ID of workspace to leave

        Returns:
            Response: Confirmation of successful departure
        """
        workspace_id = workspace_pk or request.data.get("workspace_id")

        if not workspace_id:
            return Response(
                {"error": "workspace_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            membership = Membership.objects.get(
                workspace_id=workspace_id,
                user=request.user,
                is_active=True
            )
        except Membership.DoesNotExist:
            return Response(
                {'error': 'You are not a member of this workspace'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Prevent owners from leaving without transferring ownership
        if membership.role == 'owner':
            return Response(
                {'error': 'Workspace owners cannot leave. Transfer ownership first.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Deactivate membership and related permissions
        with transaction.atomic():
            membership.is_active = False
            membership.save()

            # Clean up related permissions
            if hasattr(membership, 'permissions'):
                membership.permissions.delete()

        return Response({
            'message': f'Successfully left workspace: {membership.workspace.name}'
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], permission_classes=[MembershipPermissions])
    def remove_member(self, request, pk=None,workspace_pk=None, *args, **kwargs):
        """
        Administrative removal of workspace members.

        Allows workspace admins and owners to remove members from the workspace.
        Includes validation to prevent unauthorized removals and maintain
        workspace integrity.

        Returns:
            Response: Confirmation of member removal
        """
        membership = self.get_object()

        # Prevent owners from being removed (they must transfer ownership first)
        if membership.role == 'owner':
            return Response(
                {'error': 'Cannot remove workspace owner. Transfer ownership first.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get requester's membership for logging
        requester_membership = membership.workspace.memberships.get(
            user=request.user,
            is_active=True
        )

        with transaction.atomic():
            # Deactivate membership
            membership.is_active = False
            membership.save()

            # Remove related permissions
            if hasattr(membership, 'permissions'):
                membership.permissions.delete()

        return Response({
            'message': f'Successfully removed {membership.user.username} from workspace',
            'removed_by': requester_membership.role
        }, status=status.HTTP_200_OK)


class WorkspacePermissionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing fine-grained workspace permissions.

    Provides detailed permission control beyond basic roles, allowing
    workspace administrators to customize specific capabilities for
    individual users while maintaining role-based security constraints.

    Key Features:
    - Fine-grained permission management
    - Role-based permission templates
    - Permission inheritance and override
    - Validation against role limitations
    - Resource limit enforcement

    Permissions:
    - LIST/RETRIEVE: Members can view their own permissions
    - UPDATE: Admins/Owners can modify permissions within role constraints
    """

    serializer_class = WorkspacePermissionSerializer
    permission_classes = [drf_permissions.IsAuthenticated, WorkspacePermissionPermissions]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['membership__workspace', 'membership__user']
    search_fields = ['membership__user__username', 'membership__workspace__name']
    ordering_fields = ['created_at', 'updated_at']
    ordering = ['-created_at']

    def get_queryset(self):
        """
        Filter permissions based on user's workspace access and role.

        - All users: can see their own permissions
        - Owners/Admins (with can_manage_users): can see all in their workspace
        """
        if not self.request.user.is_authenticated:
            return WorkspacePermission.objects.none()

        # Workspaces the user belongs to
        user_workspace_ids = Membership.objects.filter(
            user=self.request.user,
            is_active=True
        ).values_list('workspace_id', flat=True)

        queryset = WorkspacePermission.objects.filter(
            membership__workspace_id__in=user_workspace_ids
        ).select_related('membership__user', 'membership__workspace')

        # If using a nested URL, add the workspace_pk constraint
        workspace_pk = self.kwargs.get("workspace_pk")
        if workspace_pk:
            queryset = queryset.filter(membership__workspace_id=workspace_pk)

        return queryset

class InvitationLinkViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing workspace invitation links with security controls.

    Provides comprehensive invitation link management including creation,
    validation, usage tracking, and security controls. Supports flexible
    invitation workflows with role assignment and expiration management.

    Key Features:
    - Secure token-based invitation URLs
    - Role-based invitation creation
    - Usage tracking and limits
    - Expiration management
    - Token validation without authentication
    - Invitation acceptance workflow

    Permissions:
    - CREATE: Any member can create invitations, allowed roles depend on creator's role
        - Owner/Admin: can create admin/member/viewer
        - Member: can create member/viewer
        - Viewer: can only create viewer
    - LIST/RETRIEVE:
        - Default: only see invitations you created
        - With can_manage_invitations: see all invitations in workspace
    - UPDATE/DELETE:
        - Invitation creator OR users with can_manage_invitations
    - validate_token/accept_invitation:
        - Any authenticated user
    """

    serializer_class = InvitationLinkSerializer
    permission_classes = [drf_permissions.IsAuthenticated, InvitationLinkPermissions]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['workspace', 'role', 'is_active', 'created_by']
    search_fields = ['name', 'description']
    ordering_fields = ['created_at', 'expires_at', 'uses_count']
    ordering = ['-created_at']

    def get_permissions(self):
        """
        Override permissions for specific actions.
        """
        if self.action == 'validate_token':
            # Public access for token validation
            return []
        elif self.action == 'accept_invitation':
            # Only require authentication for invitation acceptance
            return [drf_permissions.IsAuthenticated()]
        else:
            # Use default permissions for all other actions
            return super().get_permissions()

    def get_queryset(self):
        """
        Filter invitation links based on user's management permissions.

        Returns invitation links only for workspaces where the user has
        invitation management capabilities (admin/owner roles).
        """
        user = self.request.user
        if not user.is_authenticated:
            return InvitationLink.objects.none()

        # Workspaces where the user has an active membership
        user_workspace_ids = Membership.objects.filter(
            user=user,
            is_active=True
        ).values_list('workspace_id', flat=True)

        qs = InvitationLink.objects.filter(
            workspace_id__in=user_workspace_ids
        ).select_related('workspace', 'created_by')

        # If using a nested URL, add the workspace_pk constraint
        workspace_pk = self.kwargs.get("workspace_pk")
        if workspace_pk:
            qs = qs.filter(workspace_id=workspace_pk)

        # If the user does not have the 'can_manage_invitations' permission,
        # they can only see the invitations they created
        memberships = Membership.objects.filter(
            user=user,
            workspace_id__in=user_workspace_ids,
            is_active=True
        )
        if not any(m.has_permission("can_manage_invitations") for m in memberships):
            qs = qs.filter(created_by=user)

        return qs


    @action(detail=False, methods=['post'], url_path="validate_token")
    def validate_token(self, request):
        """
        Validate invitation token without sensitive data exposure.

        Checks if an invitation token is valid and provides basic information
        about the workspace and role without exposing sensitive details.
        Used in the invitation acceptance flow.

        Args:
            token (uuid): Invitation token to validate

        Returns:
            Response: Token validation result with workspace info
        """
        token = request.data.get("token")
        if not token:
            return Response({"error": "Missing token"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            invitation = InvitationLink.objects.get(token=token)
        except InvitationLink.DoesNotExist:
            return Response({"error": "Invalid token"}, status=status.HTTP_404_NOT_FOUND)

        if not invitation.is_valid:
            return Response({"error": "Invitation expired or inactive"}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "workspace": invitation.workspace.id,
            "workspace_name": invitation.workspace.name,
            "role": invitation.role,
            "invitation_id": str(invitation.id),
        })

    @action(detail=False, methods=['post'], url_path="accept_invitation")
    def accept_invitation(self, request):
        """
        Accept invitation and join workspace automatically.

        Complete invitation acceptance workflow that validates the token,
        creates membership with appropriate role, sets up permissions,
        and records usage for audit trail.

        Process:
        1. Validate invitation token and availability
        2. Check user isn't already a member
        3. Create membership with invitation role
        4. Set up default permissions based on role
        5. Record invitation usage
        6. Update invitation usage counter

        Args:
            token (uuid): Invitation token to accept

        Returns:
            Response: Join confirmation with membership details
        """
        token = request.data.get('token')

        if not token:
            return Response(
                {'error': 'token is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            invitation = InvitationLink.objects.get(token=token)
        except InvitationLink.DoesNotExist:
            return Response(
                {'error': 'Invalid invitation token'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Validate invitation status
        if not invitation.is_valid:
            error_msg = "This invitation link has expired or is no longer active"
            if invitation.is_expired:
                error_msg = "This invitation link has expired"
            elif invitation.is_usage_exceeded:
                error_msg = "This invitation link has reached its usage limit"
            elif not invitation.is_active:
                error_msg = "This invitation link has been deactivated"

            # Record failed attempt
            InvitationUsage.record_join_attempt(
                invitation_link=invitation,
                user=request.user,
                status='link_invalid' if not invitation.is_active else 'link_expired',
                ip_address=self.get_client_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT'),
                notes=error_msg
            )

            return Response(
                {
                    'error': error_msg,
                    'details': {
                        'invitation_id': str(invitation.id),
                        'workspace': str(invitation.workspace.id),
                        'status': 'inactive_expired' if invitation.is_expired else 'usage_exceeded' if invitation.is_usage_exceeded else 'inactive'
                    }
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if user is already a member
        existing_membership = Membership.objects.filter(
            workspace=invitation.workspace,
            user=request.user,
            is_active=True
        ).first()

        if existing_membership:
            # Record attempt
            InvitationUsage.record_join_attempt(
                invitation_link=invitation,
                user=request.user,
                status='already_member',
                ip_address=self.get_client_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT'),
                notes='User is already an active member',
                membership=existing_membership
            )

            return Response(
                {
                    'error': 'You are already a member of this workspace',
                    'details': {
                        'workspace': str(invitation.workspace.id),
                        'membership_role': existing_membership.role,
                        'membership_id': str(existing_membership.id)
                    }
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check workspace capacity
        if invitation.workspace.is_over_user_limit:
            InvitationUsage.record_join_attempt(
                invitation_link=invitation,
                user=request.user,
                status='workspace_full',
                ip_address=self.get_client_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT'),
                notes='Workspace has reached capacity limit'
            )

            return Response(
                {
                    'error': 'Workspace has reached its member capacity',
                    'details': {
                        'workspace': str(invitation.workspace.id),
                        'limit': invitation.workspace.member_limit,
                        'current_members': invitation.workspace.memberships.filter(is_active=True).count()
                    }
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Create membership and permissions
        try:
            with transaction.atomic():
                # Create membership
                membership = Membership.objects.create(
                    workspace=invitation.workspace,
                    user=request.user,
                    role=invitation.role,
                    is_active=True,
                    invited_by=invitation.created_by,
                    invitation_accepted_at=timezone.now()
                )

                # Create default permissions for the role
                WorkspacePermission.create_default_permissions(membership)

                # Record successful usage
                usage_record = InvitationUsage.record_join_attempt(
                    invitation_link=invitation,
                    user=request.user,
                    status='success',
                    ip_address=self.get_client_ip(request),
                    user_agent=request.META.get('HTTP_USER_AGENT'),
                    notes='Successfully joined workspace via invitation',
                    membership=membership
                )

                # Update invitation usage counter
                invitation.increment_usage()

        except IntegrityError as e:
            error_message = str(e)

            # Check if user is already a member
            existing_membership = Membership.objects.filter(
                workspace=invitation.workspace,
                user=request.user
            ).first()

            if existing_membership:
                return Response(
                    {
                        'error': 'You are already a member of this workspace',
                        'details': {
                            'workspace': str(invitation.workspace.id),
                            'membership_role': existing_membership.role,
                            'membership_id': str(existing_membership.id)
                        }
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )

            InvitationUsage.record_join_attempt(
                invitation_link=invitation,
                user=request.user,
                status='error',
                ip_address=self.get_client_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT'),
                notes=f'Database error during join: {error_message}'
            )

            return Response(
                {
                    'error': 'Failed to join workspace',
                    'details': {
                        'message': error_message,
                        'invitation_id': str(invitation.id)
                    }
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        return Response({
            'message': f'Successfully joined workspace: {invitation.workspace.name}',
            'workspace': {
                'id': invitation.workspace.id,
                'name': invitation.workspace.name,
                'description': invitation.workspace.description
            },
            'membership': {
                'role': membership.role,
                'assigned_at': membership.assigned_at
            },
            'invitation': {
                'name': invitation.name,
                'created_by': invitation.created_by.username
            }
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None, workspace_pk=None, *args, **kwargs):
        """
        Deactivate invitation link to prevent further usage.

        Allows workspace administrators to disable invitation links
        while preserving usage history for audit purposes.

        Args:
            reason (str, optional): Reason for deactivation

        Returns:
            Response: Confirmation of deactivation
        """
        invitation = self.get_object()
        reason = request.data.get('reason', 'Deactivated by administrator')

        invitation.deactivate(reason)

        return Response({
            'message': 'Invitation link deactivated successfully',
            'reason': reason
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def cleanup_expired(self, request, workspace_pk=None, *args, **kwargs):
        """
        Cleanup expired invitation links for maintenance.

        Administrative function to remove old expired links and maintain
        database cleanliness. Can be called manually or via scheduled tasks.

        Returns:
            Response: Cleanup statistics
        """
        # Check if user has admin permissions in any workspace
        has_admin_access = Membership.objects.filter(
            user=request.user,
            is_active=True,
            role__in=['owner', 'admin']
        ).exists()

        if not has_admin_access:
            raise PermissionDenied("Only workspace administrators can perform cleanup operations.")

        # Perform cleanup
        cleaned_count = InvitationLink.objects.cleanup_expired_links()

        return Response({
            'message': 'Expired invitation links cleaned up successfully',
            'cleaned_count': cleaned_count
        }, status=status.HTTP_200_OK)

    def get_client_ip(self, request):
        """
        Extract client IP address from request for audit logging.

        Handles various proxy configurations to get the real client IP
        for security auditing and usage tracking.
        """
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip

    def retrieve(self, request, *args, **kwargs):
        invitation = self.get_object()
        url = invitation.get_invitation_url(request=request)
        return Response({"url": url})


class InvitationUsageViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only ViewSet for invitation usage audit trail.

    Provides access to invitation usage history for auditing, analytics,
    and troubleshooting invitation workflows. Supports filtering and
    searching to analyze invitation patterns and workspace growth.

    Key Features:
    - Comprehensive usage tracking and analytics
    - Security audit trail for invitation acceptance
    - Workspace growth and onboarding analytics
    - Failed attempt tracking for security monitoring

    Permissions:
    - LIST/RETRIEVE: Admins/Owners can view usage records for their workspaces
    """

    serializer_class = InvitationUsageSerializer
    permission_classes = [drf_permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['workspace', 'invitation_link', 'user', 'status', 'assigned_role']
    search_fields = ['user__username', 'user__email', 'workspace__name', 'invitation_link__name']
    ordering_fields = ['joined_at', 'status']
    ordering = ['-joined_at']

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return InvitationUsage.objects.none()

        # All workspaces where the user is a member
        user_workspace_ids = Membership.objects.filter(
            user=user,
            is_active=True
        ).values_list('workspace_id', flat=True)

        qs = InvitationUsage.objects.filter(
            workspace_id__in=user_workspace_ids
        ).select_related('workspace', 'invitation_link', 'user')

        # If nested URL, restrict by workspace_pk
        workspace_pk = self.kwargs.get("workspace_pk")
        if workspace_pk:
            qs = qs.filter(workspace_id=workspace_pk)

        # If user has no can_manage_invitations → only see usage of links they created
        memberships = Membership.objects.filter(
            user=user,
            workspace_id__in=user_workspace_ids,
            is_active=True
        )
        if not any(m.has_permission("can_manage_invitations") for m in memberships):
            qs = qs.filter(invitation_link__created_by=user)

        return qs

    @action(detail=False, methods=['get'])
    def workspace_stats(self, request, workspace_pk=None, *args, **kwargs):
        """
        Get invitation usage statistics for workspace analytics.

        Provides comprehensive statistics about invitation usage patterns,
        success rates, and workspace growth metrics for administrative
        analysis and reporting.

        Query Parameters:
            workspace_id (uuid): Specific workspace to analyze
            date_from (date): Start date for analysis period
            date_to (date): End date for analysis period

        Returns:
            Response: Detailed invitation usage statistics
        """
        workspace_id = workspace_pk or request.query_params.get('workspace_id')
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')

        if not workspace_id:
            return Response(
                {'error': 'workspace_id parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Verify user has access to this workspace
        try:
            workspace = Workspace.objects.get(id=workspace_id)
            membership = workspace.memberships.get(
                user=request.user,
                is_active=True,
                role__in=['owner', 'admin']
            )
        except (Workspace.DoesNotExist, Membership.DoesNotExist):
            raise PermissionDenied("Access denied to workspace statistics.")

        # Build query for usage records
        queryset = InvitationUsage.objects.filter(workspace=workspace)

        if date_from:
            queryset = queryset.filter(joined_at__gte=date_from)
        if date_to:
            queryset = queryset.filter(joined_at__lte=date_to)

        # Calculate statistics
        total_attempts = queryset.count()
        successful_joins = queryset.filter(status='success').count()
        failed_attempts = queryset.exclude(status='success').count()

        # Status breakdown
        status_breakdown = {}
        for status_code, status_name in InvitationUsage.JOIN_STATUS_CHOICES:
            count = queryset.filter(status=status_code).count()
            if count > 0:
                status_breakdown[status_name] = count

        # Role assignment breakdown for successful joins
        role_breakdown = {}
        successful_usage = queryset.filter(status='success')
        for role_code, role_name in Membership.ROLE_CHOICES:
            count = successful_usage.filter(assigned_role=role_code).count()
            if count > 0:
                role_breakdown[role_name] = count

        # Recent activity (last 30 days)
        from datetime import timedelta
        recent_cutoff = timezone.now() - timedelta(days=30)
        recent_joins = queryset.filter(
            joined_at__gte=recent_cutoff,
            status='success'
        ).count()

        # Most active invitation links
        active_links = queryset.values(
            'invitation_link__name',
            'invitation_link__id'
        ).annotate(
            usage_count=models.Count('id'),
            success_count=models.Count('id', filter=models.Q(status='success'))
        ).order_by('-usage_count')[:5]

        return Response({
            'workspace': {
                'id': workspace.id,
                'name': workspace.name
            },
            'period': {
                'date_from': date_from,
                'date_to': date_to
            },
            'summary': {
                'total_attempts': total_attempts,
                'successful_joins': successful_joins,
                'failed_attempts': failed_attempts,
                'success_rate': round((successful_joins / total_attempts * 100) if total_attempts > 0 else 0, 2),
                'recent_joins_30d': recent_joins
            },
            'breakdown': {
                'by_status': status_breakdown,
                'by_role': role_breakdown
            },
            'top_invitation_links': list(active_links)
        }, status=status.HTTP_200_OK)

#The following feature is temporarily deprecated due to incomplete related modules.
# Please IGNORE it for now!!!!

# Additional utility viewsets and mixins for workspace resource management

# class WorkspaceResourceViewMixin:
#     """
#     Mixin for ViewSets that manage workspace-related resources.
#
#     Provides common functionality for resources that belong to workspaces
#     and require workspace-based permissions and data isolation.
#
#     Features:
#     - Automatic workspace context extraction
#     - Permission validation based on resource requirements
#     - Multi-tenant data filtering
#     """
#
#     def get_workspace_from_request(self, request):
#         """
#         Extract workspace context from request data or URL parameters.
#
#         Attempts to determine the target workspace from various sources
#         including request data, URL parameters, and object relationships.
#         """
#         # Try to get workspace from request data
#         workspace_id = request.data.get('workspace_id') or request.query_params.get('workspace_id')
#
#         if workspace_id:
#             try:
#                 return Workspace.objects.get(id=workspace_id)
#             except Workspace.DoesNotExist:
#                 return None
#
#         # Try to get from object if it exists
#         if hasattr(self, 'get_object'):
#             try:
#                 obj = self.get_object()
#                 if hasattr(obj, 'workspace'):
#                     return obj.workspace
#             except:
#                 pass
#
#         return None
#
#     def check_workspace_permission(self, user, workspace, permission_name):
#         """
#         Check if user has specific permission in workspace.
#
#         Validates user membership and checks fine-grained permissions
#         for workspace resource operations.
#
#         Args:
#             user: Requesting user
#             workspace: Target workspace
#             permission_name: Specific permission to check
#
#         Returns:
#             bool: True if user has permission
#         """
#         try:
#             membership = workspace.memberships.get(
#                 user=user,
#                 is_active=True
#             )
#             return membership.has_permission(permission_name)
#         except Membership.DoesNotExist:
#             return False
#
#
# class AssetManagementViewSet(viewsets.ModelViewSet, WorkspaceResourceViewMixin):
#     """
#     Example ViewSet demonstrating workspace resource permission usage.
#
#     This would be used for managing assets (images, videos, etc.) within
#     workspaces with proper permission controls based on WorkspacePermission
#     settings and role-based access.
#
#     Note: This is a template/example - replace with your actual asset model
#     """
#
#     permission_classes = [
#         drf_permissions.IsAuthenticated,
#         WorkspaceResourcePermission('can_view_library')  # Base permission
#     ]
#
#     def get_permissions(self):
#         """
#         Dynamic permissions based on action type.
#
#         Applies different permission requirements based on the operation
#         being performed on workspace resources.
#         """
#         permission_classes = [drf_permissions.IsAuthenticated]
#
#         if self.action == 'create':
#             permission_classes.append(WorkspaceResourcePermission('can_upload_assets'))
#         elif self.action in ['update', 'partial_update']:
#             permission_classes.append(WorkspaceResourcePermission('can_edit_variants'))
#         elif self.action == 'destroy':
#             permission_classes.append(WorkspaceResourcePermission('can_manage_settings'))
#         else:  # list, retrieve
#             permission_classes.append(WorkspaceResourcePermission('can_view_library'))
#
#         return [permission() for permission in permission_classes]
#
#     def get_queryset(self):
#         """
#         Filter assets based on user's workspace access.
#
#         Returns only assets from workspaces where the user has appropriate
#         viewing permissions, ensuring proper data isolation.
#         """
#         if not self.request.user.is_authenticated:
#             return self.model.objects.none()
#
#         # Get accessible workspace IDs
#         accessible_workspaces = Membership.objects.filter(
#             user=self.request.user,
#             is_active=True
#         ).values_list('workspace_id', flat=True)
#
#         # Filter assets by accessible workspaces
#         return self.model.objects.filter(
#             workspace_id__in=accessible_workspaces
#         )
#
#     @action(detail=False, methods=['post'])
#     def bulk_upload(self, request):
#         """
#         Bulk asset upload with workspace permission validation.
#
#         Demonstrates how to implement bulk operations while maintaining
#         proper permission controls and resource limits.
#         """
#         workspace = self.get_workspace_from_request(request)
#         if not workspace:
#             return Response(
#                 {'error': 'workspace_id is required for bulk upload'},
#                 status=status.HTTP_400_BAD_REQUEST
#             )
#
#         # Check upload permission
#         if not self.check_workspace_permission(request.user, workspace, 'can_upload_assets'):
#             raise PermissionDenied("Insufficient permissions for asset upload.")
#
#         # Check upload limits
#         try:
#             membership = workspace.memberships.get(user=request.user, is_active=True)
#             user_permissions = membership.permissions
#             max_upload_mb = user_permissions.max_upload_size_mb
#
#             # Validate file sizes against user limit
#             # Implementation would check actual file sizes here
#
#         except WorkspacePermission.DoesNotExist:
#             return Response(
#                 {'error': 'User permissions not configured'},
#                 status=status.HTTP_500_INTERNAL_SERVER_ERROR
#             )
#
#         # Process bulk upload
#         # Implementation would handle actual file processing here
#
#         return Response({
#             'message': 'Bulk upload completed successfully',
#             'workspace_id': workspace.id,
#             'uploaded_count': 0  # Would be actual count
#         }, status=status.HTTP_201_CREATED)
#
#
# # Export all ViewSets for importing in urls.py
# __all__ = [
#     'WorkspaceViewSet',
#     'MembershipViewSet',
#     'WorkspacePermissionViewSet',
#     'InvitationLinkViewSet',
#     'InvitationUsageViewSet',
#     'WorkspaceResourceViewMixin',
#     'AssetManagementViewSet'
# ]
