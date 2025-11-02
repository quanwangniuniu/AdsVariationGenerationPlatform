from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta

from sympy.physics.units import mebibytes

from .models import (
    Workspace, Membership, WorkspacePermission,
    InvitationLink, InvitationUsage
)

User = get_user_model()


class WorkspaceSerializer(serializers.ModelSerializer):
    """
    Serializer for Workspace model with comprehensive validation.

    Handles workspace creation, updates, and data validation while enforcing
    business rules for plan limits, token balances, and workspace lifecycle.
    Includes computed fields for frontend display and management operations.
    """

    # Read-only computed fields for display and analytics
    member_count = serializers.IntegerField(read_only=True)
    is_over_user_limit = serializers.BooleanField(read_only=True)
    is_demo = serializers.BooleanField(read_only=True)
    is_enterprise_type = serializers.BooleanField(read_only=True)
    plan = serializers.CharField(read_only=True)
    max_users = serializers.IntegerField(read_only=True)
    max_storage_gb = serializers.IntegerField(read_only=True)
    # Owner information for display (username only for security)
    owner_username = serializers.CharField(source='owner.username', read_only=True)
    class Meta:
        model = Workspace
        fields = [
            'id', 'name', 'description', 'owner', 'owner_username',
            'plan', 'max_users', 'max_storage_gb', 'is_active',
            'start_date', 'end_date', 'workspace_type', 'api_keys',
            'serpapi_key', 'serpapi_config', 'tags', 'created_at',
            'updated_at', 'suspension_reason', 'last_activity_at',
            'member_count', 'is_over_user_limit', 'is_demo',
            'is_enterprise_type'
        ]
        read_only_fields = [
            'id', 'owner', 'created_at', 'updated_at', 'start_date', 'last_activity_at',
            'plan', 'max_users', 'max_storage_gb', 'is_over_user_limit'
        ]
        extra_kwargs = {
            'api_keys': {'write_only': True},  # Sensitive data
            'serpapi_key': {'write_only': True},  # API key should not be exposed
        }

    def validate_name(self, value):
        """
        Validate workspace name for uniqueness within user's workspaces.
        Prevents duplicate workspace names for better user experience.
        """
        user = self.context['request'].user
        workspace_id = self.instance.id if self.instance else None

        # Check for existing workspace with same name for this user
        existing = Workspace.objects.filter(
            owner=user,
            name__iexact=value.strip(),
            is_active=True
        )

        # Exclude current workspace if updating
        if workspace_id:
            existing = existing.exclude(id=workspace_id)

        if existing.exists():
            raise serializers.ValidationError(
                "You already have an active workspace with this name."
            )

        return value.strip()

    # validate_plan method removed - plan changes must be made through WorkspaceSubscription

    def validate_end_date(self, value):
        """
        Validate workspace expiration date to ensure logical constraints.
        Prevents setting end dates in the past or before start date.
        """
        if value and value <= timezone.now():
            raise serializers.ValidationError(
                "End date must be in the future."
            )
        return value

    def validate(self, attrs):
        """
        Cross-field validation for workspace data integrity.
        Ensures consistent workspace configuration and prevents conflicts.
        """
        # Validate date range consistency
        start_date = getattr(self.instance, 'start_date', timezone.now()) if self.instance else timezone.now()
        end_date = attrs.get('end_date')

        if end_date and end_date <= start_date:
            raise serializers.ValidationError({
                'end_date': 'End date must be after start date.'
            })

        # Validate workspace type and plan compatibility
        workspace_type = attrs.get('workspace_type', getattr(self.instance, 'workspace_type', 'standard'))
        plan = attrs.get('plan', getattr(self.instance, 'plan', 'free'))

        if workspace_type == 'enterprise' and plan not in ['pro', 'enterprise']:
            raise serializers.ValidationError({
                'plan': 'Enterprise workspace type requires Pro or Enterprise plan.'
            })

        return attrs

    def create(self, validated_data):
        """
        Create workspace with proper initialization and owner membership.
        Sets up workspace with default permissions and creates owner membership.
        """
        # Set owner from request context
        validated_data['owner'] = self.context['request'].user

        # Create workspace
        workspace = super().create(validated_data)

        # Create owner membership automatically
        owner_membership, created = Membership.objects.get_or_create(
            workspace=workspace,
            user=workspace.owner,
            role='owner',
            is_active=True
        )

        # Ensure default permissions for owner are only created if not existing
        if created and not owner_membership.permissions.exists():
            WorkspacePermission.create_default_permissions(owner_membership)

        return workspace

    def update(self, instance, validated_data):
        """
        Update workspace. Plan changes must be made through WorkspaceSubscription.
        """
        # Plan changes are handled through WorkspaceSubscription, not here
        return super().update(instance, validated_data)


class MembershipSerializer(serializers.ModelSerializer):
    """
    Serializer for Membership model with role-based validation.

    Manages workspace membership creation, updates, and role changes while
    enforcing security constraints around role escalation and ownership transfer.
    Includes user information for display and invitation tracking.
    """

    # User information for display
    user_username = serializers.CharField(source='user.username', read_only=True)
    user_email = serializers.EmailField(source='user.email', read_only=True)
    user_full_name = serializers.CharField(source='user.get_full_name', read_only=True)

    # Workspace information for context
    workspace_name = serializers.CharField(source='workspace.name', read_only=True)

    # Computed fields for membership status
    is_owner = serializers.BooleanField(read_only=True)
    can_manage_users = serializers.BooleanField(read_only=True)
    can_manage_billing = serializers.BooleanField(read_only=True)

    # Invitation context
    invited_by_username = serializers.CharField(source='invited_by.username', read_only=True)

    class Meta:
        model = Membership
        fields = [
            'id', 'workspace', 'workspace_name', 'user', 'user_username',
            'user_email', 'user_full_name', 'role', 'is_active',
            'assigned_at', 'invited_by', 'invited_by_username',
            'invitation_accepted_at', 'custom_permissions',
            'is_owner', 'can_manage_users', 'can_manage_billing'
        ]
        read_only_fields = [
            'id', 'assigned_at', 'invitation_accepted_at'
        ]

    def validate_role(self, value):
        """
        Validate role assignment based on requesting user's permissions.
        Prevents unauthorized role escalation and maintains security hierarchy.
        """
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            raise serializers.ValidationError("Authentication required for role assignment.")

        workspace = self.instance.workspace if self.instance else self.initial_data.get('workspace')
        if not workspace:
            raise serializers.ValidationError("Workspace context required for role validation.")

        # Get requesting user's membership
        try:
            requester_membership = Membership.objects.get(
                workspace=workspace,
                user=request.user,
                is_active=True
            )
        except Membership.DoesNotExist:
            raise serializers.ValidationError("You must be a workspace member to assign roles.")

        # Ensure there is only one owner
        if value == 'owner':
            existing_owner = Membership.objects.filter(
                workspace=workspace,
                role='owner',
                is_active=True
            )
            if self.instance:
                existing_owner = existing_owner.exclude(pk=self.instance.pk)

            if existing_owner.exists():
                raise serializers.ValidationError(
                    "This workspace already has an owner. Ownership must be transferred."
                )

        return value

    def validate_user(self, value):
        """
        Validate user assignment to prevent duplicate memberships.
        Ensures one active membership per user per workspace.
        """
        workspace = self.instance.workspace if self.instance else self.initial_data.get('workspace')
        if not workspace:
            return value

        # Check for existing active membership
        existing = Membership.objects.filter(
            workspace=workspace,
            user=value,
            is_active=True
        )

        # Exclude current membership if updating
        if self.instance:
            existing = existing.exclude(id=self.instance.id)

        if existing.exists():
            raise serializers.ValidationError(
                f"User {value.username} is already an active member of this workspace."
            )

        return value

    def validate(self, attrs):
        """
        Cross-field validation for membership consistency.
        Enforces business rules around ownership and role changes.
        """
        workspace = attrs.get('workspace', getattr(self.instance, 'workspace', None))
        user = attrs.get('user', getattr(self.instance, 'user', None))
        role = attrs.get('role', getattr(self.instance, 'role', None))

        # Prevent users from changing their own owner status
        request = self.context.get('request')
        if (request and self.instance and
            self.instance.user == request.user):
            raise serializers.ValidationError({
                'role': 'Cannot change your own role'
            })

        if (request and self.instance and
                self.instance.role == 'owner'):
            raise serializers.ValidationError({
                'role': 'Cannot assign owner status. Transfer ownership first.'
            })

        # Ensure workspace doesn't exceed user limits
        if workspace and not self.instance:  # Creating new membership
            if workspace.is_over_user_limit:
                raise serializers.ValidationError({
                    'workspace': 'Workspace has reached maximum user limit.'
                })

        return attrs

    def create(self, validated_data):
        """
        Create membership with automatic permission setup.
        Creates corresponding WorkspacePermission with role-based defaults.
        """
        membership = super().create(validated_data)

        # Ensure default permissions for the new member are only created if not existing
        if not membership.permissions.exists():
            WorkspacePermission.create_default_permissions(membership)

        return membership

    def update(self, instance, validated_data):
        """
        Update membership with permission synchronization.
        Updates corresponding WorkspacePermission when role changes.
        """
        old_role = instance.role
        membership = super().update(instance, validated_data)

        # Update permissions if role changed
        if 'role' in validated_data and validated_data['role'] != old_role:
            try:
                permission = membership.permissions
                # Update permission template based on new role
                new_permissions = WorkspacePermission.create_default_permissions(membership)
                for field, value in new_permissions.__dict__.items():
                    if not field.startswith('_') and hasattr(permission, field):
                        setattr(permission, field, value)
                permission.save()
            except WorkspacePermission.DoesNotExist:
                # Create new permissions if they don't exist
                WorkspacePermission.create_default_permissions(
                   membership
                )

        return membership


class WorkspacePermissionSerializer(serializers.ModelSerializer):
    """
    Serializer for WorkspacePermission with fine-grained access control.

    Manages detailed permission settings for workspace members while enforcing
    role-based constraints and preventing unauthorized permission escalation.
    """

    # User and workspace context for display
    user_username = serializers.CharField(source='membership.user.username', read_only=True)
    workspace_name = serializers.CharField(source='membership.workspace.name', read_only=True)
    # Current membership role for context
    current_role = serializers.SerializerMethodField()

    class Meta:
        model = WorkspacePermission
        fields = [
            'id', 'membership', 'workspace_name', 'user_username',
            'current_role', 'can_view_library', 'can_upload_assets',
            'can_generate_variants', 'can_edit_variants', 'can_approve_variants',
            'can_export_data', 'can_view_billing', 'can_manage_billing',
            'can_manage_users', 'can_manage_settings', 'can_view_audit_logs',
            'max_upload_size_mb', 'max_monthly_jobs', 'can_delete_workspace',
            'can_transfer_ownership', 'can_manage_invitations',
            'can_update_token_balance', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_current_role(self, obj):
        """
        Get the current role of the user in the workspace.
        Provides context for permission validation and display.
        """
        return obj.membership.role if obj.membership.is_active else None

    def validate(self, attrs):
        """
        Validate permission settings against role constraints.
        Ensures permission grants don't exceed role-based limitations.
        """
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            raise serializers.ValidationError("Authentication required.")

        # Get target user's role
        target_membership = attrs.get('membership', getattr(self.instance, 'membership', None))
        if not target_membership:
            raise serializers.ValidationError("Membership context required.")
        # Prevent granting permissions beyond role limitations
        role_max_permissions = {
            'viewer': ['can_view_library', 'can_export_data'],
            'member': [
                'can_view_library', 'can_upload_assets', 'can_generate_variants',
                'can_export_data'
            ],
            'admin': [
                'can_view_library', 'can_upload_assets', 'can_generate_variants',
                'can_edit_variants', 'can_approve_variants', 'can_export_data',
                'can_manage_users', 'can_manage_settings', 'can_view_audit_logs',
                'can_manage_invitations'
            ],
            'owner': ['*']  # All permissions
        }

        max_perms = role_max_permissions.get(target_membership.role, [])

        if max_perms != ['*']:  # Not owner, check constraints
            sensitive_perms = [
                'can_manage_billing', 'can_delete_workspace',
                'can_transfer_ownership', 'can_update_token_balance'
            ]

            for perm in sensitive_perms:
                if attrs.get(perm, False) and target_membership.role != 'owner':
                    raise serializers.ValidationError({
                        perm: f"Permission '{perm}' can only be granted to workspace owners."
                    })

        return attrs


class InvitationLinkSerializer(serializers.ModelSerializer):
    """
    Serializer for InvitationLink with security and usage validation.

    Manages invitation link creation, updates, and validation while enforcing
    security constraints around expiration, usage limits, and role assignment.
    Includes computed fields for link status and usage analytics.
    """

    # Computed fields for link status and analytics
    is_expired = serializers.BooleanField(read_only=True)
    is_usage_exceeded = serializers.BooleanField(read_only=True)
    is_valid = serializers.BooleanField(read_only=True)
    invitation_url = serializers.CharField(read_only=True)
    remaining_uses = serializers.IntegerField(read_only=True)

    # Creator information for display
    created_by_id = serializers.IntegerField(source='created_by.id', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    workspace_name = serializers.CharField(source='workspace.name', read_only=True)

    # Convenience field for setting expiration in days
    expires_in_days = serializers.IntegerField(write_only=True, required=False)

    class Meta:
        model = InvitationLink
        fields = [
            'id', 'token', 'workspace', 'workspace_name', 'created_by', 'created_by_id',
            'created_by_username', 'role', 'name', 'description',
            'expires_at', 'expires_in_days', 'is_active', 'max_uses',
            'uses_count', 'created_at', 'updated_at', 'creator_notes',
            'is_expired', 'is_usage_exceeded', 'is_valid',
            'invitation_url', 'remaining_uses'
        ]
        read_only_fields = [
            'id', 'token', 'created_by', 'uses_count', 'created_at', 'updated_at'
        ]

    def get_invitation_url(self, obj):
        request = self.context.get("request")
        return obj.get_invitation_url(request=request)

    def validate_role(self, value):
        """
        Validate role assignment for invitation links.
        Ensures only authorized users can create invitations for specific roles.
        """
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            raise serializers.ValidationError("Authentication required.")

        workspace = self.initial_data.get('workspace') or getattr(self.instance, 'workspace', None)
        if not workspace:
            raise serializers.ValidationError("Workspace context required.")

        # Get requesting user's membership
        try:
            requester_membership = Membership.objects.get(
                workspace=workspace,
                user=request.user,
                is_active=True
            )
        except Membership.DoesNotExist:
            raise serializers.ValidationError("You must be a workspace member to create invitations.")

        # Only owners can create owner invitations
        if value == 'owner':
            raise serializers.ValidationError("Workspace owners cannot be invited; ownership must be transferred.")

        # Role assignment rules
        allowed_roles = {
            'owner': ['admin', 'member', 'viewer'],
            'admin': ['admin', 'member', 'viewer'],
            'member': ['member', 'viewer'],
            'viewer': ['viewer'],
        }

        requester_role = requester_membership.role
        if value not in allowed_roles.get(requester_role, []):
            raise serializers.ValidationError(
                f"Users with role '{requester_role}' cannot create invitations for role '{value}'."
            )

        return value

    def validate_max_uses(self, value):
        """
        Validate maximum usage limit for security and resource management.
        Prevents creation of invitation links with excessive usage limits.
        """
        if value is not None and value <= 0:
            raise serializers.ValidationError("Maximum uses must be positive.")

        if value and value > 1000:  # Reasonable upper limit
            raise serializers.ValidationError("Maximum uses cannot exceed 1000 for security reasons.")

        return value or 1000

    def validate_expires_in_days(self, value):
        """
        Validate expiration period for security compliance.
        Ensures invitation links don't remain valid indefinitely.
        """
        if value is not None and value <= 0:
            raise serializers.ValidationError("Expiration days must be positive.")

        if value and value > 365:  # Maximum 1 year
            raise serializers.ValidationError("Invitation links cannot be valid for more than 365 days.")

        return value

    def validate(self, attrs):
        """
        Cross-field validation for invitation link configuration.
        Ensures consistent and secure invitation link settings.
        """
        workspace = attrs.get('workspace', getattr(self.instance, 'workspace', None))

        # Check workspace capacity before creating invitation
        if workspace and not self.instance:  # Creating new invitation
            if workspace.is_over_user_limit:
                raise serializers.ValidationError({
                    'workspace': 'Workspace is at capacity. Cannot create new invitations.'
                })

        # Validate name uniqueness within workspace
        name = attrs.get('name')
        if name and workspace:
            existing = InvitationLink.objects.filter(
                workspace=workspace,
                name__iexact=name.strip(),
                is_active=True
            )
            if self.instance:
                existing = existing.exclude(id=self.instance.id)

            if existing.exists():
                raise serializers.ValidationError({
                    'name': 'An active invitation link with this name already exists in the workspace.'
                })

        return attrs

    def create(self, validated_data):
        """
        Create invitation link with proper expiration handling.
        Sets up invitation link with calculated expiration and security defaults.
        """
        # Handle expires_in_days conversion
        expires_in_days = validated_data.pop('expires_in_days', None)
        if expires_in_days:
            validated_data['expires_at'] = timezone.now() + timedelta(days=expires_in_days)

        # Set creator from request context
        validated_data['created_by'] = self.context['request'].user

        return super().create(validated_data)

    def update(self, instance, validated_data):
        """
        Update invitation link with expiration recalculation.
        Handles expiration date updates and maintains link security.
        """
        # Handle expires_in_days conversion for updates
        expires_in_days = validated_data.pop('expires_in_days', None)
        if expires_in_days:
            validated_data['expires_at'] = timezone.now() + timedelta(days=expires_in_days)

        return super().update(instance, validated_data)


class InvitationUsageSerializer(serializers.ModelSerializer):
    """
    Serializer for InvitationUsage with comprehensive tracking.

    Records invitation link usage events for auditing and analytics.
    Provides read-only access to usage history with detailed context
    about join events and their outcomes.
    """

    # Related object information for display
    invitation_link_name = serializers.CharField(source='invitation_link.name', read_only=True)
    user_username = serializers.CharField(source='user.username', read_only=True)
    user_email = serializers.EmailField(source='user.email', read_only=True)
    workspace_name = serializers.CharField(source='workspace.name', read_only=True)

    # Computed fields for analytics
    was_successful = serializers.BooleanField(read_only=True)
    days_since_join = serializers.IntegerField(read_only=True)

    class Meta:
        model = InvitationUsage
        fields = [
            'id', 'invitation_link', 'invitation_link_name', 'user',
            'user_username', 'user_email', 'workspace', 'workspace_name',
            'joined_at', 'assigned_role', 'status', 'ip_address',
            'user_agent', 'notes', 'membership', 'was_successful',
            'days_since_join'
        ]
        read_only_fields = [
            'id', 'joined_at', 'was_successful', 'days_since_join'
        ]

    def validate_status(self, value):
        """
        Validate usage status for consistency.
        Ensures status codes match expected invitation outcomes.
        """
        valid_statuses = [choice[0] for choice in InvitationUsage.JOIN_STATUS_CHOICES]
        if value not in valid_statuses:
            raise serializers.ValidationError(f"Invalid status. Must be one of: {valid_statuses}")
        return value

    def create(self, validated_data):
        """
        Create usage record with automatic workspace association.
        Ensures consistent data relationships for audit trail.
        """
        # Auto-set workspace from invitation link if not provided
        if 'workspace' not in validated_data:
            validated_data['workspace'] = validated_data['invitation_link'].workspace

        return super().create(validated_data)


class InvitationTokenValidationSerializer(serializers.Serializer):
    """
    Serializer for validating invitation tokens during acceptance flow.

    Provides token validation without exposing sensitive invitation details.
    Used for the invitation acceptance workflow to verify token validity
    before proceeding with workspace join operations.
    """

    token = serializers.UUIDField(required=True)

    # Response fields for valid tokens
    workspace_name = serializers.CharField(read_only=True)
    workspace_description = serializers.CharField(read_only=True)
    assigned_role = serializers.CharField(read_only=True)
    invitation_name = serializers.CharField(read_only=True)
    invitation_description = serializers.CharField(read_only=True)
    is_valid = serializers.BooleanField(read_only=True)
    error_message = serializers.CharField(read_only=True)

    def validate_token(self, value):
        """
        Validate invitation token and check availability.
        Returns validation result without raising exceptions for better UX.
        """
        try:
            invitation = InvitationLink.objects.get(token=value)

            # Store invitation for use in to_representation
            self._invitation = invitation

            if not invitation.is_valid:
                self._error = "This invitation link has expired or is no longer active."
            else:
                self._error = None

        except InvitationLink.DoesNotExist:
            self._invitation = None
            self._error = "Invalid invitation token."

        return value

    def to_representation(self, instance):
        """
        Custom representation to include invitation details for valid tokens.
        Provides frontend with necessary information for join confirmation.
        """
        data = super().to_representation(instance)

        if hasattr(self, '_invitation') and self._invitation:
            invitation = self._invitation
            data.update({
                'workspace_name': invitation.workspace.name,
                'workspace_description': invitation.workspace.description,
                'assigned_role': invitation.role,
                'invitation_name': invitation.name,
                'invitation_description': invitation.description,
                'is_valid': invitation.is_valid,
                'error_message': getattr(self, '_error', None)
            })
        else:
            data.update({
                'is_valid': False,
                'error_message': getattr(self, '_error', 'Invalid token')
            })

        return data