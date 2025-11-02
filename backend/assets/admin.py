"""Admin registrations that help staff monitor uploaded and pending assets."""

from django.contrib import admin

from .models import Asset, PendingAsset


@admin.register(Asset)
class AssetAdmin(admin.ModelAdmin):
    """Expose Asset records to staff so they can audit uploaded files."""

    # We display ownership, file metadata, and lifecycle flags so reviewers can quickly
    # validate where a file belongs, what type it is, and whether it is still available.
    list_display = ("id", "workspace", "file", "mime_type", "is_active", "uploaded_at", "deleted_at")
    list_select_related = ("workspace",)
    search_fields = ("id", "file", "checksum", "workspace__name")
    list_filter = ("is_active", "uploaded_at", "deleted_at", "workspace")
    date_hierarchy = "uploaded_at"
    ordering = ("-uploaded_at",)
    readonly_fields = ("checksum", "uploaded_at", "deleted_at")


@admin.register(PendingAsset)
class PendingAssetAdmin(admin.ModelAdmin):
    """Help staff monitor pending uploads and their status."""

    # Surfacing the upload name, current status, and workspace tells operators whether
    # an ingestion job is stuck and which team to notify about the issue.
    list_display = ("id", "workspace", "original_name", "status", "created_at")
    list_select_related = ("workspace",)
    search_fields = ("id", "original_name", "workspace__name")
    list_filter = ("status", "created_at", "workspace")
    date_hierarchy = "created_at"
    ordering = ("-created_at",)
    readonly_fields = ("created_at",)
