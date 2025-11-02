from django.db import models
from django.utils import timezone
from datetime import datetime
from accounts.models import User

#Mapping Mode
class Google_Ads_GeoId(models.Model):
    geo_id = models.IntegerField(unique=True)
    country_name = models.CharField(max_length=100)
    country_code = models.CharField(max_length=5)
    tld = models.CharField(max_length=10, blank=True, null=True)

    def __str__(self):
        return f"{self.country_name} ({self.country_code})"

class Advertiser(models.Model):
    advertiser_id = models.CharField(max_length=32, primary_key=True)
    name = models.CharField(max_length=255)
    first_seen_at = models.DateTimeField(null=True, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'adspark_advertiser'
        verbose_name = 'Advertiser'
        verbose_name_plural = 'Advertisers'

    def __str__(self):
        return f"{self.name} ({self.advertiser_id})"


class Creative(models.Model):
    FORMAT_CHOICES = [
        ('text', 'Text'),
        ('image', 'Image'),
        ('video', 'Video'),
    ]
    
    PLATFORM_CHOICES = [
        ('PLAY', 'Google Play'),
        ('MAPS', 'Google Maps'),
        ('SEARCH', 'Google Search'),
        ('SHOPPING', 'Google Shopping'),
        ('YOUTUBE', 'YouTube'),
    ]
    ad_creative_id = models.CharField(max_length=32, primary_key=True)
    advertiser = models.ForeignKey(Advertiser, on_delete=models.CASCADE, related_name="creatives")
    format = models.CharField(max_length=16, choices=FORMAT_CHOICES)  # text/image/video
    image_url = models.URLField(max_length=1000,null=True, blank=True)
    video_link = models.URLField(max_length=1000,null=True, blank=True)
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    target_domain = models.CharField(max_length=255, null=True, blank=True)
    first_shown = models.DateTimeField(db_index=True)
    last_shown = models.DateTimeField(db_index=True)
    details_link = models.URLField(max_length=1000)
    region = models.CharField(max_length=8, db_index=True, null=True, blank=True)
    platform = models.CharField(max_length=16, choices=PLATFORM_CHOICES, null=True, blank=True)
    fetched_at = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    title = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        db_table = 'adspark_creative'
        verbose_name = 'Creative'
        verbose_name_plural = 'Creatives'
        indexes = [
            models.Index(fields=['advertiser', 'format', 'region']),
            models.Index(fields=['target_domain']),
            models.Index(fields=['platform', 'format']),
            models.Index(fields=['first_shown', 'last_shown']),
        ]

    def __str__(self):
        return f"{self.ad_creative_id} - {self.advertiser.name}"

    @property
    def aspect_ratio(self):
        """Calculate aspect ratio if width and height are available"""
        if self.width and self.height:
            return round(self.width / self.height, 2)
        return None

    @property
    def duration_days(self):
        """Calculate duration in days between first_shown and last_shown"""
        if self.first_shown and self.last_shown:
            return (self.last_shown - self.first_shown).days
        return None

    @property
    def get_creative_title(self):
        """Human-readable identifier combining advertiser and creative id."""
        advertiser_name = getattr(self.advertiser, "name", None) or "Unknown Advertiser"
        return f"{advertiser_name} / {self.ad_creative_id}"



class Watch(models.Model):
    """Saved watch configurations for recurring fetch jobs"""
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    advertiser_ids = models.TextField(blank=True, null=True)  # Comma-separated IDs
    text = models.CharField(max_length=255, blank=True, null=True)
    region = models.CharField(max_length=8, blank=True, null=True)
    platform = models.CharField(max_length=16, blank=True, null=True)
    creative_format = models.CharField(max_length=16, blank=True, null=True)
    political_ads = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'adspark_watch'
        verbose_name = 'Watch'
        verbose_name_plural = 'Watches'

    def __str__(self):
        return self.name


class UserCreativeTitle(models.Model):
    """User-specific custom titles for creatives"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='creative_titles')
    creative = models.ForeignKey(Creative, on_delete=models.CASCADE, related_name='user_titles')
    custom_title = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'adspark_user_creative_title'
        verbose_name = 'User Creative Title'
        verbose_name_plural = 'User Creative Titles'
        unique_together = [['user', 'creative']]  # One custom title per user per creative
        indexes = [
            models.Index(fields=['user', 'creative']),
        ]

    def __str__(self):
        return f"{self.user.username}'s title for {self.creative.ad_creative_id}"
