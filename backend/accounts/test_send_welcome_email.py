"""
Welcome Email Signal Tests for accounts app

Tests for the signal-based welcome email functionality when users are created.
"""

from django.test import TestCase
from django.core import mail
from django.conf import settings
from unittest.mock import patch, Mock
from rest_framework.test import APITestCase
from rest_framework import status
from django.urls import reverse
import logging

from .models import User
from .serializers import UserRegistrationSerializer


class WelcomeEmailSignalTest(TestCase):
    """Test cases for welcome email signals."""

    def setUp(self):
        """Set up test data."""
        # Clear any existing mail
        mail.outbox = []

        self.user_data = {
            'username': 'testuser',
            'email': 'test@example.com',
            'password': 'testpass123',
            'first_name': 'Test',
            'last_name': 'User'
        }

    def test_welcome_email_sent_on_user_creation(self):
        """Test that welcome email is sent when a new user is created."""
        # Create user - this should trigger the signal
        user = User.objects.create_user(**self.user_data)

        # Check that email was sent
        self.assertEqual(len(mail.outbox), 1)

        # Check email details
        email = mail.outbox[0]
        self.assertEqual(email.subject, 'Welcome to Our Platform!')
        self.assertEqual(email.to, ['test@example.com'])
        self.assertIn('test@example.com', email.body)  # User email should be in body

        # Check that HTML version exists if template is available
        # Note: This will only work if the email template exists
        # self.assertIsNotNone(email.alternatives)

    def test_welcome_email_sent_on_user_registration_via_serializer(self):
        """Test welcome email when user is created via registration serializer."""
        mail.outbox = []

        data = {
            'username': 'serialuser',
            'email': 'serial@example.com',
            'password': 'StrongPass123!',
            'password_confirm': 'StrongPass123!',
            'first_name': 'Serial',
            'last_name': 'User'
        }

        serializer = UserRegistrationSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        user = serializer.save()

        # Check email was sent
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['serial@example.com'])

    def test_no_welcome_email_for_inactive_user(self):
        """Test that welcome email is not sent for inactive users."""
        mail.outbox = []

        # Create user and immediately deactivate
        user_data = self.user_data.copy()
        user = User.objects.create_user(**user_data)
        user.is_active = False
        user.save()

        # Email should have been sent during creation (user starts active)
        # But let's test creating an inactive user directly
        mail.outbox = []

        inactive_user = User(
            username='inactiveuser',
            email='inactive@example.com',
            is_active=False
        )
        inactive_user.set_password('testpass123')
        inactive_user.save()

        # No email should be sent for inactive user
        self.assertEqual(len(mail.outbox), 0)

    def test_no_welcome_email_without_email_address(self):
        """Test that welcome email is not sent for users without email."""
        mail.outbox = []

        # Create user without email
        user_data = self.user_data.copy()
        user_data['email'] = ''  # Empty email

        user = User.objects.create_user(**user_data)

        # No email should be sent
        self.assertEqual(len(mail.outbox), 0)

    def test_no_welcome_email_on_user_update(self):
        """Test that welcome email is not sent when updating existing user."""
        # Create user first
        user = User.objects.create_user(**self.user_data)

        # Clear the email from creation
        mail.outbox = []

        # Update user
        user.first_name = 'Updated'
        user.save()

        # No new email should be sent
        self.assertEqual(len(mail.outbox), 0)

    @patch('accounts.singals.send_mail')
    def test_welcome_email_failure_handling(self, mock_send_mail):
        """Test that email sending failures are handled gracefully."""
        # Mock send_mail to raise an exception
        mock_send_mail.side_effect = Exception("SMTP connection failed")

        # User creation should still succeed even if email fails
        user = User.objects.create_user(**self.user_data)

        # Verify user was created successfully
        self.assertIsNotNone(user)
        self.assertEqual(user.username, 'testuser')

        # Verify send_mail was called (attempt was made)
        mock_send_mail.assert_called_once()

    @patch('accounts.singals.logger')
    def test_welcome_email_success_logging(self, mock_logger):
        """Test that successful email sending is logged."""
        user = User.objects.create_user(**self.user_data)
        #Check al the log calls
        calls = mock_logger.info.call_args_list
        expected_calls = [
            f"New user created: {user.username} ({user.email})",
            f"Welcome email sent successfully to {user.email}"
        ]
        # Check that success was logged
        actual_calls = [call[0][0] for call in calls]
        for expected_call in expected_calls:
            self.assertIn(expected_call, actual_calls)

    @patch('accounts.singals.send_mail')
    @patch('accounts.singals.logger')
    def test_welcome_email_failure_logging(self, mock_logger, mock_send_mail):
        """Test that email sending failures are logged."""
        # Mock send_mail to raise an exception
        error_message = "SMTP server unavailable"
        mock_send_mail.side_effect = Exception(error_message)

        user = User.objects.create_user(**self.user_data)

        # Check that error was logged
        mock_logger.error.assert_called_with(
            f"Failed to send welcome email to {user.email}: {error_message}"
        )

    @patch('accounts.singals.logger')
    def test_user_without_email_logging(self, mock_logger):
        """Test logging when user is created without email."""
        user_data = self.user_data.copy()
        user_data['email'] = ''

        user = User.objects.create_user(**user_data)

        # Check that creation without email was logged
        mock_logger.info.assert_called_with(
            f"New user created: {user.username} ({user.email})"
        )

    def test_user_profile_created_signal_logging(self):
        """Test that user creation is logged by the profile_created signal."""
        with patch('accounts.singals.logger') as mock_logger:
            user = User.objects.create_user(**self.user_data)

            # Check that user creation was logged
            mock_logger.info.assert_called_with(
                f"New user created: {user.username} ({user.email})"
            )

    @patch('accounts.singals.render_to_string')
    def test_email_template_rendering(self, mock_render):
        """Test that email template is rendered with correct context."""
        mock_render.return_value = "<html>Welcome!</html>"

        user = User.objects.create_user(**self.user_data)

        # Verify template was called with correct context
        mock_render.assert_called_once_with(
            'emails/welcome_email.html',
            {
                'user': user,
                'site_name': getattr(settings, 'SITE_NAME', 'Our Platform'),
                'site_url': getattr(settings, 'SITE_URL', 'https://yoursite.com'),
            }
        )

    def test_email_content_structure(self):
        """Test the structure and content of the welcome email."""
        user = User.objects.create_user(**self.user_data)

        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]

        # Test email properties
        self.assertEqual(email.subject, 'Welcome to Our Platform!')
        self.assertEqual(email.from_email, settings.DEFAULT_FROM_EMAIL)
        self.assertEqual(email.to, ['test@example.com'])

        # Test that email body contains user information
        # Note: Actual content depends on your email template
        self.assertIn('testuser', email.body)  # Username should be in email


class WelcomeEmailAPIIntegrationTest(APITestCase):
    """Integration tests for welcome email during API registration."""

    def setUp(self):
        """Set up test data for API tests."""
        mail.outbox = []

    def test_registration_api_triggers_welcome_email(self):
        """Test that user registration via API triggers welcome email."""
        url = reverse('accounts:register')
        data = {
            'username': 'apiuser',
            'email': 'apiuser@example.com',
            'password': 'StrongAPIPass123!',
            'password_confirm': 'StrongAPIPass123!',
            'first_name': 'API',
            'last_name': 'User'
        }

        response = self.client.post(url, data, format='json')

        # Check registration was successful
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['success'])

        # Check welcome email was sent
        self.assertEqual(len(mail.outbox), 1)

        email = mail.outbox[0]
        self.assertEqual(email.subject, 'Welcome to Our Platform!')
        self.assertEqual(email.to, ['apiuser@example.com'])

    def test_failed_registration_no_email(self):
        """Test that failed registration doesn't trigger welcome email."""
        url = reverse('accounts:register')
        data = {
            'username': 'baduser',
            'email': 'invalid-email',  # Invalid email
            'password': '123',  # Weak password
            'password_confirm': '456',  # Password mismatch
        }

        response = self.client.post(url, data, format='json')

        # Check registration failed
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data['success'])

        # No email should be sent
        self.assertEqual(len(mail.outbox), 0)

    @patch('accounts.singals.send_mail')
    def test_registration_succeeds_despite_email_failure(self, mock_send_mail):
        """Test that registration succeeds even if welcome email fails."""
        # Mock email failure
        mock_send_mail.side_effect = Exception("Email service down")

        url = reverse('accounts:register')
        data = {
            'username': 'resilientuser',
            'email': 'resilient@example.com',
            'password': 'ResilientPass123!',
            'password_confirm': 'ResilientPass123!',
        }

        response = self.client.post(url, data, format='json')

        # Registration should still succeed
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['success'])

        # User should exist in database
        self.assertTrue(User.objects.filter(username='resilientuser').exists())

        # Email attempt should have been made
        mock_send_mail.assert_called_once()


