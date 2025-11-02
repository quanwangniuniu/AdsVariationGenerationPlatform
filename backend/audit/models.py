from __future__ import annotations

from django.conf import settings
from django.db import models


class ApiAccessLog(models.Model):
    """Stores a lightweight audit trail for API interactions."""

    id = models.BigAutoField(primary_key=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="api_access_logs",
    )
    method = models.CharField(max_length=8)
    path = models.CharField(max_length=255)
    action = models.CharField(max_length=128, blank=True)
    status_code = models.PositiveSmallIntegerField()
    workspace_id = models.UUIDField(null=True, blank=True)
    payload = models.JSONField(blank=True, null=True)
    response = models.JSONField(blank=True, null=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    request_id = models.CharField(max_length=64, blank=True)

    class Meta:
        db_table = "audit_api_access_log"
        ordering = ("-timestamp",)
        indexes = [
            models.Index(fields=("user", "-timestamp")),
            models.Index(fields=("action", "-timestamp")),
            models.Index(fields=("status_code", "-timestamp")),
        ]

    def __str__(self) -> str:  # pragma: no cover - human readable only
        return f"ApiAccessLog<{self.method} {self.path} {self.status_code}>"
