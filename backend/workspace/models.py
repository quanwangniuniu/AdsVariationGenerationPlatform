import uuid
from django.db import models
from django.db.utils import IntegrityError
from django.core.validators import MinValueValidator, MaxValueValidator
from django.contrib.auth import get_user_model
from datetime import timedelta
from django.utils import timezone
from django.core.exceptions import ValidationError
# Get the User model (supports custom user models)
User = get_user_model()


class Workspace(models.Model):
    """
    Workspace model - Core entity for multi-tenant architecture

    Represents a collaborative workspace where teams can manage their ad creative projects.
    Originally based on Campaign model but redefined to support workspace-centric approach.
    Each workspace provides isolated environment for:
    - Team collaboration and role management
    - Token balance and billing management
    - SerpAPI configuration and data isolation
    - Asset and creative management
    """

    # Primary identification using UUID for global uniqueness and security
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        help_text="Unique identifier for the workspace"
    )

    # Basic workspace information
    name = models.CharField(
        max_length=200,
        help_text="Workspace name for identification"
    )
    description = models.TextField(
        blank=True,
        null=True,
        help_text="Optional description explaining workspace purpose"
    )

    # Ownership and access control
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='owned_workspaces',
        help_text="User who created and owns this workspace - has all permissions"
    )

    # Subscription and billing management
    PLAN_CHOICES = [
        ('free', 'Free Plan'),
        ('basic', 'Basic Plan'),
        ('pro', 'Professional Plan'),
        ('enterprise', 'Enterprise Plan'),
    ]
    plan = models.CharField(
        max_length=50,
        choices=PLAN_CHOICES,
        default='free',
        help_text="Subscription plan determining feature access and limits"
    )

    PLAN_CONFIG = {
            'free': {
                'max_users': 10,
                'max_storage_gb': 20,
            },
            'basic': {
                'max_users': 50,
                'max_storage_gb': 100,
            },
            'pro': {
                'max_users': 200,
                'max_storage_gb': 500,
            },
            'enterprise': {
                'max_users': 1000,
                'max_storage_gb': 2000,
            }
        }
     # Resource limits and quotas
    max_users = models.IntegerField(
        default=10,
        validators=[MinValueValidator(1), MaxValueValidator(1000)],
        help_text="Maximum number of users allowed in this workspace"
    )
    max_storage_gb = models.IntegerField(
        default=20,
        validators=[MinValueValidator(1)],
        help_text="Maximum storage capacity in GB for assets and files"
    )
    # Workspace lifecycle management
    is_active = models.BooleanField(
        default=True,
        help_text="Whether workspace is active and accessible to members"
    )
    start_date = models.DateTimeField(
        auto_now_add=True,
        help_text="When workspace was created"
    )
    end_date = models.DateTimeField(
        blank=True,
        null=True,
        help_text="Optional expiration date for temporary workspaces"
    )

    # Workspace configuration and settings
    WORKSPACE_TYPE_CHOICES = [
        ('standard', 'Standard Workspace'),
        ('demo', 'Demo/Trial Workspace'),
        ('enterprise', 'Enterprise Workspace'),
    ]
    workspace_type = models.CharField(
        max_length=20,
        choices=WORKSPACE_TYPE_CHOICES,
        default='standard',
        help_text="Type of workspace affecting available features"
    )

    # API integrations and external service configurations
    api_keys = models.JSONField(
        default=dict,
        null=True,
        blank=True,
        help_text="Storage for various API keys and external service configurations"
    )

    # SerpAPI settings
    serpapi_key = models.CharField(
        max_length=200,
        blank=True,
        null=True,
        help_text="SerpAPI key for fetching Google Ads Transparency Center data"
    )
    serpapi_config = models.JSONField(
        default=dict,
        blank=True,
        null=True,
        help_text="SerpAPI configuration including default regions, filters, and preferences"
    )

    # Metadata and tracking
    tags = models.JSONField(
        default=dict,
        blank=True,
        null=True,
        help_text="Flexible metadata storage for workspace categorization and settings"
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="Timestamp of workspace creation"
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        help_text="Timestamp of last workspace modification"
    )
    suspension_reason = models.TextField(blank=True, null=True)
    last_activity_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'workspace'
        verbose_name = 'Workspace'
        verbose_name_plural = 'Workspaces'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['owner', 'is_active']),
            models.Index(fields=['plan', 'workspace_type']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"{self.name} ({self.owner.username})"

    @property
    def member_count(self):
        """Get current number of workspace members"""
        return self.memberships.filter(is_active=True).count()

    @property
    def is_over_user_limit(self):
        """Check if workspace has exceeded user limit"""
        return self.member_count > self.max_users

    @property
    def is_demo(self):
        return self.workspace_type == 'demo'

    @property
    def is_enterprise_type(self):
        return self.workspace_type == 'enterprise'

    def apply_plan_limits(self):
            """Apply current plan limits to workspace"""
            config = self.PLAN_CONFIG.get(self.plan, self.PLAN_CONFIG['free'])
            self.max_users = config['max_users']
            self.max_storage_gb = config['max_storage_gb']

    def save(self, *args, **kwargs):
        # 保护机制：防止直接修改plan字段
        if not self._state.adding:  # 不是新建的workspace
            try:
                old_instance = Workspace.objects.get(pk=self.pk)
                if old_instance.plan != self.plan:
                    # plan字段被直接修改，恢复原值并发出警告
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(
                        f"Attempted to directly modify workspace {self.pk} plan from {old_instance.plan} to {self.plan}. "
                        f"Plan changes must be made through WorkspaceSubscription. Reverting to {old_instance.plan}."
                    )
                    self.plan = old_instance.plan
            except Workspace.DoesNotExist:
                pass

        self.apply_plan_limits()
        is_new = self._state.adding
        super().save(*args, **kwargs)
        if is_new:
            Membership.objects.get_or_create(
                workspace=self,
                user=self.owner,
                defaults={"role": "owner", "is_active": True}
            )


class Membership(models.Model):
    """
    Membership model - Manages user-workspace relationships and roles

    Originally based on CampaignAssignment but redesigned for workspace membership.
    Implements the many-to-many relationship between users and workspaces with additional
    context including roles, permissions, and invitation tracking.

    Supports URS requirements:
    - FR-5.6.2: Multi-workspace membership
    - FR-5.6.3: Role-based access control (RBAC)
    - Invitation and onboarding workflow
    """

    # Relationships
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name='memberships',
        help_text="The workspace this membership belongs to"
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='workspace_memberships',
        help_text="The user who is a member of the workspace"
    )

    # Role-based access control (URS FR-5.6.3)
    ROLE_CHOICES = [
        ('owner', 'Owner'),  # Full control including billing and workspace deletion
        ('admin', 'Administrator'),  # All permissions except billing and ownership transfer
        ('member', 'Member'),  # Standard user permissions for content creation
        ('viewer', 'Viewer'),  # Read-only access to workspace content
    ]
    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        help_text="Role determining user permissions within the workspace"
    )

    # Membership status and lifecycle
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this membership is currently active"
    )
    assigned_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When the user was first added to the workspace"
    )

    # Invitation tracking and workflow
    invited_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sent_workspace_invitations',
        help_text="User who sent the workspace invitation"
    )
    invitation_accepted_at = models.DateTimeField(
        blank=True,
        null=True,
        help_text="When the invitation was accepted (null for direct additions)"
    )

    # Fine-grained permissions
    custom_permissions = models.JSONField(
        default=dict,
        blank=True,
        help_text="Fine-grained permissions override for specific capabilities"
    )

    class Meta:
        db_table = 'workspace_membership'
        verbose_name = 'Workspace Membership'
        verbose_name_plural = 'Workspace Memberships'
        unique_together = ['workspace', 'user']
        ordering = ['-assigned_at']
        indexes = [
            models.Index(fields=['workspace', 'role', 'is_active']),
            models.Index(fields=['user', 'is_active']),
            models.Index(fields=['invited_by']),
        ]
        constraints = [
                # Every workspace should only one owner
                models.UniqueConstraint(
                    fields=['workspace'],
                    condition=models.Q(role='owner'),
                    name='unique_workspace_owner'
                ),
            ]
    def __str__(self):
        return f"{self.user.username} - {self.workspace.name} ({self.role})"

    @property
    def is_owner(self):
        """Check if this membership represents workspace ownership"""
        return self.role == 'owner'

    @property
    def can_manage_users(self):
        """Check if user can manage other workspace members"""
        return self.has_permission('can_manage_billing')

    @property
    def can_manage_billing(self):
        """Check if user can access billing and payment features"""
        return self.has_permission('can_manage_billing')

    def has_permission(self, permission_name: str) -> bool:
        """
        Check if the user has a specific permission in this workspace.

        Permission resolution order (coarse to fine):
        1. Role-based defaults (RBAC)
        2. WorkspacePermission overrides (fine-grained ACL)
        3. Membership JSON overrides (highest priority)

        Args:
            permission_name (str): The permission to check
                                   (e.g., 'can_generate_variants').

        Returns:
            bool: True if the user has the specified permission, False otherwise.
        """

        # 1. Role-based defaults (coarse-grained RBAC)
        role_permissions = {
            'owner': True,  # Owners have all permissions
            'admin': permission_name != 'can_manage_billing',  # Admins have all except billing
            'member': permission_name in [
                'can_view_library', 'can_upload_assets', 'can_generate_variants',
                'can_edit_variants', 'can_export_data'
            ],
            'viewer': permission_name in ['can_view_library', 'can_export_data']
        }

        allowed = role_permissions.get(self.role, False)

        # 2. WorkspacePermission overrides (fine-grained ACL)
        try:
            workspace_permission = self.permissions
            if hasattr(workspace_permission, permission_name):
                allowed = getattr(workspace_permission, permission_name)
        except WorkspacePermission.DoesNotExist:
            pass

        # 3. Membership JSON overrides (highest priority)
        if permission_name in self.custom_permissions:
            allowed = self.custom_permissions[permission_name]

        return allowed

    def clean(self):
        # Before setting this user as owner, verify whether the workspace already has an owner.
        if self.role == 'owner':
            existing_owner = Membership.objects.filter(
                workspace=self.workspace,
                role='owner'
            )
            if self.pk:
                existing_owner = existing_owner.exclude(pk=self.pk)
            if existing_owner.exists():
                raise ValidationError("This workspace already has an owner.")

    def save(self, *args, **kwargs):
        # Check if this is a new object being created
        is_new = self._state.adding
        super().save(*args, **kwargs)

        # If it is newly created, ensure default permissions exist
        if is_new:
            from .models import WorkspacePermission  # Avoid circular import
            try:
                WorkspacePermission.create_default_permissions(self)
            except IntegrityError:
                pass


class WorkspacePermission(models.Model):
    """
    WorkspacePermission model - Fine-grained permission control system

    Provides detailed permission management for workspace members beyond basic roles.
    Allows customization of specific capabilities per user while maintaining role hierarchy.

    Supports URS requirements:
    - FR-5.6.3: Fine-grained permissions
    - FR-5.2.1: Resource limits per user
    """

    membership = models.OneToOneField(
        'Membership',
        on_delete=models.CASCADE,
        related_name='permissions',
        help_text="The membership this permission record belongs to"
    )

    # Content and library permissions
    can_view_library = models.BooleanField(
        default=True,
        help_text="Permission to view workspace creative library and collections"
    )
    can_upload_assets = models.BooleanField(
        default=True,
        help_text="Permission to upload images, videos, and other assets"
    )
    can_generate_variants = models.BooleanField(
        default=True,
        help_text="Permission to create AI-generated creative variants"
    )
    can_edit_variants = models.BooleanField(
        default=False,
        help_text="Permission to modify existing creative variants"
    )
    can_approve_variants = models.BooleanField(
        default=False,
        help_text="Permission to approve variants for publication/export"
    )

    # Data and export permissions
    can_export_data = models.BooleanField(
        default=True,
        help_text="Permission to export creatives and data from workspace"
    )
    can_view_billing = models.BooleanField(
        default=False,
        help_text="Permission to view billing information and usage statistics"
    )
    can_manage_billing = models.BooleanField(
        default=False,
        help_text="Permission to manage payments and billing settings"
    )

    # Administrative permissions
    can_manage_users = models.BooleanField(
        default=False,
        help_text="Permission to invite, remove, and manage other workspace members"
    )
    can_manage_settings = models.BooleanField(
        default=False,
        help_text="Permission to modify workspace settings and configuration"
    )
    can_view_audit_logs = models.BooleanField(
        default=False,
        help_text="Permission to access audit logs and activity history"
    )

    # Resource limits
    max_upload_size_mb = models.IntegerField(
        default=100,
        validators=[MinValueValidator(1), MaxValueValidator(10000)],
        help_text="Maximum file upload size in MB for this user"
    )
    max_monthly_jobs = models.IntegerField(
        default=50,
        validators=[MinValueValidator(0), MaxValueValidator(10000)],
        help_text="Maximum number of generation jobs per month"
    )

    # Administrative / critical operations
    can_delete_workspace = models.BooleanField(
        default=False,
        help_text="Permission to delete the workspace"
    )
    can_transfer_ownership = models.BooleanField(
        default=False,
        help_text="Permission to transfer workspace ownership"
    )
    can_manage_invitations = models.BooleanField(
        default=False,
        help_text="Permission to create, update, and deactivate invitation links"
    )
    can_update_token_balance = models.BooleanField(
        default=False,
        help_text="Permission to update the token balance of the workspace"
    )

    # Metadata
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When these permissions were first assigned"
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        help_text="When these permissions were last modified"
    )

    class Meta:
        db_table = 'workspace_permission'
        verbose_name = 'Workspace Permission'
        verbose_name_plural = 'Workspace Permissions'
        constraints = [
            models.UniqueConstraint(fields=['membership'], name='unique_workspace_permission_membership')
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f"Permissions: {self.membership.user.username} in {self.membership.workspace.name}"

    @classmethod
    def create_default_permissions(cls, membership):
        """
        Create default permissions based on user role

        Args:
            workspace (Workspace): Target workspace
            user (User): User to assign permissions to
            role (str): Role-based permission template

        Returns:
            WorkspacePermission: Created permission object
        """
        role = membership.role
        permission_templates = {
            'owner': {
                'can_view_library': True,
                'can_upload_assets': True,
                'can_generate_variants': True,
                'can_edit_variants': True,
                'can_approve_variants': True,
                'can_export_data': True,
                'can_view_billing': True,
                'can_manage_billing': True,
                'can_manage_users': True,
                'can_manage_settings': True,
                'can_view_audit_logs': True,
                'can_delete_workspace': True,
                'can_transfer_ownership': True,
                'can_manage_invitations': True,
                'can_update_token_balance': True,
                'max_upload_size_mb': 1000,
                'max_monthly_jobs': 1000,
            },
            'admin': {
                'can_view_library': True,
                'can_upload_assets': True,
                'can_generate_variants': True,
                'can_edit_variants': True,
                'can_approve_variants': True,
                'can_export_data': True,
                'can_view_billing': True,
                'can_manage_billing': True,
                'can_manage_users': True,
                'can_manage_settings': True,
                'can_view_audit_logs': True,
                'can_delete_workspace': False,       # cannot delete workspace
                'can_transfer_ownership': False,     # cannot transfer ownership
                'can_manage_invitations': True,
                'can_update_token_balance': True,
                'max_upload_size_mb': 500,
                'max_monthly_jobs': 500,
            },
            'member': {
                'can_view_library': True,
                'can_upload_assets': True,
                'can_generate_variants': True,
                'can_edit_variants': False,
                'can_approve_variants': False,
                'can_export_data': True,
                'can_view_billing': False,
                'can_manage_billing': False,
                'can_manage_users': False,
                'can_manage_settings': False,
                'can_view_audit_logs': False,
                'can_delete_workspace': False,
                'can_transfer_ownership': False,
                'can_manage_invitations': False,
                'can_update_token_balance': False,
                'max_upload_size_mb': 100,
                'max_monthly_jobs': 50,
            },
            'viewer': {
                'can_view_library': True,
                'can_upload_assets': False,
                'can_generate_variants': False,
                'can_edit_variants': False,
                'can_approve_variants': False,
                'can_export_data': True,
                'can_view_billing': False,
                'can_manage_billing': False,
                'can_manage_users': False,
                'can_manage_settings': False,
                'can_view_audit_logs': False,
                'can_transfer_ownership': False,
                'can_manage_invitations': False,
                'can_update_token_balance': False,
                'max_upload_size_mb': 0,
                'max_monthly_jobs': 0,
            }
        }

        template = permission_templates.get(role, permission_templates['viewer'])

        # Check if permission already exists to avoid unique constraint violation
        existing_permission = cls.objects.filter(membership=membership).first()
        if existing_permission:
            # Update existing permission with new template
            for field, value in template.items():
                setattr(existing_permission, field, value)
            existing_permission.save()
            return existing_permission

        return cls.objects.create(membership=membership, **template)
#Invitation Link Management
# Management utilities and cleanup functionality

class InvitationLinkManager(models.Manager):
    """
    Utility class for managing invitation link lifecycle and cleanup operations
    """

    def cleanup_expired_links(self):
        """
        Remove expired invitation links from database

        Returns:
            int: Number of links that were cleaned up
        """
        expired_links = self.filter(
            expires_at__lt=timezone.now(),
            is_active=True
        )

        count = expired_links.count()
        expired_links.update(is_active=False)

        # Optionally delete completely after grace period
        very_old_expired = self.filter(
            expires_at__lt=timezone.now() - timedelta(days=30),
            is_active=False
        )
        very_old_expired.delete()

        return count

    def get_active_links(self):
            """Get all active, non-expired links"""
            return self.filter(
                is_active=True,
                expires_at__gt=timezone.now()
            )

    def get_workspace_invitation_stats(self,workspace):
        """
        Get invitation usage statistics for a workspace

        Args:
            workspace (Workspace): Target workspace

        Returns:
            dict: Statistics about invitation usage
        """
        now = timezone.now()
        links = self.filter(workspace=workspace)
        usage_records = InvitationUsage.objects.filter(workspace=workspace)

        return {
            'total_links': links.count(),
            'active_links': links.filter(is_active=True).count(),
            'expired_links': links.filter(expires_at__isnull=False,expires_at__lt=now).count(),
            'never_expires_links': links.filter(expires_at__isnull=True).count(),
            'total_joins': usage_records.filter(status='success').count(),
            'failed_attempts': usage_records.exclude(status='success').count(),
            'recent_joins': usage_records.filter(
                joined_at__gte=timezone.now() - timedelta(days=30),
                status='success'
            ).count(),
        }

class InvitationLink(models.Model):
    """
    InvitationLink model - Manages shareable invitation links for workspace access

    Supports flexible invitation workflow where workspace members can create
    invitation links with specific roles and expiration settings. Each link
    provides a secure, time-limited way to invite new users to join a workspace
    with predefined permissions.

    Key features:
    - Unique token-based URLs for security
    - Configurable expiration (custom days or never expire)
    - Role assignment for automatic permission setting
    - Usage tracking and audit trail
    - Automatic cleanup of expired links
    """

    # Primary identification using UUID for security and uniqueness
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        help_text="Unique identifier for the invitation link"
    )
    objects = InvitationLinkManager()
    # Unique token used in the actual invitation URL
    token = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False,
        help_text="Unique token embedded in invitation URL for security"
    )

    # Workspace relationship - which workspace this invitation grants access to
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name='invitation_links',
        help_text="Workspace that users will join when using this invitation link"
    )

    # Creator relationship - who created this invitation link
    created_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='created_invitation_links',
        help_text="User who created this invitation link"
    )

    # Role assignment - what role users will get when joining via this link
    role = models.CharField(
        max_length=20,
        choices=Membership.ROLE_CHOICES,
        default='member',
        help_text="Role that will be automatically assigned to users joining via this link"
    )

    # Human-readable metadata for link identification and management
    name = models.CharField(
        max_length=200,
        help_text="Human-readable name for this invitation link"
    )
    description = models.TextField(
        blank=True,
        null=True,
        help_text="Optional description explaining the purpose of this invitation link"
    )

    # Expiration management
    expires_at = models.DateTimeField(
        blank=True,
        null=True,
        help_text="When this invitation link expires (null means never expires)"
    )

    # Link status and lifecycle management
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this invitation link is currently active and usable"
    )

    # Usage tracking and limits
    max_uses = models.IntegerField(
        default=1000,
        validators=[MinValueValidator(1)],
        help_text="Maximum number of times this link can be used (null means unlimited)"
    )
    uses_count = models.IntegerField(
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Current number of times this link has been successfully used"
    )

    # Metadata and timestamps
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When this invitation link was created"
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        help_text="When this invitation link was last modified"
    )

    # Optional creator notes and internal tracking
    creator_notes = models.TextField(
        blank=True,
        null=True,
        help_text="Private notes from the creator about this invitation link"
    )

    class Meta:
        db_table = 'workspace_invitation_link'
        verbose_name = 'Workspace Invitation Link'
        verbose_name_plural = 'Workspace Invitation Links'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['token']),  # Fast lookup for URL validation
            models.Index(fields=['workspace', 'is_active']),  # Workspace management
            models.Index(fields=['created_by']),  # Creator's link management
            models.Index(fields=['expires_at', 'is_active']),  # Cleanup queries
        ]
        constraints = [
            # Ensure token uniqueness across all invitation links
            models.UniqueConstraint(fields=['token'], name='unique_invitation_token'),
        ]

    def __str__(self):
        return f"{self.name} - {self.workspace.name}"

    @property
    def is_expired(self):
        """
        Check if invitation link has expired based on expiration date

        Returns:
            bool: True if link is expired, False if still valid or never expires
        """
        if self.expires_at is None:
            return False  # Never expires
        return timezone.now() > self.expires_at

    @property
    def is_usage_exceeded(self):
        """
        Check if invitation link has exceeded maximum usage limit

        Returns:
            bool: True if usage limit exceeded, False if still within limits
        """
        if self.max_uses is None:
            return False  # Unlimited uses
        return self.uses_count >= self.max_uses

    @property
    def is_valid(self):
        """
        Check if invitation link is currently valid and usable

        Returns:
            bool: True if link can be used, False if expired/disabled/exceeded
        """
        return (
                self.is_active and
                not self.is_expired and
                not self.is_usage_exceeded
        )

    def get_invitation_url(self, request=None):
        """
        Generate the full invitation URL for this link.

        Args:
            request (HttpRequest, optional): Current request to auto-detect domain.
                                             If None, fallback to settings.SITE_URL.

        Returns:
            str: Complete URL that can be shared with invitees
        """
        if request:
            return request.build_absolute_uri(f"/invite/{self.token}")
        from django.conf import settings
        base_url = getattr(settings, 'SITE_URL', 'https://localhost')
        return f"{base_url}/invite/{self.token}"

    @property
    def remaining_uses(self):
        """
        Calculate remaining uses for this invitation link

        Returns:
            int or None: Number of remaining uses, or None if unlimited
        """
        if self.max_uses is None:
            return None  # Unlimited
        return max(0, self.max_uses - self.uses_count)

    def increment_usage(self):
        """
        Increment usage counter when someone successfully joins via this link

        Returns:
            bool: True if increment was successful, False if would exceed limit
        """
        if self.is_usage_exceeded:
            return False

        self.uses_count += 1
        self.save(update_fields=['uses_count', 'updated_at'])
        return True

    def deactivate(self, reason=None):
        """
        Deactivate this invitation link

        Args:
            reason (str): Optional reason for deactivation
        """
        self.is_active = False
        if reason:
            self.creator_notes = f"{self.creator_notes or ''}\nDeactivated: {reason}".strip()
        self.save(update_fields=['is_active', 'creator_notes', 'updated_at'])

    @classmethod
    def create_invitation(cls, workspace, created_by, role, name, description=None,
                          expires_in_days=None, max_uses=None):
        """
        Factory method to create a new invitation link

        Args:
            workspace (Workspace): Target workspace
            created_by (User): User creating the invitation
            role (str): Role to assign to joining users
            name (str): Human-readable name for the link
            description (str, optional): Description of the invitation
            expires_in_days (int, optional): Days until expiration (None for never)
            max_uses (int, optional): Maximum usage limit (None for unlimited)

        Returns:
            InvitationLink: Created invitation link instance
        """
        expires_at = None
        if expires_in_days is not None:
            expires_at = timezone.now() + timedelta(days=expires_in_days)

        return cls.objects.create(
            workspace=workspace,
            created_by=created_by,
            role=role,
            name=name,
            description=description,
            expires_at=expires_at,
            max_uses=max_uses
        )


class InvitationUsage(models.Model):
    """
    InvitationUsage model - Records when users join workspaces via invitation links

    Provides complete audit trail of invitation link usage including:
    - Which user joined which workspace
    - Which invitation link was used
    - When the join event occurred
    - Success/failure status and details

    Supports analytics, security auditing, and troubleshooting of invitation workflows.
    """

    # Primary relationships
    invitation_link = models.ForeignKey(
        InvitationLink,
        on_delete=models.CASCADE,
        related_name='usage_records',
        help_text="Invitation link that was used for this join event"
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='invitation_usage_history',
        help_text="User who joined the workspace via the invitation link"
    )
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name='invitation_join_history',
        help_text="Workspace that the user joined"
    )

    # Join event details
    joined_at = models.DateTimeField(
        auto_now_add=True,
        help_text="Timestamp when the user successfully joined the workspace"
    )

    # Role and permission tracking
    assigned_role = models.CharField(
        max_length=20,
        choices=Membership.ROLE_CHOICES,
        help_text="Role that was assigned to the user upon joining"
    )

    # Join event context and metadata
    JOIN_STATUS_CHOICES = [
        ('success', 'Successfully Joined'),
        ('already_member', 'Already a Member'),
        ('link_expired', 'Link Expired'),
        ('link_invalid', 'Link Invalid'),
        ('workspace_full', 'Workspace at Capacity'),
        ('permission_denied', 'Permission Denied'),
        ('error', 'System Error'),
    ]

    status = models.CharField(
        max_length=20,
        choices=JOIN_STATUS_CHOICES,
        default='success',
        help_text="Result status of the join attempt"
    )

    # Technical tracking for debugging and analytics
    ip_address = models.GenericIPAddressField(
        blank=True,
        null=True,
        help_text="IP address of user when joining (for security auditing)"
    )
    user_agent = models.TextField(
        blank=True,
        null=True,
        help_text="Browser user agent string (for analytics and debugging)"
    )

    # Additional context and notes
    notes = models.TextField(
        blank=True,
        null=True,
        help_text="Additional notes or error details about this join event"
    )

    # Reference to the created membership (if successful)
    membership = models.ForeignKey(
        Membership,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name='invitation_source',
        help_text="Membership record created as a result of this invitation (if successful)"
    )

    class Meta:
        db_table = 'workspace_invitation_usage'
        verbose_name = 'Invitation Usage Record'
        verbose_name_plural = 'Invitation Usage Records'
        ordering = ['-joined_at']
        indexes = [
            models.Index(fields=['invitation_link', 'status']),  # Link usage analysis
            models.Index(fields=['user', 'joined_at']),  # User join history
            models.Index(fields=['workspace', 'joined_at']),  # Workspace growth tracking
            models.Index(fields=['joined_at']),  # Chronological analysis
        ]
        constraints = [
            # Prevent duplicate successful joins via same link
            models.UniqueConstraint(
                fields=['invitation_link', 'user'],
                condition=models.Q(status='success'),
                name='unique_successful_invitation_usage'
            ),
        ]

    def __str__(self):
        return f"{self.user.username} joined {self.workspace.name} via {self.invitation_link.name}"

    @classmethod
    def record_join_attempt(cls, invitation_link, user, status='success',
                            ip_address=None, user_agent=None, notes=None, membership=None):
        """
        Factory method to record an invitation usage event

        Args:
            invitation_link (InvitationLink): Link that was used
            user (User): User attempting to join
            status (str): Result of the join attempt
            ip_address (str, optional): User's IP address
            user_agent (str, optional): User's browser info
            notes (str, optional): Additional context or error details
            membership (Membership, optional): Created membership if successful

        Returns:
            InvitationUsage: Created usage record
        """
        return cls.objects.create(
            invitation_link=invitation_link,
            user=user,
            workspace=invitation_link.workspace,
            assigned_role=invitation_link.role,
            status=status,
            ip_address=ip_address,
            user_agent=user_agent,
            notes=notes,
            membership=membership
        )

    @property
    def was_successful(self):
        """Check if this join attempt was successful"""
        return self.status == 'success'

    @property
    def days_since_join(self):
        """Calculate days since successful join"""
        if not self.was_successful:
            return None
        return (timezone.now().date() - self.joined_at.date()).days


