"""Custom pagination classes for billing endpoints."""
from __future__ import annotations

from rest_framework.pagination import PageNumberPagination


class BoundedPageNumberPagination(PageNumberPagination):
    """PageNumberPagination enforcing upper bound on page size."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
