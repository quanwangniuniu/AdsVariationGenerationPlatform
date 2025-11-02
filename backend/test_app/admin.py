from django.contrib import admin

from .models import TestData


@admin.register(TestData)
class TestDataAdmin(admin.ModelAdmin):
    list_display = ("message", "timestamp", "is_active")
    search_fields = ("message",)
    list_filter = ("is_active", "timestamp")
    readonly_fields = ("timestamp",)
    ordering = ("-timestamp",)
