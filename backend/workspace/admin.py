"""
Django admin configuration for the workspace app models.

This module configures the Django admin interface for all workspace-related models,
providing comprehensive management capabilities for administrators. Each model
registration includes appropriate display fields, filters, and search functionality
to enable efficient workspace management and troubleshooting.

The admin interface supports:
- Workspace lifecycle management and monitoring
- User membership administration with role management
- Permission customization and audit trails
- Invitation link management and usage analytics
- Security monitoring and compliance reporting

All admin classes follow Django best practices with proper field organization,
inline editing capabilities where appropriate, and security considerations
for sensitive data exposure.
"""

from django.contrib import admin
from django.utils.html import format_html
from django.urls import reverse
from django.utils.safestring import mark_safe
from django.db.models import Count, Q
from django.utils import timezone

from .models import (
    Workspace, Membership, WorkspacePermission,
    InvitationLink, InvitationUsage
)


class MembershipInline(admin.TabularInline):
    """
    Inline admin interface for managing workspace memberships.

    Allows administrators to view and edit user memberships directly
    from the workspace admin page. Provides quick access to role
    management and membership status without navigating to separate pages.

    Features:
    - Role assignment and modification
    - Membership status management (active/inactive)
    - Quick view of invitation details
    - Efficient bulk operations for team management
    """
    model = Membership
    extra = 0  # Don't show empty forms by default
    fields = ['user', 'role', 'is_active', 'invited_by', 'assigned_at']
    readonly_fields = ['assigned_at']
    raw_id_fields = ['user', 'invited_by']  # Use raw ID widget for foreign keys

    def get_queryset(self, request):
        """Optimize queryset to reduce database queries."""
        return super().get_queryset(request).select_related('user', 'invited_by')


class InvitationLinkInline(admin.TabularInline):
    """
    Inline admin interface for managing workspace invitation links.

    Provides workspace-level view of all invitation links, allowing
    administrators to monitor invitation activity and manage link
    lifecycle directly from workspace administration.

    Features:
    - Quick link status overview (active, expired, usage stats)
    - Direct link management (activate/deactivate)
    - Usage monitoring and analytics
    - Security oversight for invitation patterns
    """
    model = InvitationLink
    extra = 0
    fields = ['name', 'role', 'is_active', 'expires_at', 'uses_count', 'max_uses']
    readonly_fields = ['uses_count', 'created_at']

    def get_queryset(self, request):
        """Optimize queryset for invitation links."""
        return super().get_queryset(request).select_related('created_by')


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    """
    Django admin interface for Workspace model with comprehensive management.

    Provides full workspace lifecycle management including subscription
    monitoring, resource usage tracking, and team administration. Supports
    both individual workspace management and bulk operations for platform
    administration.

    Key Features:
    - Workspace health monitoring (active status, resource usage)
    - Subscription plan management and billing oversight
    - Team composition analysis with membership statistics
    - Security monitoring through activity tracking
    - Bulk operations for platform maintenance
    - Advanced filtering for efficient workspace discovery
    """

    # Display configuration for workspace list view
    list_display = [
        'name', 'owner', 'plan', 'workspace_type', 'member_count_display',
        'is_active', 'created_at'
    ]

    # Enable filtering by key workspace attributes
    list_filter = [
        'plan', 'workspace_type', 'is_active', 'created_at',
        'updated_at', 'owner'
    ]

    # Enable search across workspace identification fields
    search_fields = [
        'name', 'description', 'owner__username', 'owner__email',
        'tags', 'id'
    ]

    # Control field ordering in list view
    ordering = ['-created_at']

    # Configure date hierarchy for efficient browsing
    date_hierarchy = 'created_at'

    # Set pagination for performance
    list_per_page = 25

    # Enable list selection for bulk operations
    list_select_related = ['owner']

    # Configure fieldsets for organized workspace editing
    fieldsets = [
        ('Basic Information', {
            'fields': ['name', 'description', 'owner', 'workspace_type']
        }),
        ('Subscription & Billing', {
            'fields': ['plan', 'max_users', 'max_storage_gb'],
            'classes': ['collapse']  # Collapsible for cleaner interface
        }),
        ('API Configuration', {
            'fields': ['serpapi_key', 'serpapi_config', 'api_keys'],
            'classes': ['collapse']
        }),
        ('Lifecycle Management', {
            'fields': ['is_active', 'start_date', 'end_date', 'suspension_reason'],
            'classes': ['collapse']
        }),
        ('Metadata', {
            'fields': ['tags', 'created_at', 'updated_at', 'last_activity_at'],
            'classes': ['collapse']
        })
    ]

    # Set read-only fields for data integrity
    readonly_fields = [
        'id', 'created_at', 'updated_at', 'last_activity_at',
        'start_date', 'member_count_display'
    ]

    # Configure raw ID widgets for performance
    raw_id_fields = ['owner']

    # Include inline editing for related models
    inlines = [MembershipInline, InvitationLinkInline]

    @admin.display(description="Members", ordering="member_count_annotated")
    def member_count_display(self, obj):
        """Display current member count with workspace limit context."""
        count = getattr(obj, "member_count_annotated", obj.member_count)
        limit = obj.max_users
        if count > limit:
            return format_html(
                '<span style="color: red; font-weight: bold;">{} / {} (Over Limit!)</span>',
                count, limit
            )
        elif count > limit * 0.8:  # Warning at 80% capacity
            return format_html(
                '<span style="color: orange;">{} / {}</span>',
                count, limit
            )
        return f"{count} / {limit}"

    def get_queryset(self, request):
        """Optimize admin queryset with annotations for computed fields."""
        return super().get_queryset(request).annotate(
            member_count_annotated=Count('memberships', filter=Q(memberships__is_active=True))
        ).select_related('owner')


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    """
    Django admin interface for Membership model with role management focus.

    Manages user-workspace relationships with emphasis on role-based access
    control and invitation tracking. Supports membership lifecycle monitoring
    and provides tools for resolving access issues and security auditing.

    Key Features:
    - Role hierarchy visualization and management
    - Invitation flow tracking and troubleshooting
    - Membership status monitoring with activity indicators
    - Permission integration for comprehensive access overview
    - Bulk role operations for team restructuring
    - Security auditing through access pattern analysis
    """

    # Display configuration emphasizing role and status
    list_display = [
        'user', 'workspace', 'role', 'is_active',
        'invitation_status_display', 'assigned_at'
    ]

    # Enable filtering by membership attributes
    list_filter = [
        'role', 'is_active', 'assigned_at', 'workspace__plan',
        'invited_by', 'invitation_accepted_at'
    ]

    # Search across user and workspace information
    search_fields = [
        'user__username', 'user__email', 'user__first_name', 'user__last_name',
        'workspace__name', 'workspace__id'
    ]

    # Order by most recent memberships first
    ordering = ['-assigned_at']

    # Configure date hierarchy for temporal analysis
    date_hierarchy = 'assigned_at'

    # Set pagination for performance
    list_per_page = 50

    # Optimize queryset loading
    list_select_related = ['user', 'workspace', 'invited_by']

    # Organize fields for clear membership editing
    fieldsets = [
        ('Membership Details', {
            'fields': ['workspace', 'user', 'role', 'is_active']
        }),
        ('Invitation Tracking', {
            'fields': ['invited_by', 'invitation_accepted_at', 'assigned_at'],
            'classes': ['collapse']
        }),
        ('Custom Permissions', {
            'fields': ['custom_permissions'],
            'classes': ['collapse']
        })
    ]

    # Protect key timestamps and relationships
    readonly_fields = ['assigned_at', 'invitation_accepted_at']

    # Use raw ID widgets for foreign key performance
    raw_id_fields = ['user', 'workspace', 'invited_by']

    def invitation_status_display(self, obj):
        """Display invitation status with visual indicators."""
        if obj.invited_by and obj.invitation_accepted_at:
            return format_html(
                '<span style="color: green;">✓ Invited by {}</span>',
                obj.invited_by.username
            )
        elif obj.invited_by and not obj.invitation_accepted_at:
            return format_html(
                '<span style="color: orange;">⏳ Pending from {}</span>',
                obj.invited_by.username
            )
        else:
            return format_html(
                '<span style="color: blue;">👤 Direct Addition</span>'
            )
    invitation_status_display.short_description = 'Invitation Status'


@admin.register(WorkspacePermission)
class WorkspacePermissionAdmin(admin.ModelAdmin):
    """
    Django admin interface for WorkspacePermission model with detailed access control.

    Provides fine-grained permission management beyond basic role assignments.
    Enables administrators to customize specific capabilities for users while
    maintaining security constraints and role hierarchy compliance.

    Key Features:
    - Comprehensive permission matrix visualization
    - Role-based permission template application
    - Resource limit management and enforcement
    - Permission audit trail and compliance reporting
    - Bulk permission operations for team management
    - Security validation for permission escalation prevention
    """

    # Display key permission information
    list_display = [
        'membership', 'role_display', 'permission_summary',
        'resource_limits_display', 'updated_at'
    ]

    # Enable filtering by workspace and permission levels
    list_filter = [
        'membership__workspace', 'membership__role',
        'can_manage_billing', 'can_manage_users', 'can_manage_settings',
        'updated_at'
    ]

    # Search by user and workspace
    search_fields = [
        'membership__user__username', 'membership__user__email',
        'membership__workspace__name'
    ]

    # Order by most recent updates
    ordering = ['-updated_at']

    # Configure date hierarchy
    date_hierarchy = 'updated_at'

    # Set pagination
    list_per_page = 30

    # Optimize queryset
    list_select_related = ['membership__user', 'membership__workspace']

    # Organize permission fields logically
    fieldsets = [
        ('Membership Context', {
            'fields': ['membership']
        }),
        ('Content & Library Permissions', {
            'fields': [
                'can_view_library', 'can_upload_assets', 'can_generate_variants',
                'can_edit_variants', 'can_approve_variants', 'can_export_data'
            ]
        }),
        ('Administrative Permissions', {
            'fields': [
                'can_manage_users', 'can_manage_settings', 'can_view_audit_logs',
                'can_manage_invitations'
            ],
            'classes': ['collapse']
        }),
        ('Billing & Financial Permissions', {
            'fields': [
                'can_view_billing', 'can_manage_billing', 'can_update_token_balance'
            ],
            'classes': ['collapse']
        }),
        ('Critical Operations', {
            'fields': [
                'can_delete_workspace', 'can_transfer_ownership'
            ],
            'classes': ['collapse']
        }),
        ('Resource Limits', {
            'fields': [
                'max_upload_size_mb', 'max_monthly_jobs'
            ],
            'classes': ['collapse']
        }),
        ('Metadata', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse']
        })
    ]

    # Protect timestamps
    readonly_fields = ['created_at', 'updated_at']

    # Use raw ID widget for membership selection
    raw_id_fields = ['membership']

    def role_display(self, obj):
        """Display the user's role with visual formatting."""
        role = obj.membership.role
        role_colors = {
            'owner': 'red',
            'admin': 'orange',
            'member': 'green',
            'viewer': 'blue'
        }
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            role_colors.get(role, 'black'),
            role.title()
        )
    role_display.short_description = 'Role'
    role_display.admin_order_field = 'membership__role'

    def permission_summary(self, obj):
        """Display a summary of key permissions."""
        key_perms = [
            ('Manage Users', obj.can_manage_users),
            ('Manage Billing', obj.can_manage_billing),
            ('Generate Content', obj.can_generate_variants),
            ('Upload Assets', obj.can_upload_assets),
        ]

        summary = []
        for perm_name, has_perm in key_perms:
            if has_perm:
                summary.append(f"✓ {perm_name}")

        return format_html('<br>'.join(summary[:3]))  # Show first 3
    permission_summary.short_description = 'Key Permissions'

    def resource_limits_display(self, obj):
        """Display resource limits in a readable format."""
        return format_html(
            'Upload: {} MB<br>Monthly Jobs: {}',
            obj.max_upload_size_mb,
            obj.max_monthly_jobs
        )
    resource_limits_display.short_description = 'Resource Limits'


@admin.register(InvitationLink)
class InvitationLinkAdmin(admin.ModelAdmin):
    """
    Django admin interface for InvitationLink model with security and analytics focus.

    Manages workspace invitation links with emphasis on security monitoring,
    usage analytics, and lifecycle management. Provides tools for tracking
    invitation patterns, preventing abuse, and ensuring secure team onboarding.

    Key Features:
    - Invitation link lifecycle management with expiration tracking
    - Usage analytics and pattern monitoring
    - Security oversight for invitation abuse prevention
    - Bulk operations for invitation management
    - Integration with usage tracking for complete audit trail
    - Performance optimization for high-volume invitation scenarios
    """

    # Display key invitation information
    list_display = [
        'name', 'workspace', 'role', 'created_by', 'status_display',
        'usage_display', 'expires_at', 'created_at'
    ]

    # Enable filtering by status and attributes
    list_filter = [
        'role', 'is_active', 'workspace', 'created_by',
        'expires_at', 'created_at'
    ]

    # Search across invitation details
    search_fields = [
        'name', 'description', 'workspace__name',
        'created_by__username', 'token'
    ]

    # Order by creation date
    ordering = ['-created_at']

    # Configure date hierarchy
    date_hierarchy = 'created_at'

    # Set pagination
    list_per_page = 25

    # Optimize queryset
    list_select_related = ['workspace', 'created_by']

    # Organize fields for invitation management
    fieldsets = [
        ('Invitation Details', {
            'fields': ['name', 'description', 'workspace', 'created_by', 'role']
        }),
        ('Access Configuration', {
            'fields': ['token', 'is_active', 'expires_at', 'max_uses', 'uses_count']
        }),
        ('Creator Notes', {
            'fields': ['creator_notes'],
            'classes': ['collapse']
        }),
        ('Metadata', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse']
        })
    ]

    # Protect key fields
    readonly_fields = ['token', 'uses_count', 'created_at', 'updated_at']

    # Use raw ID widgets
    raw_id_fields = ['workspace', 'created_by']

    def status_display(self, obj):
        """Display invitation status with visual indicators."""
        if not obj.is_active:
            return format_html('<span style="color: red;">❌ Inactive</span>')
        elif obj.is_expired:
            return format_html('<span style="color: orange;">⏰ Expired</span>')
        elif obj.is_usage_exceeded:
            return format_html('<span style="color: orange;">📊 Usage Exceeded</span>')
        else:
            return format_html('<span style="color: green;">✅ Active</span>')
    status_display.short_description = 'Status'

    def usage_display(self, obj):
        """Display usage statistics with progress indication."""
        if obj.max_uses:
            percentage = (obj.uses_count / obj.max_uses) * 100
            if percentage >= 100:
                color = 'red'
            elif percentage >= 80:
                color = 'orange'
            else:
                color = 'green'

            return format_html(
                '<span style="color: {};">{} / {} ({:.0f}%)</span>',
                color, obj.uses_count, obj.max_uses, percentage
            )
        else:
            return f"{obj.uses_count} / Unlimited"
    usage_display.short_description = 'Usage'
    usage_display.admin_order_field = 'uses_count'


@admin.register(InvitationUsage)
class InvitationUsageAdmin(admin.ModelAdmin):
    """
    Django admin interface for InvitationUsage model with comprehensive audit capabilities.

    Provides detailed invitation usage tracking and analytics for security monitoring,
    compliance reporting, and onboarding analysis. Supports investigation of invitation
    patterns and provides insights into workspace growth and user acquisition.

    Key Features:
    - Complete invitation usage audit trail
    - Security monitoring for suspicious invitation patterns
    - Onboarding analytics and success rate tracking
    - Integration with membership creation for lifecycle visibility
    - Performance analytics for invitation effectiveness
    - Compliance reporting for access control auditing
    """

    # Display comprehensive usage information
    list_display = [
        'user', 'workspace', 'invitation_link', 'status',
        'assigned_role', 'joined_at', 'ip_address'
    ]

    # Enable filtering by key attributes
    list_filter = [
        'status', 'assigned_role', 'joined_at',
        'workspace', 'invitation_link__created_by'
    ]

    # Search across user and invitation details
    search_fields = [
        'user__username', 'user__email', 'workspace__name',
        'invitation_link__name', 'ip_address', 'notes'
    ]

    # Order by most recent usage
    ordering = ['-joined_at']

    # Configure date hierarchy
    date_hierarchy = 'joined_at'

    # Set pagination for performance
    list_per_page = 50

    # Optimize queryset
    list_select_related = ['user', 'workspace', 'invitation_link', 'membership']

    # Organize fields for usage analysis
    fieldsets = [
        ('Usage Details', {
            'fields': [
                'invitation_link', 'user', 'workspace', 'status',
                'assigned_role', 'joined_at'
            ]
        }),
        ('Technical Information', {
            'fields': ['ip_address', 'user_agent'],
            'classes': ['collapse']
        }),
        ('Results', {
            'fields': ['membership', 'notes'],
            'classes': ['collapse']
        })
    ]

    # All fields are readonly for audit integrity
    readonly_fields = [
        'invitation_link', 'user', 'workspace', 'joined_at',
        'assigned_role', 'status', 'ip_address', 'user_agent',
        'notes', 'membership'
    ]

    # This model should be read-only for audit trail integrity
    def has_add_permission(self, request):
        """Prevent manual creation of usage records."""
        return False

    def has_change_permission(self, request, obj=None):
        """Prevent modification of usage records for audit integrity."""
        return False

    def has_delete_permission(self, request, obj=None):
        """Prevent deletion of usage records for audit integrity."""
        return False


# Register admin actions for bulk operations
@admin.action(description='Activate selected invitation links')
def activate_invitation_links(modeladmin, request, queryset):
    """Bulk activate invitation links."""
    updated = queryset.update(is_active=True)
    modeladmin.message_user(
        request,
        f'{updated} invitation link(s) were successfully activated.'
    )

@admin.action(description='Deactivate selected invitation links')
def deactivate_invitation_links(modeladmin, request, queryset):
    """Bulk deactivate invitation links."""
    updated = queryset.update(is_active=False)
    modeladmin.message_user(
        request,
        f'{updated} invitation link(s) were successfully deactivated.'
    )

# Add custom actions to InvitationLink admin
InvitationLinkAdmin.actions = [activate_invitation_links, deactivate_invitation_links]