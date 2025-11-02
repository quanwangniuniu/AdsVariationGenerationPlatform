"""
URL configuration for the accounts app.

This module defines URL patterns for user account management and authentication endpoints.
All routes are exposed under '/api/account/' as configured in the main backend/urls.py.

The accounts app provides comprehensive user account functionality including:
- User registration and authentication (login/logout)
- User profile management and updates
- Password management and security features
- Token verification for secure operations
- Account deletion capabilities

Authentication is handled through Django's session framework or token-based authentication
depending on the view implementation.
"""

from django.urls import path
from . import views

app_name = 'accounts'

urlpatterns = [
    # User registration and authentication endpoints
    # Handles new user account creation with email verification
    path('register/', views.register_view, name='register'),

    # User login endpoint - authenticates user credentials and creates session/token
    path('login/', views.login_view, name='login'),

    # User logout endpoint - invalidates current session/token
    path('logout/', views.logout_view, name='logout'),

    # User profile management endpoints
    # Retrieves current user's profile information and account details
    path('profile/', views.profile_view, name='profile'),

    # Updates user profile information (name, email, preferences, etc.)
    path('profile/update/', views.profile_update_view, name='profile_update'),

    # Password security management
    # Allows authenticated users to change their account password
    path('password/change/', views.change_password_view, name='change_password'),

    # Security token verification endpoint
    # Validates authentication tokens for secure operations and API access
    path('verify/', views.verify_token_view, name='verify_token'),

    # Account deletion endpoint
    # Permanently deletes user account and associated data (requires confirmation)
    path('delete/', views.delete_account_view, name='delete_account'),

    # CSRF token endpoint
    # Provides CSRF token for authenticated requests
    path('csrf/', views.csrf_token_view, name='csrf_token'),
]

# Complete list of generated API endpoints:
#
# AUTHENTICATION & REGISTRATION:
# - POST   /api/account/register/           → Create new user account with email verification
# - POST   /api/account/login/              → Authenticate user credentials and create session/token
# - POST   /api/account/logout/             → Invalidate current session/token and logout user
#
# PROFILE MANAGEMENT:
# - GET    /api/account/profile/            → Retrieve current user's profile and account information
# - PUT    /api/account/profile/update/     → Update user profile information and preferences
# - PATCH  /api/account/profile/update/     → Partially update user profile information
#
# SECURITY & PASSWORD MANAGEMENT:
# - PUT    /api/account/password/change/    → Change user account password (requires current password)
# - POST   /api/account/verify/             → Verify authentication token validity for secure operations
#
# ACCOUNT MANAGEMENT:
# - DELETE /api/account/delete/             → Permanently delete user account and all associated data
#
# Authentication Requirements:
# - register: No authentication required (public endpoint)
# - login: No authentication required (public endpoint)
# - logout: Requires valid session/token
# - profile: Requires authentication
# - profile/update: Requires authentication
# - password/change: Requires authentication and current password
# - verify: Requires valid token to verify
# - delete: Requires authentication and confirmation