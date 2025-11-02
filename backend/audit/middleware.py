from __future__ import annotations

import json
import logging
from typing import Any, Dict

from django.http import RawPostDataException
from django.utils.deprecation import MiddlewareMixin

from .models import ApiAccessLog

logger = logging.getLogger(__name__)


class ApiAuditMiddleware(MiddlewareMixin):
    """Capture a lightweight audit log entry for API requests."""

    def process_response(self, request, response):  # noqa: D401 - DRF signature
        try:
            if not request.path.startswith("/api/"):
                return response

            method = request.method.upper()
            # Skip health checks or login endpoints if desired
            if request.path.startswith("/api/healthz"):
                return response

            action = ""
            resolver_match = getattr(request, "resolver_match", None)
            if resolver_match and resolver_match.view_name:
                action = resolver_match.view_name

            workspace_id = None
            workspace = getattr(request, "workspace", None)
            if workspace is not None:
                workspace_id = getattr(workspace, "id", workspace)

            payload = self._extract_request_payload(request)
            extra_detail = getattr(request, "_audit_detail", None)
            if extra_detail:
                if payload is None:
                    payload = extra_detail
                elif isinstance(payload, dict):
                    payload.update(extra_detail)

            ApiAccessLog.objects.create(
                user=request.user if getattr(request, "user", None) and request.user.is_authenticated else None,
                method=method,
                path=request.path,
                action=action,
                status_code=getattr(response, "status_code", 0),
                workspace_id=workspace_id,
                payload=payload,
                response=self._extract_response_summary(response),
                ip_address=self._get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                request_id=request.headers.get("X-Request-ID", ""),
            )
        except Exception:  # pragma: no cover - defensive logging
            logger.exception("Failed to write API audit log")
        return response

    def _extract_request_payload(self, request) -> Dict[str, Any] | None:
        if request.method not in {"POST", "PUT", "PATCH"}:
            return None
        data = getattr(request, "data", None)
        if not data:
            try:
                body = getattr(request, "body", b"")
            except RawPostDataException:
                body = getattr(request, "_body", b"")  # body consumed elsewhere
            if not body:
                return None
            try:
                if isinstance(body, bytes):
                    decoded = body.decode() or "{}"
                else:
                    decoded = body or "{}"
                return json.loads(decoded)
            except (ValueError, UnicodeDecodeError):
                return None
        if hasattr(data, "items"):
            # For QueryDict / dict-like objects
            try:
                return {k: data[k] for k in data.keys()}
            except Exception:  # pragma: no cover - defensive
                pass
        try:
            return json.loads(json.dumps(data))
        except TypeError:
            return None

    def _extract_response_summary(self, response) -> Dict[str, Any] | None:
        payload = getattr(response, "data", None)
        if not isinstance(payload, dict):
            return None
        summary_keys = [key for key in ("code", "message", "detail", "status") if key in payload]
        if not summary_keys:
            return None
        return {key: payload[key] for key in summary_keys}

    def _get_client_ip(self, request) -> str | None:
        x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        if x_forwarded_for:
            return x_forwarded_for.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR")
