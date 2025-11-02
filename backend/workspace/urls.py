
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_nested import routers
from rest_framework import permissions as drf_permissions
from rest_framework import authentication as drf_authentication
from workspace.views import InvitationLinkViewSet

from .views import (
    WorkspaceViewSet,
    MembershipViewSet,
    WorkspacePermissionViewSet,
    InvitationLinkViewSet,
    InvitationUsageViewSet,
)

from billing import views as billing_views

router = DefaultRouter()
router.register(
    r'workspaces',
    WorkspaceViewSet,
    basename='workspace'
)
workspace_router = routers.NestedDefaultRouter(router, r'workspaces', lookup='workspace')
workspace_router.register(
    r'members',
    MembershipViewSet,
    basename='workspace-members'
)
workspace_router.register(
    r'invitations',
    InvitationLinkViewSet,
    basename='workspace-invitations'
)
workspace_router.register(
    r'invitation-usage',
    InvitationUsageViewSet,
    basename='invitation-usage'
)
workspace_router.register(
    r'permissions',
    WorkspacePermissionViewSet,
    basename='workspace-permissions'
)
validate_token = InvitationLinkViewSet.as_view(
    {'post': 'validate_token'},
    permission_classes=[],
    authentication_classes=[]
)
accept_invitation = InvitationLinkViewSet.as_view(
    {'post': 'accept_invitation'},
    permission_classes=[drf_permissions.IsAuthenticated],
    authentication_classes=[drf_authentication.SessionAuthentication]
)

urlpatterns = [
    path('', include(router.urls)),
    path('', include(workspace_router.urls)),

    path("invite/validate_token/", validate_token, name="invitation-validate"),
    path("invite/accept_invitation/", accept_invitation, name="invitation-accept"),

    # Reserved paths for future public invitation endpoints
    # Currently invitation validation and acceptance are handled through ViewSet actions
    # These commented paths show potential future direct URL patterns for user-friendly invitation links:
    # path('invite/validate/<uuid:token>/', InvitationTokenValidationView.as_view(), name='validate-invitation-token'),
    # path('invite/join/<uuid:token>/', InvitationAcceptanceView.as_view(), name='accept-invitation'),
]

# Complete list of generated API endpoints:
#
# WORKSPACE MANAGEMENT:
# - GET    /api/workspaces/                              → List all workspaces user has access to
# - POST   /api/workspaces/                              → Create new workspace (user becomes owner)
# - GET    /api/workspaces/{id}/                         → Retrieve specific workspace details
# - PUT    /api/workspaces/{id}/                         → Full update of workspace
# - PATCH  /api/workspaces/{id}/                         → Partial update of workspace
# - DELETE /api/workspaces/{id}/                         → Delete workspace (owner only)
# - POST   /api/workspaces/{id}/transfer_ownership/      → Transfer workspace ownership to another user
# - POST   /api/workspaces/{id}/update_token_balance/    → Modify workspace token balance
#
# MEMBERSHIP MANAGEMENT (Workspace-scoped):
# - GET    /api/workspaces/{workspace_id}/members/       → List all members of specific workspace
# - POST   /api/workspaces/{workspace_id}/members/       → Add new member to workspace
# - GET    /api/workspaces/{workspace_id}/members/{id}/  → Get details of specific member
# - PUT    /api/workspaces/{workspace_id}/members/{id}/  → Update member role or status
# - PATCH  /api/workspaces/{workspace_id}/members/{id}/  → Partial update of member information
# - DELETE /api/workspaces/{workspace_id}/members/{id}/  → Remove member from workspace
# - POST   /api/workspaces/{workspace_id}/members/leave_workspace/     → Current user leaves workspace
# - POST   /api/workspaces/{workspace_id}/members/{id}/remove_member/  → Admin removes specific member
#
# INVITATION MANAGEMENT (Workspace-scoped):
# - GET    /api/workspaces/{workspace_id}/invitations/       → List all invitations for workspace
# - POST   /api/workspaces/{workspace_id}/invitations/       → Create new invitation link
# - GET    /api/workspaces/{workspace_id}/invitations/{id}/  → Get invitation details
# - PUT    /api/workspaces/{workspace_id}/invitations/{id}/  → Update invitation settings
# - PATCH  /api/workspaces/{workspace_id}/invitations/{id}/  → Partial update of invitation
# - DELETE /api/workspaces/{workspace_id}/invitations/{id}/  → Delete invitation link
# - POST   /api/workspaces/{workspace_id}/invitations/validate_token/      → Validate invitation token (public)
# - POST   /api/workspaces/{workspace_id}/invitations/accept_invitation/   → Accept invitation and join workspace
# - POST   /api/workspaces/{workspace_id}/invitations/{id}/deactivate/     → Deactivate specific invitation
# - POST   /api/workspaces/{workspace_id}/invitations/cleanup_expired/     → Remove expired invitations
#
# INVITATION USAGE ANALYTICS (Workspace-scoped, Read-only):
# - GET    /api/workspaces/{workspace_id}/invitation-usage/       → List usage records for workspace
# - GET    /api/workspaces/{workspace_id}/invitation-usage/{id}/  → Get specific usage record
# - GET    /api/workspaces/{workspace_id}/invitation-usage/workspace_stats/ → Get usage statistics
#
# PERMISSION MANAGEMENT (Workspace-scoped):
# - GET    /api/workspaces/{workspace_id}/permissions/       → List permissions for workspace
# - POST   /api/workspaces/{workspace_id}/permissions/       → Create custom permission
# - GET    /api/workspaces/{workspace_id}/permissions/{id}/  → Get permission details
# - PUT    /api/workspaces/{workspace_id}/permissions/{id}/  → Update permission settings
# - PATCH  /api/workspaces/{workspace_id}/permissions/{id}/  → Partial update of permission
# - DELETE /api/workspaces/{workspace_id}/permissions/{id}/  → Delete custom permission
#
# URL Pattern Names (for use with reverse()):
# - workspace-list, workspace-detail
# - workspace-members-list, workspace-members-detail
# - workspace-invitations-list, workspace-invitations-detail
# - invitation-usage-list, invitation-usage-detail
# - workspace-permissions-list, workspace-permissions-detail
# - workspace-billing-balance, workspace-billing-checkout
# - workspace-billing-transactions, workspace-billing-simulate
#
# Authentication & Authorization:
# - All endpoints require authentication except invitation token validation
# - Authorization based on workspace membership roles and custom permissions
# - Workspace owners have full access, members have limited access based on role
# - Custom permissions can override default role-based restrictions
#
# Query Parameters (supported on list endpoints):
# - ?search=query     → Full-text search across relevant fields
# - ?ordering=field   → Sort results by field (prefix with - for descending)
# - ?page=N          → Pagination (used with ?page_size=N)
# - ?page_size=N     → Number of results per page (default varies by endpoint)
# - Custom filters   → Filter by specific field values (e.g., ?role=admin)