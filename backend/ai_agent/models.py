from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from accounts.models import User
from AdSpark.models import Creative
from workspace.models import Workspace
from billing.models import TokenTransaction


class AdVariant(models.Model):
    """
    Advertisement variant model
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    
    original_ad = models.ForeignKey(Creative, on_delete=models.CASCADE, related_name='variants')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='ad_variants')
    variant_title = models.CharField(max_length=1000)
    variant_description = models.TextField()
    variant_image_url = models.URLField(max_length=1000)
    ai_generation_params = models.JSONField()
    ai_agent_platform = models.CharField(max_length=50)
    generation_status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    ai_prompt_used = models.TextField()
    ai_response_metadata = models.JSONField()
    generation_requested_at = models.DateTimeField(auto_now_add=True)
    generation_completed_at = models.DateTimeField(null=True, blank=True)
    confidence_score = models.FloatField(
        null=True, 
        blank=True, 
        validators=[MinValueValidator(0.0), MaxValueValidator(1.0)]
    )
    token_transaction = models.ForeignKey(
        TokenTransaction,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="ad_variants",
        help_text="Token consumption transaction associated with this generation",
    )
    
    class Meta:
        db_table = 'ad_variants'
        verbose_name = 'Ad Variant'
        verbose_name_plural = 'Ad Variants'
        ordering = ['-generation_requested_at']
    
    def __str__(self):
        return f"{self.variant_title} - {self.user.username}"

class WorkspaceAdVariant(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    original_ad = models.ForeignKey(Creative, on_delete=models.CASCADE, related_name="workspace_variants")
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="workspace_ad_variants")
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="workspace_ad_variants")
    variant_title = models.CharField(max_length=1000)
    variant_description = models.TextField()
    variant_image_url = models.URLField(max_length=1000)
    ai_generation_params = models.JSONField()
    ai_agent_platform = models.CharField(max_length=50)
    generation_status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    ai_prompt_used = models.TextField()
    ai_response_metadata = models.JSONField()
    generation_requested_at = models.DateTimeField(auto_now_add=True)
    generation_completed_at = models.DateTimeField(null=True, blank=True)
    confidence_score = models.FloatField(null=True, blank=True,
        validators=[MinValueValidator(0.0), MaxValueValidator(1.0)]
    )

    token_transaction = models.ForeignKey(
        TokenTransaction,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="workspace_ad_variants",
        help_text="Token transaction recorded for this workspace generation",
    )

    class Meta:
        db_table = "workspace_ad_variants"
        ordering = ["-generation_requested_at"]

    def __str__(self):
        return f"[Workspace {self.workspace.id}] {self.variant_title}"

class AdVariantFeedback(models.Model):
    """
    Advertisement variant feedback model
    """
    RATING_CHOICES = [
        (1, '1 Star'),
        (2, '2 Stars'),
        (3, '3 Stars'),
        (4, '4 Stars'),
        (5, '5 Stars'),
    ]
    
    variant = models.ForeignKey(AdVariant, on_delete=models.CASCADE, related_name='feedbacks')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='variant_feedbacks')
    is_approved = models.BooleanField(null=True, blank=True)
    rating = models.IntegerField(
        choices=RATING_CHOICES, 
        null=True, 
        blank=True
    )
    feedback_text = models.TextField(null=True, blank=True)
    feedback_details = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'ad_variant_feedback'
        verbose_name = 'Ad Variant Feedback'
        verbose_name_plural = 'Ad Variant Feedbacks'
        ordering = ['-created_at']
        unique_together = ['variant', 'user']
    
    def __str__(self):
        approved_text = "Approved" if self.is_approved else "Rejected" if self.is_approved is False else "Pending"
        return f"{self.variant.variant_title} - {self.user.username} ({approved_text})"
