from django.apps import AppConfig
from django.db.models.signals import post_migrate
from django.contrib.auth import get_user_model

def create_default_superuser(sender, **kwargs):
    """
    Ensure a default superuser exists after migrations.
    """
    User = get_user_model()
    if not User.objects.filter(username="admin").exists():
        User.objects.create_superuser(
            username="admin",
            email="admin@gmail.com",
            password="admin"
        )

class AccountConfig(AppConfig):
    """
    Account app configuration
    """
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'accounts'
    verbose_name = 'Account Management'
    
    def ready(self):
        """
        App ready hook - import signal handlers here if needed
        """
        # Import signal handlers
        
        import accounts.singals

        post_migrate.connect(create_default_superuser, sender=self)
        