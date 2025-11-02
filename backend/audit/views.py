from __future__ import annotations

from django_filters import rest_framework as filters
from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ReadOnlyModelViewSet

from .models import ApiAccessLog
from .serializers import ApiAccessLogSerializer


class ApiAccessLogFilter(filters.FilterSet):
    start = filters.IsoDateTimeFilter(field_name="timestamp", lookup_expr="gte")
    end = filters.IsoDateTimeFilter(field_name="timestamp", lookup_expr="lte")
    method = filters.CharFilter(field_name="method", lookup_expr="iexact")
    action = filters.CharFilter(field_name="action", lookup_expr="icontains")

    class Meta:
        model = ApiAccessLog
        fields = ["method", "status_code", "action", "workspace_id", "user"]


class ApiAccessLogViewSet(ReadOnlyModelViewSet):
    """Expose API access logs for authenticated users."""

    serializer_class = ApiAccessLogSerializer
    permission_classes = [IsAuthenticated]
    queryset = ApiAccessLog.objects.select_related("user").order_by("-timestamp")
    filterset_class = ApiAccessLogFilter
    filter_backends = [filters.DjangoFilterBackend]
    ordering_fields = ["timestamp", "status_code"]
    ordering = ["-timestamp"]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not user.is_staff:
            qs = qs.filter(user=user)
        return qs
