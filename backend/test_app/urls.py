"""
URL configuration for the test_app.

This module defines URL patterns for development and testing endpoints.
All routes are exposed under '/api/test/' as configured in the main backend/urls.py.

The test_app provides development utilities and testing functionality including:
- Connection testing: Database and service connectivity verification
- Test data management: Creation, retrieval, and cleanup of test datasets
- Development utilities: Debugging endpoints and development-only features

These endpoints are typically used during development, testing, and debugging phases
and should be disabled or secured in production environments.
"""

from django.urls import path
from . import views

app_name = 'test_app'

urlpatterns = [
    # Database and service connectivity testing endpoint
    # Verifies that the application can connect to required services (database, cache, external APIs)
    # Returns connection status and diagnostic information for troubleshooting
    path('connection/', views.test_connection, name='test_connection'),

    # Test data retrieval endpoint
    # Returns existing test datasets for development and testing purposes
    # Supports filtering and pagination for large test datasets
    path('data/', views.get_test_data, name='get_test_data'),

    # Test data creation endpoint
    # Generates sample data for development, testing, and demonstration purposes
    # Creates realistic test datasets with proper relationships and constraints
    path('data/create/', views.create_test_data, name='create_test_data'),

    # Test data cleanup endpoint
    # Removes all test data from the system to reset to clean state
    # Useful for development environment resets and automated testing cleanup
    path('data/clear/', views.clear_test_data, name='clear_test_data'),
]

# Complete list of available API endpoints:
#
# DEVELOPMENT & TESTING UTILITIES:
# - GET    /api/test/connection/       → Test database and service connectivity
# - GET    /api/test/data/             → Retrieve existing test datasets with optional filtering
# - POST   /api/test/data/create/      → Generate new test data for development and testing
# - DELETE /api/test/data/clear/       → Remove all test data and reset to clean state
#
# URL Pattern Names (for use with reverse()):
# - test_app:test_connection → Connection testing endpoint
# - test_app:get_test_data → Test data retrieval endpoint
# - test_app:create_test_data → Test data creation endpoint
# - test_app:clear_test_data → Test data cleanup endpoint
#
# Authentication & Authorization:
# - These endpoints may have relaxed authentication for development convenience
# - Should be properly secured or disabled in production environments
# - May require admin privileges or development mode flags
#
# Usage Notes:
# - Primarily intended for development and testing environments
# - Connection endpoint useful for health checks and deployment verification
# - Data creation/cleanup endpoints should be used carefully to avoid data loss
# - Consider implementing safety checks to prevent accidental production usage 