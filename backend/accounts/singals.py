from django.db.models.signals import post_save
from django.dispatch import receiver
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from django.conf import settings
from .models import User
import logging

logger = logging.getLogger(__name__)


@receiver(post_save, sender=User)
def send_welcome_email(sender, instance, created, **kwargs):
    """
    Send welcome email when a new user is created
    """
    if created and instance.is_active and instance.email:
        try:
            # Email subject
            subject = 'Welcome to Our Platform!'
            
            # Email template context
            context = {
                'user': instance,
                'site_name': getattr(settings, 'SITE_NAME', 'Our Platform'),
                'site_url': getattr(settings, 'SITE_URL', 'https://yoursite.com'),
            }
            
            # Render HTML email template
            html_message = render_to_string('emails/welcome_email.html', context)
            
            # Create plain text version
            plain_message = strip_tags(html_message)
            
            # Send email
            send_mail(
                subject=subject,
                message=plain_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[instance.email],
                html_message=html_message,
                fail_silently=False,
            )
            
            logger.info(f"Welcome email sent successfully to {instance.email}")
            
        except Exception as e:
            logger.error(f"Failed to send welcome email to {instance.email}: {str(e)}")
    elif created and instance.is_active and not instance.email:
        logger.info(f"New user created without email: {instance.username}")

@receiver(post_save, sender=User)
def user_profile_created(sender, instance, created, **kwargs):
    """
    Additional signal for user creation - can be used for other post-registration tasks
    """
    if created:
        logger.info(f"New user created: {instance.username} ({instance.email})")
        
        # You can add other post-registration tasks here, such as:
        # - Creating user profile
        # - Setting up default preferences
        # - Adding to default groups
        # - Creating default data
        pass