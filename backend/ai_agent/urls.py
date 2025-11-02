
"""
URL configuration for the ai_agent app.

This module defines URL patterns for AI-powered advertisement generation and feedback management.
All routes are exposed under '/api/' as configured in the main backend/urls.py.

The ai_agent app provides AI-driven creative generation functionality including:
- Ad variant generation: AI-powered creation of multiple advertisement variations from original content
- Feedback management: Collection and analysis of user feedback on generated ad variants
- Performance tracking: Monitoring of generation status, success rates, and user satisfaction

The app leverages machine learning models to generate creative variations and uses feedback
loops to improve generation quality over time.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AdVariantViewSet, AdVariantFeedbackViewSet, WorkspaceAdVariantViewSet

# Create router entity for automatic URL pattern generation
# The DefaultRouter provides standard CRUD operations for all registered ViewSets
router = DefaultRouter()

# AI-powered ad variant generation and management endpoints
# Handles creation, retrieval, and management of AI-generated advertisement variations
# Provides custom actions for tracking generation status and filtering by original ads
router.register(r'ad-variants', AdVariantViewSet, basename='ad-variant')

# User feedback collection and analysis endpoints
# Manages feedback on AI-generated ad variants to improve future generations
# Supports feedback categorization, user-specific feedback tracking, and variant analytics
router.register(r'ad-variant-feedback', AdVariantFeedbackViewSet, basename='ad-variant-feedback')

# URL Configuration - includes all router-generated patterns
workspace_ad_variant_list = WorkspaceAdVariantViewSet.as_view({
    'get': 'list',
    'post': 'create',
})
workspace_ad_variant_detail = WorkspaceAdVariantViewSet.as_view({
    'get': 'retrieve',
    'put': 'update',
    'patch': 'partial_update',
    'delete': 'destroy',
})
workspace_ad_variant_status = WorkspaceAdVariantViewSet.as_view({
    'get': 'status',
})
workspace_ad_variant_by_original = WorkspaceAdVariantViewSet.as_view({
    'get': 'by_original_ad',
})
urlpatterns = [
    path('workspaces/<uuid:workspace_id>/ai-variants/', workspace_ad_variant_list, name='workspace-ad-variant-list'),
    path('workspaces/<uuid:workspace_id>/ai-variants/<int:pk>/', workspace_ad_variant_detail, name='workspace-ad-variant-detail'),
    path('workspaces/<uuid:workspace_id>/ai-variants/<int:pk>/status/', workspace_ad_variant_status, name='workspace-ad-variant-status'),
    path('workspaces/<uuid:workspace_id>/ai-variants/by-original-ad/<str:original_ad_id>/', workspace_ad_variant_by_original, name='workspace-ad-variant-by-original'),
    path('', include(router.urls)),
]

# This will generate the following URL patterns:
"""
AdVariantViewSet URLs:
- GET    /api/ad-variants/                           # List all variants
- POST   /api/ad-variants/                           # Create a new variant
- GET    /api/ad-variants/{id}/                      # Retrieve details of a specific variant
- PUT    /api/ad-variants/{id}/                      # Update a variant
- PATCH  /api/ad-variants/{id}/                      # Partially update a variant
- DELETE /api/ad-variants/{id}/                      # Delete a variant

AdVariantViewSet Custom Actions:
- GET    /api/ad-variants/{id}/status/                           # Retrieve the generation status of a variant
- GET    /api/ad-variants/by-original-ad/{original_ad_id}/      # List variants by original ad ID
- GET    /api/ad-variants/user-variants/                        # Retrieve variants created by the current user

AdVariantFeedbackViewSet URLs:
- GET    /api/ad-variant-feedback/                   # List all feedback
- POST   /api/ad-variant-feedback/                   # Create new feedback
- GET    /api/ad-variant-feedback/{id}/              # Retrieve details of a specific feedback
- PUT    /api/ad-variant-feedback/{id}/              # Update feedback
- PATCH  /api/ad-variant-feedback/{id}/              # Partially update feedback
- DELETE /api/ad-variant-feedback/{id}/              # Delete feedback

AdVariantFeedbackViewSet Custom Actions:
- GET    /api/ad-variant-feedback/by-variant/{variant_id}/      # List feedback by variant ID
- GET    /api/ad-variant-feedback/user-feedback/               # Retrieve feedback created by the current user
"""

