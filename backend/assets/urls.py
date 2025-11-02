"""
URL configuration for the assets app.

This module defines URL patterns for digital asset management using Django REST Framework.
All routes are exposed under '/api/' as configured in the main backend/urls.py.

The assets app provides comprehensive digital asset management functionality including:
- Asset upload and storage: Secure file upload, storage, and organization
- Asset metadata management: Tracking file information, tags, and categorization
- Asset access control: Permission-based access to digital assets and media files
- Asset processing: Image optimization, format conversion, and thumbnail generation

All endpoints use Django REST Framework ViewSets to provide standardized CRUD operations
with automatic URL routing through the DefaultRouter.
"""

from django.urls import path
from rest_framework.routers import DefaultRouter
from rest_framework_nested import routers

from .views import AssetViewSet, AssetUploadViewSet, UserAssetHistoryView
from workspace.views import WorkspaceViewSet

# Create router for automatic URL pattern generation
# The DefaultRouter provides standard CRUD operations for asset management
router = routers.DefaultRouter()
router.register(r'workspaces', WorkspaceViewSet, basename='workspace')

workspace_router = routers.NestedDefaultRouter(router, r'workspaces', lookup='workspace')
workspace_router.register(r'upload', AssetUploadViewSet, basename='workspace-asset-upload')
workspace_router.register(r'assets', AssetViewSet, basename='workspace-assets')

urlpatterns = router.urls + workspace_router.urls + [
    path('assets/files/', UserAssetHistoryView.as_view(), name='user-asset-history'),
]

# Complete list of generated API endpoints:
#
# ASSET MANAGEMENT:
# - GET    /api/assets/                → List all accessible assets with metadata and filtering
# - POST   /api/assets/                → Upload new asset with metadata and access permissions
# - GET    /api/assets/{id}/           → Retrieve specific asset details, metadata, and download URL
# - PUT    /api/assets/{id}/           → Full update of asset metadata and permissions
# - PATCH  /api/assets/{id}/           → Partial update of asset information and tags
# - DELETE /api/assets/{id}/           → Delete asset file and associated metadata
#
# URL Pattern Names (for use with reverse()):
# - asset-list, asset-detail
#
# Authentication & Authorization:
# - Authentication required for most operations (check view implementation)
# - Authorization may be based on asset ownership or workspace permissions
# - Public assets may be accessible without authentication for certain operations
#
# Query Parameters (supported on list endpoints):
# - ?search=query     → Full-text search across asset names, descriptions, and tags
# - ?ordering=field   → Sort results by field (e.g., created_at, file_size, name)
# - ?page=N          → Pagination support for large asset collections
# - ?page_size=N     → Control number of results per page
# - ?file_type=type  → Filter by specific file types (image, video, document, etc.)
# - ?tags=tag1,tag2  → Filter by asset tags or categories
#
# File Upload Requirements:
# - Multipart/form-data encoding required for file uploads
# - File size and type restrictions may apply (check view implementation)
# - Automatic thumbnail generation for supported image formats
# - Virus scanning and file validation on upload
