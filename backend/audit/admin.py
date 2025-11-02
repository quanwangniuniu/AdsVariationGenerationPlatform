from django.contrib import admin

from .models import ApiAccessLog


@admin.register(ApiAccessLog)
class ApiAccessLogAdmin(admin.ModelAdmin):
    list_display = (
        "timestamp",
        "user",
        "method",
        "path",
        "status_code",
        "action",
    )
    list_filter = ("method", "status_code", "action", "workspace_id")
    search_fields = ("path", "action", "request_id", "ip_address", "user__username", "user__email")
    ordering = ("-timestamp",)
    readonly_fields = (
        "timestamp",
        "user",
        "method",
        "path",
        "action",
        "status_code",
        "workspace_id",
        "payload",
        "response",
        "ip_address",
        "user_agent",
        "request_id",
    )

    fieldsets = (
        (None, {"fields": ("timestamp", "user", "workspace_id")}),
        ("Request", {"fields": ("method", "path", "action", "payload")}),
        ("Response", {"fields": ("status_code", "response")}),
        ("Meta", {"fields": ("ip_address", "user_agent", "request_id")}),
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
