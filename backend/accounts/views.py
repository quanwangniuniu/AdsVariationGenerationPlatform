from django.shortcuts import render
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from django.contrib.auth import login, logout
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.utils.decorators import method_decorator
from django.middleware.csrf import get_token

from .serializers import (
    UserRegistrationSerializer,
    UserLoginSerializer,
    UserProfileSerializer,
    PasswordChangeSerializer,
    UserUpdateSerializer
)
@api_view(['POST'])
@permission_classes([AllowAny])
def register_view(request):
    """
    User registration endpoint
    """
    serializer = UserRegistrationSerializer(data=request.data)
    
    if serializer.is_valid():
        user = serializer.save()
        # Create token for the new user
        token, created = Token.objects.get_or_create(user=user)
        
        return Response({
            'success': True,
            'message': 'User created successfully',
            'user': UserProfileSerializer(user).data,
            'token': token.key
        }, status=status.HTTP_201_CREATED)
    
    return Response({
        'success': False,
        'message': 'Registration failed',
        'errors': serializer.errors
    }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """
    User login endpoint
    """
    serializer = UserLoginSerializer(data=request.data)
    
    if serializer.is_valid():
        user = serializer.validated_data['user']
        
        # Get or create token
        token, created = Token.objects.get_or_create(user=user)
        
        # Django session login (optional, for web interface)
        login(request, user)
        
        return Response({
            'success': True,
            'message': 'Login successful',
            'user': UserProfileSerializer(user).data,
            'token': token.key
        }, status=status.HTTP_200_OK)
    
    return Response({
        'success': False,
        'message': 'Login failed',
        'errors': serializer.errors
    }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """
    User logout endpoint
    """
    try:
        # Delete the user's token
        request.user.auth_token.delete()
    except:
        pass
    
    # Django session logout
    logout(request)
    
    return Response({
        'success': True,
        'message': 'Logout successful'
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def profile_view(request):
    """
    Get user profile
    """
    serializer = UserProfileSerializer(request.user)
    
    return Response({
        'success': True,
        'user': serializer.data
    }, status=status.HTTP_200_OK)


@api_view(['PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def profile_update_view(request):
    """
    Update user profile
    """
    serializer = UserUpdateSerializer(
        request.user, 
        data=request.data, 
        partial=request.method == 'PATCH',
        context={'request': request}
    )
    
    if serializer.is_valid():
        user = serializer.save()
        
        return Response({
            'success': True,
            'message': 'Profile updated successfully',
            'user': UserProfileSerializer(user).data
        }, status=status.HTTP_200_OK)
    
    return Response({
        'success': False,
        'message': 'Profile update failed',
        'errors': serializer.errors
    }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password_view(request):
    """
    Change user password
    """
    serializer = PasswordChangeSerializer(
        data=request.data,
        context={'request': request}
    )
    
    if serializer.is_valid():
        serializer.save()
        
        # Regenerate token after password change for security
        from django.db import transaction

        with transaction.atomic():
            # Delete all existing tokens (if they exist)
            Token.objects.filter(user=request.user).delete()
            # Create a new token
            token = Token.objects.create(user=request.user)

        return Response({
            'success': True,
            'message': 'Password changed successfully',
            'token': token.key  # Return new token
        }, status=status.HTTP_200_OK)
    
    return Response({
        'success': False,
        'message': 'Password change failed',
        'errors': serializer.errors
    }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def verify_token_view(request):
    """
    Verify if token is valid
    """
    return Response({
        'success': True,
        'message': 'Token is valid',
        'user': UserProfileSerializer(request.user).data
    }, status=status.HTTP_200_OK)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_account_view(request):
    """
    Delete user account
    """
    user = request.user
    
    # Optional: Add password confirmation
    password = request.data.get('password')
    if not password or not user.check_password(password):
        return Response({
            'success': False,
            'message': 'Password confirmation required'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # Delete user account
    user.is_active = False  # Soft delete
    user.save()
    
    # Or hard delete: user.delete()
    
    return Response({
        'success': True,
        'message': 'Account deleted successfully'
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def csrf_token_view(request):
    """
    Get CSRF token for frontend requests.
    This endpoint ensures the CSRF cookie is set in the response.

    Returns:
        Response: CSRF token for authenticated requests
    """
    csrf_token = get_token(request)

    return Response({
        'csrfToken': csrf_token
    }, status=status.HTTP_200_OK)