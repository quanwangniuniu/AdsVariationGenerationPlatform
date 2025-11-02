from django.db import models
from accounts.models import User


class SearchHistory(models.Model):
    """
    Search history model
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('success', 'Success'),
        ('failed', 'Failed'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='search_histories')
    search_query = models.CharField(max_length=255)
    search_parameters = models.JSONField()
    serpapi_search_id = models.CharField(max_length=100)
    platform_request_url = models.URLField()
    raw_response = models.JSONField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    total_results = models.IntegerField(null=True, blank=True)
    search_at = models.DateTimeField(auto_now_add=True)
    next_page_token = models.TextField(null=True, blank=True)
    next_page_url = models.URLField(null=True, blank=True)
    
    class Meta:
        db_table = 'search_history'
        verbose_name = 'Search History'
        verbose_name_plural = 'Search Histories'
        ordering = ['-search_at']
    
    def __str__(self):
        return f"{self.user.username} - {self.search_query} ({self.search_at.strftime('%Y-%m-%d %H:%M')})"


class Ad(models.Model):
    """
    Advertisement model
    """
    FORMAT_CHOICES = [
        ('text', 'Text'),
        ('image', 'Image'),
        ('video', 'Video'),
    ]
    
    search_history = models.ForeignKey(SearchHistory, on_delete=models.CASCADE, related_name='ads')
    advertiser_id = models.CharField(max_length=100)
    advertiser_name = models.CharField(max_length=255)
    ad_creative_id = models.CharField(max_length=100, unique=True)
    ad_format = models.CharField(max_length=20, choices=FORMAT_CHOICES)
    image_url = models.URLField()
    width = models.IntegerField()
    height = models.IntegerField()
    details_link = models.URLField()
    is_selected = models.BooleanField(default=False)
    retrieved_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'ads'
        verbose_name = 'Advertisement'
        verbose_name_plural = 'Advertisements'
        ordering = ['-retrieved_at']
    
    def __str__(self):
        return f"{self.advertiser_name} - {self.ad_creative_id}"