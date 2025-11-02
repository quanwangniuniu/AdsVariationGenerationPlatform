from django.contrib import admin
from .models import Advertiser, Creative, Watch, Google_Ads_GeoId


@admin.register(Advertiser)
class AdvertiserAdmin(admin.ModelAdmin):
    list_display = ('advertiser_id', 'name', 'first_seen_at', 'last_seen_at', 'created_at')
    search_fields = ('advertiser_id', 'name')
    list_filter = ('created_at', 'updated_at')
    readonly_fields = ('created_at', 'updated_at')
    ordering = ('-created_at',)


@admin.register(Creative)
class CreativeAdmin(admin.ModelAdmin):
    list_display = ('ad_creative_id', 'advertiser', 'format', 'platform', 'region', 
                   'first_shown', 'last_shown', 'target_domain')
    list_filter = ('format', 'platform', 'region', 'first_shown', 'last_shown', 'fetched_at')
    search_fields = ('ad_creative_id', 'advertiser__name', 'target_domain')
    readonly_fields = ('created_at', 'updated_at', 'fetched_at', 'aspect_ratio', 'duration_days')
    raw_id_fields = ('advertiser',)
    date_hierarchy = 'first_shown'
    ordering = ('-first_shown',)
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('ad_creative_id', 'advertiser', 'format', 'platform', 'region')
        }),
        ('Content', {
            'fields': ('image_url', 'video_link', 'target_domain', 'details_link')
        }),
        ('Dimensions', {
            'fields': ('width', 'height', 'aspect_ratio')
        }),
        ('Timing', {
            'fields': ('first_shown', 'last_shown', 'duration_days')
        }),
        ('Metadata', {
            'fields': ('fetched_at', 'created_at', 'updated_at')
        }),
    )


@admin.register(Watch)
class WatchAdmin(admin.ModelAdmin):
    list_display = ('name', 'advertiser_ids', 'text', 'region', 'platform', 'creative_format', 
                   'political_ads', 'is_active', 'created_at')
    list_filter = ('is_active', 'political_ads', 'platform', 'creative_format', 'created_at')
    search_fields = ('name', 'advertiser_ids', 'text')
    readonly_fields = ('created_at', 'updated_at')
    ordering = ('-created_at',)


@admin.register(Google_Ads_GeoId)
class GoogleAdsGeoIdAdmin(admin.ModelAdmin):
    list_display = ('geo_id', 'country_name', 'country_code', 'tld')
    search_fields = ('geo_id', 'country_name', 'country_code')
    list_filter = ('country_code',)
    ordering = ('country_name',)
