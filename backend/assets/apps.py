"""Configuration for the app that stores and manages creative assets."""

from django.apps import AppConfig


class AssetsConfig(AppConfig):
    """Keep Django informed about the assets app and its responsibilities."""

    # The assets app centralises the storage and lifecycle management of files that users upload.
    default_auto_field = "django.db.models.BigAutoField"
    name = "assets"
    verbose_name = "Digital Asset Management"
