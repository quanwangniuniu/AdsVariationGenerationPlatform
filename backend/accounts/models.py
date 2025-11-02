
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    User model
    """
    email = models.EmailField(unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    #User Personal Information
    phone = models.CharField(max_length=20, blank=True, null=True, verbose_name="Phone Number")
    bio = models.TextField(max_length=500, blank=True, null=True, verbose_name="Biography")
    location = models.CharField(max_length=100, blank=True, null=True, verbose_name="Location")
    birth_date = models.DateField(blank=True, null=True, verbose_name="Birth Date")
    website = models.URLField(blank=True, null=True, verbose_name="Website")
    avatar = models.URLField(blank=True, null=True, verbose_name="Avatar URL")
    gender = models.CharField(
        max_length=10,
        choices=[('M', 'Male'), ('F', 'Female'), ('O', 'Other')],
        blank=True,
        null=True,
        verbose_name="Gender"
    )
    # SerpAPI settings
    serpapi_key = models.CharField(
        max_length=200,
        blank=True,
        null=True,
        help_text="SerpAPI key for fetching Google Ads Transparency Center data"
    )
    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = ['email']
    
    class Meta:
        db_table = 'user'
        verbose_name = 'User'
        verbose_name_plural = 'Users'
    
    def __str__(self):
        return self.username
