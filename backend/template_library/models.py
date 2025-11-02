import uuid
from django.conf import settings
from django.db import models


class ModerationTerm(models.Model):
    """
    Backend-maintained list of prohibited terms used when moderating templates.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    term = models.CharField(max_length=64, unique=True)
    is_active = models.BooleanField(default=True)
    category = models.CharField(max_length=32, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "templates_moderation_term"
        verbose_name = "Moderation Term"
        verbose_name_plural = "Moderation Terms"

    def save(self, *args, **kwargs):
        if self.term:
            self.term = self.term.lower()
        super().save(*args, **kwargs)
        from .services import invalidate_term_cache

        invalidate_term_cache()

    def delete(self, *args, **kwargs):
        result = super().delete(*args, **kwargs)
        from .services import invalidate_term_cache

        invalidate_term_cache()
        return result

    def __str__(self) -> str:
        return self.term


class Template(models.Model):
    """
    User-authored template that must pass moderation before persistence.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="templates",
    )
    title = models.CharField(max_length=100, blank=True)
    content = models.TextField()
    word_count = models.PositiveSmallIntegerField()
    moderated_at = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "templates_template"
        ordering = ("-created_at",)
        verbose_name = "Template"
        verbose_name_plural = "Templates"

    def __str__(self) -> str:
        return f"{self.title or 'Template'} ({self.owner_id})"
