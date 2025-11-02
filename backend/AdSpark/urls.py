"""
URL configuration for the AdSpark app.

This module defines URL patterns for advertising data management using Django REST Framework.
All routes are exposed under '/api/' as configured in the main backend/urls.py.

The AdSpark app provides comprehensive advertising analytics and management functionality including:
- Advertiser management: CRUD operations for advertising companies and brands
- Creative management: Management of advertising creatives, campaigns, and content
- Watch management: Tracking and analytics for user interactions with advertisements

All endpoints use Django REST Framework ViewSets to provide standardized CRUD operations
with automatic URL routing through the DefaultRouter.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AdvertiserViewSet, CreativeViewSet, WatchViewSet

# Create a router and register our viewsets with it
# The DefaultRouter automatically generates URL patterns for all standard CRUD operations
router = DefaultRouter()

# Advertiser management endpoints
# Handles CRUD operations for advertising companies, brands, and advertiser profiles
# Provides endpoints for managing advertiser information, contact details, and business data
router.register(r'advertisers', AdvertiserViewSet, basename='advertiser')

# Creative content management endpoints
# Manages advertising creatives, campaign content, media assets, and creative metadata
# Handles creative approval workflows, versioning, and performance tracking
router.register(r'creatives', CreativeViewSet, basename='creative')

# User interaction and watch analytics endpoints
# Tracks user engagement, view counts, interaction metrics, and behavioral analytics
# Provides insights into advertisement performance and user engagement patterns
router.register(r'watches', WatchViewSet, basename='watch')

# The API URLs are now determined automatically by the router
# All ViewSet routes are included under the base path
urlpatterns = [
    path('', include(router.urls)),
]

# Complete list of generated API endpoints:
#
# ADVERTISER MANAGEMENT:
# - GET    /api/adspark/advertisers/           → List all advertisers with filtering and search capabilities
# - POST   /api/adspark/advertisers/           → Create new advertiser profile with company information
# - GET    /api/adspark/advertisers/{id}/      → Retrieve specific advertiser details and statistics
# - PUT    /api/adspark/advertisers/{id}/      → Full update of advertiser profile and business information
# - PATCH  /api/adspark/advertisers/{id}/      → Partial update of advertiser information
# - DELETE /api/adspark/advertisers/{id}/      → Delete advertiser profile and associated data
#
# CREATIVE CONTENT MANAGEMENT:
# - GET    /api/adspark/creatives/             → List all advertising creatives with metadata and filters
# - POST   /api/adspark/creatives/             → Upload and create new advertising creative content
# - GET    /api/adspark/creatives/{id}/        → Retrieve specific creative details, metadata, and performance
# - PUT    /api/adspark/creatives/{id}/        → Full update of creative content and metadata
# - PATCH  /api/adspark/creatives/{id}/        → Partial update of creative information
# - DELETE /api/adspark/creatives/{id}/        → Delete creative content and associated assets
#
# USER INTERACTION & ANALYTICS:
# - GET    /api/adspark/watches/               → List user interaction records with analytics data
# - POST   /api/adspark/watches/               → Record new user interaction or engagement event
# - GET    /api/adspark/watches/{id}/          → Retrieve specific interaction record and details
# - PUT    /api/adspark/watches/{id}/          → Update interaction record or analytics data
# - PATCH  /api/adspark/watches/{id}/          → Partial update of watch record information
# - DELETE /api/adspark/watches/{id}/          → Delete interaction record (for data cleanup)
#
# URL Pattern Names (for use with reverse()):
# - advertiser-list, advertiser-detail
# - creative-list, creative-detail
# - watch-list, watch-detail
#
# Authentication & Authorization:
# - Authentication requirements vary by endpoint (check view implementations)
# - Some endpoints may be public for analytics, others require authentication
# - Authorization may be based on advertiser ownership or admin permissions
#
# Query Parameters (supported on list endpoints):
# - ?search=query     → Full-text search across relevant fields
# - ?ordering=field   → Sort results by field (prefix with - for descending)
# - ?page=N          → Pagination support
# - ?page_size=N     → Control number of results per page
# - Custom filters   → Filter by specific field values (varies by resource)
