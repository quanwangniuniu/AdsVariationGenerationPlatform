from urllib.parse import urlsplit

from rest_framework import serializers

from .models import ApiAccessLog


class ApiAccessLogSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()
    page_url = serializers.SerializerMethodField()
    request_summary = serializers.SerializerMethodField()
    location_label = serializers.SerializerMethodField()

    class Meta:
        model = ApiAccessLog
        fields = (
            "id",
            "timestamp",
            "user",
            "status_code",
            "workspace_id",
            "request_summary",
            "location_label",
            "page_url",
            "request_id",
        )
        read_only_fields = fields

    def get_user(self, obj):
        user = getattr(obj, "user", None)
        if not user:
            return None
        return {
            "id": user.pk,
            "username": getattr(user, "username", None),
            "email": getattr(user, "email", None),
        }

    def _sanitized_path(self, obj) -> str:
        raw_path = getattr(obj, "path", "") or ""
        if not raw_path:
            return "/"
        parsed = urlsplit(str(raw_path))
        sanitized_path = parsed.path or "/"
        if sanitized_path.startswith("/api"):
            sanitized_path = sanitized_path[4:] or "/"
        sanitized_path = sanitized_path or "/"
        if not sanitized_path.startswith("/"):
            sanitized_path = f"/{sanitized_path}"
        return sanitized_path

    def get_page_url(self, obj) -> str | None:
        # Return a generic web path (sans /api) to avoid exposing internal API routes.
        sanitized = self._sanitized_path(obj)
        return sanitized or "/"

    def get_location_label(self, obj) -> str:
        path = self._sanitized_path(obj)
        trimmed = path.strip("/")
        if not trimmed:
            return "Dashboard"

        parts = [segment.replace("-", " ").replace("_", " ").strip() for segment in trimmed.split("/") if segment]
        if not parts:
            return "Dashboard"
        humanized = " › ".join(part.title() for part in parts)
        return humanized or "Dashboard"

    def get_request_summary(self, obj) -> str:
        method = (getattr(obj, "method", "") or "").upper() or "REQUEST"
        label = self.get_location_label(obj)
        if method:
            return f"{method} • {label}"
        return label
