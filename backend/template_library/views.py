import logging
from typing import Any, Dict

from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Template
from .serializers import TemplateSerializer

LOGGER = logging.getLogger(__name__)


class TemplateViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = TemplateSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Template.objects.filter(owner=self.request.user).order_by("-created_at")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except ValidationError as exc:
            error = self._extract_error(exc.detail)
            LOGGER.info(
                "Template creation rejected",
                extra={
                    "error_code": error.get("code"),
                    "user_id": getattr(request.user, "id", None),
                },
            )
            return Response(error, status=status.HTTP_400_BAD_REQUEST)

        try:
            self.perform_create(serializer)
        except Exception:  # pragma: no cover - unexpected failure path
            LOGGER.exception(
                "Template creation failed",
                extra={"error_code": "TEMPLATE_SAVE_FAILED", "user_id": getattr(request.user, "id", None)},
            )
            return Response(
                {"code": "TEMPLATE_SAVE_FAILED", "message": "Template could not be saved. Try again later."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        serializer.save()

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        try:
            serializer.is_valid(raise_exception=True)
        except ValidationError as exc:
            error = self._extract_error(exc.detail)
            LOGGER.info(
                "Template update rejected",
                extra={
                    "error_code": error.get("code"),
                    "user_id": getattr(request.user, "id", None),
                },
            )
            return Response(error, status=status.HTTP_400_BAD_REQUEST)

        try:
            self.perform_update(serializer)
        except Exception:  # pragma: no cover - unexpected failure path
            LOGGER.exception(
                "Template update failed",
                extra={"error_code": "TEMPLATE_UPDATE_FAILED", "user_id": getattr(request.user, "id", None)},
            )
            return Response(
                {"code": "TEMPLATE_UPDATE_FAILED", "message": "Template could not be updated. Try again later."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(serializer.data)

    def perform_update(self, serializer):
        serializer.save()

    @staticmethod
    def _extract_error(detail: Any) -> Dict[str, str]:
        if isinstance(detail, dict):
            if "code" in detail and "message" in detail:
                return {
                    "code": TemplateViewSet._first(detail["code"]),
                    "message": TemplateViewSet._first(detail["message"]),
                }
            # Potential nested field mapping (e.g., {"content": [{"code":..., "message":...}]})
            for value in detail.values():
                extracted = TemplateViewSet._extract_error(value)
                if extracted:
                    return extracted
        elif isinstance(detail, list) and detail:
            return TemplateViewSet._extract_error(detail[0])
        return {
            "code": "TEMPLATE_VALIDATION_FAILED",
            "message": "Template could not be validated.",
        }

    @staticmethod
    def _first(value: Any) -> str:
        if isinstance(value, list) and value:
            return TemplateViewSet._first(value[0])
        return str(value)
