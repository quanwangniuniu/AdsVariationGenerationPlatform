from django.contrib import admin

from .models import Template, ModerationTerm


@admin.register(Template)
class TemplateAdmin(admin.ModelAdmin):
    list_display = ("id", "owner", "title", "word_count", "created_at", "updated_at")
    list_filter = ("created_at",)
    search_fields = ("title", "content", "owner__username", "owner__email")


@admin.register(ModerationTerm)
class ModerationTermAdmin(admin.ModelAdmin):
    list_display = ("term", "category", "is_active", "updated_at")
    list_filter = ("is_active", "category")
    search_fields = ("term",)
