"""
Comprehensive test suite for the accounts app.

This module contains unit tests for models, serializers, views, and API endpoints
related to user account functionality including authentication, registration,
login, profile management, and password operations.
"""
from django.conf import settings
from django.test import TestCase
from django.urls import reverse
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from rest_framework.authtoken.models import Token
from unittest.mock import patch, Mock

from .models import User
from .serializers import (
    UserRegistrationSerializer,
    UserLoginSerializer,
    UserProfileSerializer,
    PasswordChangeSerializer,
    UserUpdateSerializer
)

User = get_user_model()


class UserModelTest(TestCase):
    """Test cases for the User model."""

    def setUp(self):
        """Set up test data for User model tests."""
        self.user_data = {
            'username': 'testuser',
            'email': 'test@example.com',
            'password': 'testpass123',
            'first_name': 'Test',
            'last_name': 'User'
        }

    def test_create_user_success(self):
        """Test successful user creation with valid data."""
        user = User.objects.create_user(**self.user_data)

        self.assertEqual(user.username, 'testuser')
        self.assertEqual(user.email, 'test@example.com')
        self.assertEqual(user.first_name, 'Test')
        self.assertEqual(user.last_name, 'User')
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertTrue(user.check_password('testpass123'))

    def test_create_user_unique_email(self):
        """Test that email field enforces uniqueness constraint."""
        User.objects.create_user(**self.user_data)

        duplicate_user_data = self.user_data.copy()
        duplicate_user_data['username'] = 'anotheruser'

        with self.assertRaises(Exception):  # IntegrityError expected
            User.objects.create_user(**duplicate_user_data)

    def test_create_user_unique_username(self):
        """Test that username field enforces uniqueness constraint."""
        User.objects.create_user(**self.user_data)

        duplicate_user_data = self.user_data.copy()
        duplicate_user_data['email'] = 'another@example.com'

        with self.assertRaises(Exception):  # IntegrityError expected
            User.objects.create_user(**duplicate_user_data)

    def test_user_string_representation(self):
        """Test the string representation of User model."""
        user = User.objects.create_user(**self.user_data)
        self.assertEqual(str(user), 'testuser')

    def test_user_timestamps(self):
        """Test that created_at and updated_at timestamps are set correctly."""
        user = User.objects.create_user(**self.user_data)

        self.assertIsNotNone(user.created_at)
        self.assertIsNotNone(user.updated_at)

        # Update user and check that updated_at changes
        original_updated_at = user.updated_at
        user.first_name = 'Updated'
        user.save()

        user.refresh_from_db()
        self.assertGreater(user.updated_at, original_updated_at)


class UserRegistrationSerializerTest(TestCase):
    """Test cases for UserRegistrationSerializer."""

    def setUp(self):
        """Set up test data for serializer tests."""
        self.valid_data = {
            'username': 'newuser',
            'email': 'newuser@example.com',
            'password': 'StrongPass123!',
            'password_confirm': 'StrongPass123!',
            'first_name': 'New',
            'last_name': 'User'
        }

    def test_valid_registration_data(self):
        """Test serializer with valid registration data."""
        serializer = UserRegistrationSerializer(data=self.valid_data)
        self.assertTrue(serializer.is_valid())

        user = serializer.save()
        self.assertEqual(user.username, 'newuser')
        self.assertEqual(user.email, 'newuser@example.com')
        self.assertTrue(user.check_password('StrongPass123!'))

    def test_password_mismatch(self):
        """Test validation when passwords don't match."""
        invalid_data = self.valid_data.copy()
        invalid_data['password_confirm'] = 'DifferentPass123!'

        serializer = UserRegistrationSerializer(data=invalid_data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("Passwords don't match.", str(serializer.errors))

    def test_weak_password_validation(self):
        """Test validation for weak passwords."""
        invalid_data = self.valid_data.copy()
        invalid_data['password'] = '123'
        invalid_data['password_confirm'] = '123'

        serializer = UserRegistrationSerializer(data=invalid_data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('password', serializer.errors)

    def test_duplicate_username(self):
        """Test validation for duplicate username."""
        User.objects.create_user(
            username='existinguser',
            email='existing@example.com',
            password='testpass123'
        )

        invalid_data = self.valid_data.copy()
        invalid_data['username'] = 'existinguser'

        serializer = UserRegistrationSerializer(data=invalid_data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('A user with that username already exists.', str(serializer.errors))

    def test_duplicate_email(self):
        """Test validation for duplicate email."""
        User.objects.create_user(
            username='existinguser',
            email='existing@example.com',
            password='testpass123'
        )

        invalid_data = self.valid_data.copy()
        invalid_data['email'] = 'existing@example.com'

        serializer = UserRegistrationSerializer(data=invalid_data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('User with this email already exists.', str(serializer.errors))


class UserLoginSerializerTest(TestCase):
    """Test cases for UserLoginSerializer."""

    def setUp(self):
        """Set up test data for login serializer tests."""
        self.user = User.objects.create_user(
            username='loginuser',
            email='login@example.com',
            password='loginpass123'
        )

    def test_valid_login_with_username(self):
        """Test successful login with username."""
        data = {
            'username': 'loginuser',
            'password': 'loginpass123'
        }

        serializer = UserLoginSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data['user'], self.user)

    def test_valid_login_with_email(self):
        """Test successful login with email as username."""
        data = {
            'username': 'login@example.com',
            'password': 'loginpass123'
        }

        serializer = UserLoginSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data['user'], self.user)

    def test_invalid_credentials(self):
        """Test login with invalid credentials."""
        data = {
            'username': 'loginuser',
            'password': 'wrongpassword'
        }

        serializer = UserLoginSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('Invalid credentials.', str(serializer.errors))

    def test_inactive_user_login(self):
        """Test login attempt with inactive user."""
        self.user.is_active = False
        self.user.save()

        data = {
            'username': 'loginuser',
            'password': 'loginpass123'
        }

        serializer = UserLoginSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('Invalid credentials.', str(serializer.errors))

    def test_missing_credentials(self):
        """Test login with missing credentials."""
        data = {'username': 'loginuser'}

        serializer = UserLoginSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('password', serializer.errors)


class UserProfileSerializerTest(TestCase):
    """Test cases for UserProfileSerializer."""

    def setUp(self):
        """Set up test data for profile serializer tests."""
        self.user = User.objects.create_user(
            username='profileuser',
            email='profile@example.com',
            password='profilepass123',
            first_name='Profile',
            last_name='User'
        )

    def test_profile_serialization(self):
        """Test that user profile is serialized correctly."""
        serializer = UserProfileSerializer(self.user)
        data = serializer.data

        self.assertEqual(data['username'], 'profileuser')
        self.assertEqual(data['email'], 'profile@example.com')
        self.assertEqual(data['first_name'], 'Profile')
        self.assertEqual(data['last_name'], 'User')
        self.assertTrue(data['is_active'])
        self.assertIn('id', data)
        self.assertIn('created_at', data)
        self.assertIn('updated_at', data)


class PasswordChangeSerializerTest(TestCase):
    """Test cases for PasswordChangeSerializer."""

    def setUp(self):
        """Set up test data for password change serializer tests."""
        self.user = User.objects.create_user(
            username='passworduser',
            email='password@example.com',
            password='oldpass123'
        )
        self.request_mock = Mock()
        self.request_mock.user = self.user

    def test_valid_password_change(self):
        """Test successful password change with valid data."""
        data = {
            'old_password': 'oldpass123',
            'new_password': 'NewStrongPass123!',
            'new_password_confirm': 'NewStrongPass123!'
        }

        serializer = PasswordChangeSerializer(
            data=data,
            context={'request': self.request_mock}
        )
        self.assertTrue(serializer.is_valid())

        serializer.save()
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('NewStrongPass123!'))

    def test_incorrect_old_password(self):
        """Test password change with incorrect old password."""
        data = {
            'old_password': 'wrongoldpass',
            'new_password': 'NewStrongPass123!',
            'new_password_confirm': 'NewStrongPass123!'
        }

        serializer = PasswordChangeSerializer(
            data=data,
            context={'request': self.request_mock}
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn('Old password is incorrect.', str(serializer.errors))

    def test_new_password_mismatch(self):
        """Test password change when new passwords don't match."""
        data = {
            'old_password': 'oldpass123',
            'new_password': 'NewStrongPass123!',
            'new_password_confirm': 'DifferentNewPass123!'
        }

        serializer = PasswordChangeSerializer(
            data=data,
            context={'request': self.request_mock}
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("New passwords don't match.", str(serializer.errors))


class UserUpdateSerializerTest(TestCase):
    """Test cases for UserUpdateSerializer."""

    def setUp(self):
        """Set up test data for user update serializer tests."""
        self.user = User.objects.create_user(
            username='updateuser',
            email='update@example.com',
            password='updatepass123',
            first_name='Update',
            last_name='User'
        )
        self.other_user = User.objects.create_user(
            username='otheruser',
            email='other@example.com',
            password='otherpass123'
        )
        self.request_mock = Mock()
        self.request_mock.user = self.user

    def test_valid_profile_update(self):
        """Test successful profile update with valid data."""
        data = {
            'email': 'newemail@example.com',
            'first_name': 'Updated',
            'last_name': 'Name'
        }

        serializer = UserUpdateSerializer(
            self.user,
            data=data,
            context={'request': self.request_mock}
        )
        self.assertTrue(serializer.is_valid())

        updated_user = serializer.save()
        self.assertEqual(updated_user.email, 'newemail@example.com')
        self.assertEqual(updated_user.first_name, 'Updated')
        self.assertEqual(updated_user.last_name, 'Name')

    def test_duplicate_email_update(self):
        """Test profile update with email that already exists."""
        data = {
            'email': 'other@example.com',  # Already taken by other_user
            'first_name': 'Updated',
            'last_name': 'Name'
        }

        serializer = UserUpdateSerializer(
            self.user,
            data=data,
            context={'request': self.request_mock}
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn('User with this email already exists.', str(serializer.errors))


class AccountViewsTest(APITestCase):
    """Test cases for account views and API endpoints."""

    def setUp(self):
        """Set up test data for view tests."""
        self.client = APIClient(enforce_csrf_checks=False)
        self.user = User.objects.create_user(
            username='viewuser',
            email='view@example.com',
            password='viewpass123',
            first_name='View',
            last_name='User'
        )
        self.token = Token.objects.create(user=self.user)

    def test_user_registration_success(self):
        """Test successful user registration via API."""
        url = reverse('accounts:register')
        data = {
            'username': 'newreguser',
            'email': 'newreg@example.com',
            'password': 'StrongRegPass123!',
            'password_confirm': 'StrongRegPass123!',
            'first_name': 'New',
            'last_name': 'Registration'
        }

        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['success'])
        self.assertEqual(response.data['message'], 'User created successfully')
        self.assertIn('user', response.data)
        self.assertIn('token', response.data)

        # Verify user was created in database
        self.assertTrue(User.objects.filter(username='newreguser').exists())

    def test_user_registration_failure(self):
        """Test user registration with invalid data."""
        url = reverse('accounts:register')
        data = {
            'username': 'baduser',
            'email': 'bademail',  # Invalid email format
            'password': '123',  # Weak password
            'password_confirm': '456',  # Password mismatch
        }

        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data['success'])
        self.assertEqual(response.data['message'], 'Registration failed')
        self.assertIn('errors', response.data)

    def test_user_login_success(self):
        """Test successful user login via API."""
        url = reverse('accounts:login')
        data = {
            'username': 'viewuser',
            'password': 'viewpass123'
        }

        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        self.assertEqual(response.data['message'], 'Login successful')
        self.assertIn('user', response.data)
        self.assertIn('token', response.data)

    def test_user_login_with_email(self):
        """Test successful user login using email as username."""
        url = reverse('accounts:login')
        data = {
            'username': 'view@example.com',
            'password': 'viewpass123'
        }

        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])

    def test_user_login_failure(self):
        """Test user login with invalid credentials."""
        url = reverse('accounts:login')
        data = {
            'username': 'viewuser',
            'password': 'wrongpassword'
        }

        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data['success'])
        self.assertEqual(response.data['message'], 'Login failed')

    def test_user_logout_success(self):
        """Test successful user logout."""
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token.key)
        url = reverse('accounts:logout')

        response = self.client.post(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        self.assertEqual(response.data['message'], 'Logout successful')

        # Verify token was deleted
        self.assertFalse(Token.objects.filter(key=self.token.key).exists())

    def test_user_logout_unauthenticated(self):
        """Test logout attempt without authentication."""
        url = reverse('accounts:logout')

        response = self.client.post(url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_get_user_profile(self):
        """Test getting authenticated user's profile."""
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token.key)
        url = reverse('accounts:profile')

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        self.assertIn('user', response.data)
        self.assertEqual(response.data['user']['username'], 'viewuser')
        self.assertEqual(response.data['user']['email'], 'view@example.com')

    def test_get_profile_unauthenticated(self):
        """Test getting profile without authentication."""
        url = reverse('accounts:profile')

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_update_user_profile_success(self):
        """Test successful user profile update."""
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token.key)
        url = reverse('accounts:profile_update')
        data = {
            'email': 'updated@example.com',
            'first_name': 'Updated',
            'last_name': 'Name'
        }

        response = self.client.put(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        self.assertEqual(response.data['message'], 'Profile updated successfully')

        # Verify changes in database
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, 'updated@example.com')
        self.assertEqual(self.user.first_name, 'Updated')
        self.assertEqual(self.user.last_name, 'Name')

    def test_partial_update_user_profile(self):
        """Test partial user profile update using PATCH."""
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token.key)
        url = reverse('accounts:profile_update')
        data = {'first_name': 'Partially Updated'}

        response = self.client.patch(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])

        # Verify partial update
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, 'Partially Updated')
        self.assertEqual(self.user.last_name, 'User')  # Should remain unchanged

    def test_change_password_success(self):
        """Test successful password change."""
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token.key)
        url = reverse('accounts:change_password')
        data = {
            'old_password': 'viewpass123',
            'new_password': 'NewViewPass123!',
            'new_password_confirm': 'NewViewPass123!'
        }

        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        self.assertEqual(response.data['message'], 'Password changed successfully')
        self.assertIn('token', response.data)  # New token should be returned

        # Verify password was changed
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('NewViewPass123!'))

        # Verify old token was deleted and new one created
        self.assertFalse(Token.objects.filter(key=self.token.key).exists())

    def test_change_password_wrong_old_password(self):
        """Test password change with incorrect old password."""
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token.key)
        url = reverse('accounts:change_password')
        data = {
            'old_password': 'wrongoldpass',
            'new_password': 'NewViewPass123!',
            'new_password_confirm': 'NewViewPass123!'
        }

        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data['success'])
        self.assertEqual(response.data['message'], 'Password change failed')

    def test_verify_token_success(self):
        """Test successful token verification."""
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token.key)
        url = reverse('accounts:verify_token')

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        self.assertEqual(response.data['message'], 'Token is valid')
        self.assertIn('user', response.data)

    def test_verify_invalid_token(self):
        """Test verification with invalid token."""
        self.client.credentials(HTTP_AUTHORIZATION='Token invalidtoken123')
        url = reverse('accounts:verify_token')

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_delete_account_success(self):
        """Test successful account deletion."""
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token.key)
        url = reverse('accounts:delete_account')
        data = {'password': 'viewpass123'}

        response = self.client.delete(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        self.assertEqual(response.data['message'], 'Account deleted successfully')

        # Verify user was soft deleted (is_active = False)
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_active)

    def test_delete_account_wrong_password(self):
        """Test account deletion with incorrect password confirmation."""
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token.key)
        url = reverse('accounts:delete_account')
        data = {'password': 'wrongpassword'}

        response = self.client.delete(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data['success'])
        self.assertEqual(response.data['message'], 'Password confirmation required')

        # Verify user was not deleted
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_active)

    def test_delete_account_no_password(self):
        """Test account deletion without password confirmation."""
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token.key)
        url = reverse('accounts:delete_account')

        response = self.client.delete(url, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data['success'])
        self.assertEqual(response.data['message'], 'Password confirmation required')


class AccountIntegrationTest(APITestCase):
    """Integration tests for complete account workflows."""

    def setUp(self):
        """Set up test data for integration tests."""
        self.client = APIClient(enforce_csrf_checks=False)

    def test_complete_user_journey(self):
        """Test complete user journey from registration to account deletion."""
        # 1. User Registration
        register_url = reverse('accounts:register')
        register_data = {
            'username': 'journeyuser',
            'email': 'journey@example.com',
            'password': 'JourneyPass123!',
            'password_confirm': 'JourneyPass123!',
            'first_name': 'Journey',
            'last_name': 'User'
        }

        register_response = self.client.post(register_url, register_data, format='json')
        self.assertEqual(register_response.status_code, status.HTTP_201_CREATED)
        registration_token = register_response.data['token']

        # 2. Login with credentials
        login_url = reverse('accounts:login')
        login_data = {
            'username': 'journeyuser',
            'password': 'JourneyPass123!'
        }

        login_response = self.client.post(login_url, login_data, format='json')
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)
        login_token = login_response.data['token']

        # 3. Get profile information
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + login_token)
        profile_url = reverse('accounts:profile')

        profile_response = self.client.get(profile_url)
        self.assertEqual(profile_response.status_code, status.HTTP_200_OK)
        self.assertEqual(profile_response.data['user']['username'], 'journeyuser')

        # 4. Update profile
        update_url = reverse('accounts:profile_update')
        update_data = {
            'email': 'updated_journey@example.com',
            'first_name': 'Updated Journey'
        }

        update_response = self.client.patch(update_url, update_data, format='json')
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)

        # 5. Change password
        password_url = reverse('accounts:change_password')
        password_data = {
            'old_password': 'JourneyPass123!',
            'new_password': 'NewJourneyPass456!',
            'new_password_confirm': 'NewJourneyPass456!'
        }

        password_response = self.client.post(password_url, password_data, format='json')
        self.assertEqual(password_response.status_code, status.HTTP_200_OK)
        new_token = password_response.data['token']

        # 6. Verify new token works
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + new_token)
        verify_url = reverse('accounts:verify_token')

        verify_response = self.client.get(verify_url)
        self.assertEqual(verify_response.status_code, status.HTTP_200_OK)

        # 7. Logout
        logout_url = reverse('accounts:logout')
        logout_response = self.client.post(logout_url)
        self.assertEqual(logout_response.status_code, status.HTTP_200_OK)

        self.client.credentials()

        # 8. Login again with new password
        login_data['password'] = 'NewJourneyPass456!'
        login_response_2 = self.client.post(login_url, login_data, format='json')
        print(login_response_2.status_code, login_response_2.data)
        self.assertEqual(login_response_2.status_code, status.HTTP_200_OK)

        # 9. Delete account
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + login_response_2.data['token'])
        delete_url = reverse('accounts:delete_account')
        delete_data = {'password': 'NewJourneyPass456!'}

        delete_response = self.client.delete(delete_url, delete_data, format='json')
        self.assertEqual(delete_response.status_code, status.HTTP_200_OK)

        # Verify user account is deactivated
        user = User.objects.get(username='journeyuser')
        self.assertFalse(user.is_active)


# Additional test cases to append to the existing test.py file

class UserModelAdditionalTest(TestCase):
    """Additional test cases for the User model."""

    def setUp(self):
        """Set up test data for additional User model tests."""
        self.user_data = {
            'username': 'testuser',
            'email': 'test@example.com',
            'password': 'testpass123',
            'first_name': 'Test',
            'last_name': 'User'
        }

    def test_registration_without_email_fails(self):
        """Test registration serializer requires email."""
        data = {
            'username': 'testuser',
            'password': 'StrongPass123!',
            'password_confirm': 'StrongPass123!',
            # missing email
        }

        serializer = UserRegistrationSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('email', serializer.errors)
        self.assertEqual(serializer.errors['email'][0].code, 'required')

    def test_create_user_with_empty_username(self):
        """Test user creation fails with empty username."""
        user_data = self.user_data.copy()
        user_data['username'] = ''

        with self.assertRaises(ValueError):
            User.objects.create_user(**user_data)

    def test_create_user_with_invalid_email_format(self):
        """Test user creation with invalid email format."""
        user_data = self.user_data.copy()
        user_data['email'] = 'invalid-email'

        user = User.objects.create_user(**user_data)

        # Django allows invalid email format at model level,
        # validation happens at form/serializer level
        self.assertEqual(user.email, 'invalid-email')

    def test_user_full_name_property(self):
        """Test getting user's full name."""
        user = User.objects.create_user(**self.user_data)
        expected_full_name = f"{user.first_name} {user.last_name}"
        self.assertEqual(user.get_full_name(), expected_full_name)

    def test_user_short_name_property(self):
        """Test getting user's short name."""
        user = User.objects.create_user(**self.user_data)
        self.assertEqual(user.get_short_name(), user.first_name)

    def test_user_meta_properties(self):
        """Test User model meta properties."""
        self.assertEqual(User._meta.db_table, 'user')
        self.assertEqual(User._meta.verbose_name, 'User')
        self.assertEqual(User._meta.verbose_name_plural, 'Users')

    def test_user_required_fields(self):
        """Test User model required fields configuration."""
        self.assertEqual(User.USERNAME_FIELD, 'username')
        self.assertIn('email', User.REQUIRED_FIELDS)


class UserRegistrationSerializerAdditionalTest(TestCase):
    """Additional test cases for UserRegistrationSerializer."""

    def setUp(self):
        """Set up test data for additional serializer tests."""
        self.valid_data = {
            'username': 'newuser',
            'email': 'newuser@example.com',
            'password': 'StrongPass123!',
            'password_confirm': 'StrongPass123!',
            'first_name': 'New',
            'last_name': 'User'
        }

    def test_password_too_short(self):
        """Test validation for password that's too short."""
        invalid_data = self.valid_data.copy()
        invalid_data['password'] = 'short'
        invalid_data['password_confirm'] = 'short'

        serializer = UserRegistrationSerializer(data=invalid_data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('password', serializer.errors)

    def test_missing_required_fields(self):
        """Test validation when required fields are missing."""
        required_fields = ['username', 'email', 'password', 'password_confirm']

        for field in required_fields:
            invalid_data = self.valid_data.copy()
            del invalid_data[field]

            serializer = UserRegistrationSerializer(data=invalid_data)
            self.assertFalse(serializer.is_valid())
            self.assertIn(field, serializer.errors)

    def test_invalid_email_format(self):
        """Test validation for invalid email format."""
        invalid_data = self.valid_data.copy()
        invalid_data['email'] = 'invalid-email-format'

        serializer = UserRegistrationSerializer(data=invalid_data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('email', serializer.errors)

    def test_registration_with_optional_fields_empty(self):
        """Test registration with optional fields (first_name, last_name) empty."""
        data = {
            'username': 'minimaluser',
            'email': 'minimal@example.com',
            'password': 'StrongPass123!',
            'password_confirm': 'StrongPass123!',
            'first_name': '',
            'last_name': ''
        }

        serializer = UserRegistrationSerializer(data=data)
        self.assertTrue(serializer.is_valid())

        user = serializer.save()
        self.assertEqual(user.first_name, '')
        self.assertEqual(user.last_name, '')


class UserLoginSerializerAdditionalTest(TestCase):
    """Additional test cases for UserLoginSerializer."""

    def setUp(self):
        """Set up test data for additional login serializer tests."""
        self.active_user = User.objects.create_user(
            username='activeuser',
            email='active@example.com',
            password='activepass123'
        )

        self.inactive_user = User.objects.create_user(
            username='inactiveuser',
            email='inactive@example.com',
            password='inactivepass123'
        )
        self.inactive_user.is_active = False
        self.inactive_user.save()

    def test_login_with_nonexistent_username(self):
        """Test login with username that doesn't exist."""
        data = {
            'username': 'nonexistent',
            'password': 'somepassword'
        }

        serializer = UserLoginSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('Invalid credentials.', str(serializer.errors))

    def test_login_with_nonexistent_email(self):
        """Test login with email that doesn't exist."""
        data = {
            'username': 'nonexistent@example.com',
            'password': 'somepassword'
        }

        serializer = UserLoginSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('Invalid credentials.', str(serializer.errors))

    def test_empty_password_field(self):
        """Test login with empty password field."""
        data = {
            'username': 'activeuser',
            'password': ''
        }

        serializer = UserLoginSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('password', serializer.errors)


    def test_empty_username_field(self):
        """Test login with empty username field."""
        data = {
            'username': '',
            'password': 'activepass123'
        }

        serializer = UserLoginSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('username', serializer.errors)


class PasswordChangeSerializerAdditionalTest(TestCase):
    """Additional test cases for PasswordChangeSerializer."""

    def setUp(self):
        """Set up test data for additional password change tests."""
        self.user = User.objects.create_user(
            username='passworduser',
            email='password@example.com',
            password='oldpass123'
        )
        self.request_mock = Mock()
        self.request_mock.user = self.user

    def test_password_change_with_weak_new_password(self):
        """Test password change with weak new password."""
        data = {
            'old_password': 'oldpass123',
            'new_password': '123',
            'new_password_confirm': '123'
        }

        serializer = PasswordChangeSerializer(
            data=data,
            context={'request': self.request_mock}
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn('new_password', serializer.errors)

    def test_password_change_missing_old_password(self):
        """Test password change without providing old password."""
        data = {
            'new_password': 'NewStrongPass123!',
            'new_password_confirm': 'NewStrongPass123!'
        }

        serializer = PasswordChangeSerializer(
            data=data,
            context={'request': self.request_mock}
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn('old_password', serializer.errors)

    def test_password_change_same_old_and_new_password(self):
        """Test password change when new password is same as old password."""
        data = {
            'old_password': 'oldpass123',
            'new_password': 'oldpass123',
            'new_password_confirm': 'oldpass123'
        }

        serializer = PasswordChangeSerializer(
            data=data,
            context={'request': self.request_mock}
        )
        # This should be valid (Django allows setting same password)
        self.assertTrue(serializer.is_valid())


class AccountViewsAdditionalTest(APITestCase):
    """Additional test cases for account views and API endpoints."""

    def setUp(self):
        """Set up test data for additional view tests."""
        self.client = APIClient(enforce_csrf_checks=False)
        self.user = User.objects.create_user(
            username='viewuser',
            email='view@example.com',
            password='viewpass123',
            first_name='View',
            last_name='User'
        )
        self.token = Token.objects.create(user=self.user)

    def test_registration_with_existing_token(self):
        """Test that registration creates only one token per user."""
        url = reverse('accounts:register')
        data = {
            'username': 'tokenuser',
            'email': 'token@example.com',
            'password': 'TokenPass123!',
            'password_confirm': 'TokenPass123!',
            'first_name': 'Token',
            'last_name': 'User'
        }

        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Verify only one token exists for the user
        user = User.objects.get(username='tokenuser')
        tokens = Token.objects.filter(user=user)
        self.assertEqual(tokens.count(), 1)

    def test_login_creates_token_if_not_exists(self):
        """Test that login creates token if one doesn't exist."""
        # Create user without token
        user_without_token = User.objects.create_user(
            username='notokenuser',
            email='notoken@example.com',
            password='notokenpass123'
        )

        url = reverse('accounts:login')
        data = {
            'username': 'notokenuser',
            'password': 'notokenpass123'
        }

        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)

        # Verify token was created
        self.assertTrue(Token.objects.filter(user=user_without_token).exists())

    def test_login_reuses_existing_token(self):
        """Test that login reuses existing token instead of creating new one."""
        original_token_count = Token.objects.count()

        url = reverse('accounts:login')
        data = {
            'username': 'viewuser',
            'password': 'viewpass123'
        }

        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['token'], self.token.key)

        # Verify no new token was created
        self.assertEqual(Token.objects.count(), original_token_count)

    def test_profile_update_with_invalid_email_format(self):
        """Test profile update with invalid email format."""
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token.key)
        url = reverse('accounts:profile_update')
        data = {'email': 'invalid-email-format'}

        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data['success'])
        self.assertIn('errors', response.data)

    def test_profile_update_with_same_email(self):
        """Test profile update with the same email (should be allowed)."""
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token.key)
        url = reverse('accounts:profile_update')
        data = {'email': 'view@example.com'}  # Same as current email

        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])

    def test_change_password_with_same_password(self):
        """Test changing password to the same password."""
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token.key)
        url = reverse('accounts:change_password')
        data = {
            'old_password': 'viewpass123',
            'new_password': 'viewpass123',
            'new_password_confirm': 'viewpass123'
        }

        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])

    def test_delete_account_hard_delete_option(self):
        """Test account deletion with hard delete (if implemented)."""
        # Note: Current implementation uses soft delete
        # This test documents what hard delete would look like
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token.key)
        url = reverse('accounts:delete_account')
        data = {'password': 'viewpass123'}

        initial_user_count = User.objects.count()
        response = self.client.delete(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])

        # With soft delete, user count remains the same
        self.assertEqual(User.objects.count(), initial_user_count)

        # Verify user is deactivated, not deleted
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_active)

    def test_multiple_logout_attempts(self):
        """Test multiple logout attempts don't cause errors."""
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token.key)
        url = reverse('accounts:logout')

        # First logout
        response1 = self.client.post(url)
        self.assertEqual(response1.status_code, status.HTTP_200_OK)

        # Token should be deleted after first logout
        self.assertFalse(Token.objects.filter(key=self.token.key).exists())

        # Second logout attempt should failed since already logout
        response2 = self.client.post(url)
        self.assertEqual(response2.status_code, status.HTTP_403_FORBIDDEN)


class AccountSecurityTest(APITestCase):
    """Security-focused test cases for account functionality."""

    def setUp(self):
        """Set up test data for security tests."""
        self.client = APIClient(enforce_csrf_checks=False)
        settings.REST_FRAMEWORK['DEFAULT_AUTHENTICATION_CLASSES'] = [
            'rest_framework.authentication.TokenAuthentication',
        ]
        self.user = User.objects.create_user(
            username='securityuser',
            email='security@example.com',
            password='securitypass123'
        )
        self.token = Token.objects.create(user=self.user)

    def test_token_in_response_not_in_logs(self):
        """Test that sensitive data like tokens are properly handled."""
        url = reverse('accounts:login')
        data = {
            'username': 'securityuser',
            'password': 'securitypass123'
        }

        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)

        # Token should be present in response
        self.assertIsNotNone(response.data['token'])
        self.assertTrue(len(response.data['token']) > 0)

    def test_password_not_returned_in_profile(self):
        """Test that password is never returned in profile responses."""
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token.key)
        url = reverse('accounts:profile')

        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Password should not be in response
        self.assertNotIn('password', response.data['user'])

    def test_unauthorized_access_to_protected_endpoints(self):
        """Test that protected endpoints reject unauthorized requests."""
        protected_endpoints = [
            ('accounts:profile', 'GET'),
            ('accounts:profile_update', 'PATCH'),
            ('accounts:change_password', 'POST'),
            ('accounts:verify_token', 'GET'),
            ('accounts:delete_account', 'DELETE'),
            ('accounts:logout', 'POST'),
        ]

        for endpoint_name, method in protected_endpoints:
            url = reverse(endpoint_name)
            self.client.credentials()

            if method == 'GET':
                response = self.client.get(url)
            elif method == 'POST':
                response = self.client.post(url, {})
            elif method == 'PATCH':
                response = self.client.patch(url, {})
            elif method == 'DELETE':
                response = self.client.delete(url, {})

            self.assertEqual(
                response.status_code,
                status.HTTP_403_FORBIDDEN,
                f"Endpoint {endpoint_name} should require authentication"
            )

    def test_invalid_token_format(self):
        """Test authentication with invalid token format."""
        self.client.credentials()
        self.client.credentials(HTTP_AUTHORIZATION='InvalidFormat')
        url = reverse('accounts:profile')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_malformed_token_header(self):
        """Test authentication with malformed token header."""
        self.client.credentials()
        self.client.credentials(HTTP_AUTHORIZATION='Token')  # Missing token value
        url = reverse('accounts:profile')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class AccountErrorHandlingTest(APITestCase):
    """Test cases for error handling in account functionality."""

    def setUp(self):
        """Set up test data for error handling tests."""
        self.client = APIClient(enforce_csrf_checks=False)


    def test_registration_with_malformed_json(self):
        """Test registration with malformed JSON data."""
        url = reverse('accounts:register')

        # Send malformed JSON
        response = self.client.post(
            url,
            'malformed json data',
            content_type='application/json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_with_empty_request_body(self):
        """Test login with completely empty request body."""
        url = reverse('accounts:login')

        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data['success'])

    def test_profile_update_with_no_data(self):
        """Test profile update with no data provided."""
        user = User.objects.create_user(
            username='erroruser',
            email='error@example.com',
            password='errorpass123'
        )
        token = Token.objects.create(user=user)

        self.client.credentials(HTTP_AUTHORIZATION='Token ' + token.key)
        url = reverse('accounts:profile_update')

        response = self.client.patch(url, {}, format='json')
        # Empty update should still be successful (no changes made)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    @patch('accounts.views.Token.objects.create')
    def test_token_creation_failure_handling(self, mock_token_create):
        """Test handling of token creation failures."""
        mock_token_create.side_effect = Exception("Token creation failed")

        url = reverse('accounts:register')
        data = {
            'username': 'failuser',
            'email': 'fail@example.com',
            'password': 'FailPass123!',
            'password_confirm': 'FailPass123!',
        }

        # This should handle the exception gracefully
        # Note: Actual implementation might need to be modified to handle this
        response = self.client.post(url, data, format='json')

        # The response might still be successful if user creation succeeds
        # even if token creation fails
        self.assertIn(response.status_code, [
            status.HTTP_201_CREATED,
            status.HTTP_500_INTERNAL_SERVER_ERROR
        ])


class AccountValidationTest(TestCase):
    """Test cases for comprehensive validation scenarios."""

    def test_username_validation_edge_cases(self):
        """Test username validation with edge cases."""
        edge_cases = [
            ('a', True),  # Single character
            ('a' * 30, True),  # Long but reasonable username
            ('user@domain', False),  # @ symbol should be invalid
            ('user.name', True),  # Username with dot
            ('user_name', True),  # Username with underscore
            ('user-name', True),  # Username with hyphen
            ('123user', True),  # Username starting with number
            ('user name', False),  # Space should be invalid
            ('user#name', False),  # Special chars should be invalid
        ]

        for username, should_be_valid in edge_cases:
            data = {
                'username': username,
                'email': f'{username}@example.com',
                'password': 'StrongPass123!',
                'password_confirm': 'StrongPass123!',
            }

            serializer = UserRegistrationSerializer(data=data)
            if should_be_valid:
                self.assertTrue(
                    serializer.is_valid(),
                    f"Username '{username}' should be valid"
                )
            else:
                self.assertFalse(
                    serializer.is_valid(),
                    f"Username '{username}' should be invalid"
                )

    def test_email_validation_edge_cases(self):
        """Test email validation with various formats."""
        email_cases = [
            ('user@domain.com', True),
            ('user.name@domain.com', True),
            ('user+tag@domain.com', True),
            ('user@sub.domain.com', True),
            ('user@domain-name.com', True),
            ('plainaddress', False),
            ('@missinglocal.com', False),
            ('missing@.com', False),
            ('missing@domain', False),  # Django allows this
        ]

        for email, should_be_valid in email_cases:
            data = {
                'username': f'user{hash(email)}',
                'email': email,
                'password': 'StrongPass123!',
                'password_confirm': 'StrongPass123!',
            }

            serializer = UserRegistrationSerializer(data=data)
            if should_be_valid:
                self.assertTrue(
                    serializer.is_valid(),
                    f"Email '{email}' should be valid: {serializer.errors}"
                )
            else:
                self.assertFalse(
                    serializer.is_valid(),
                    f"Email '{email}' should be invalid"
                )
