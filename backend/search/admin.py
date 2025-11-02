from django.contrib import admin

from .models import Ad, SearchHistory


@admin.register(SearchHistory)
class SearchHistoryAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "search_query",
        "status",
        "total_results",
        "search_at",
    )
    search_fields = ("search_query", "user__username", "user__email", "serpapi_search_id")
    list_filter = ("status", "search_at")
    readonly_fields = (
        "user",
        "search_query",
        "search_parameters",
        "serpapi_search_id",
        "platform_request_url",
        "raw_response",
        "status",
        "total_results",
        "search_at",
        "next_page_token",
        "next_page_url",
    )
    ordering = ("-search_at",)
    list_select_related = ("user",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(Ad)
class AdAdmin(admin.ModelAdmin):
    list_display = (
        "ad_creative_id",
        "advertiser_name",
        "ad_format",
        "search_history",
        "retrieved_at",
        "is_selected",
    )
    search_fields = ("ad_creative_id", "advertiser_name", "search_history__search_query")
    list_filter = ("ad_format", "is_selected", "retrieved_at")
    readonly_fields = (
        "search_history",
        "advertiser_id",
        "advertiser_name",
        "ad_creative_id",
        "ad_format",
        "image_url",
        "width",
        "height",
        "details_link",
        "is_selected",
        "retrieved_at",
    )
    ordering = ("-retrieved_at",)
    list_select_related = ("search_history",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
