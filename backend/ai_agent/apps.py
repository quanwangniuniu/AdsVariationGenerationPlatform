from django.apps import AppConfig


class AdVariantConfig(AppConfig):
    """
    Django app configuration for the Ad Variant application.

    This app handles the creation, management, and feedback collection
    for AI-generated advertisement variants. It provides functionality for:
    - Creating ad variants using AI services (Dify API)
    - Managing variant generation status and metadata
    - Collecting and managing user feedback on variants
    - Tracking confidence scores and performance metrics
    """

    # Use BigAutoField as the default primary key field type
    default_auto_field = 'django.db.models.BigAutoField'

    # The app name - should match the directory name
    name = 'ai_agent'

    # Human-readable app name for Django admin and other places
    verbose_name = 'Ad Variant Management'

    def ready(self):
        """
        Called when Django starts up. Use this method to perform
        initialization tasks such as registering signal handlers.
        """
        # Import signal handlers if any are defined
        # Example: from . import signals
        pass