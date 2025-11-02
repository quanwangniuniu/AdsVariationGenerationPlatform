from rest_framework import serializers
from django_filters import rest_framework as filters
from .models import Advertiser, Creative, Watch, UserCreativeTitle
from django.db import models


class AdvertiserSerializer(serializers.ModelSerializer):
    """Serializer for Advertiser model"""
    creatives_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Advertiser
        fields = [
            'advertiser_id', 'name', 'first_seen_at', 'last_seen_at',
            'created_at', 'updated_at', 'creatives_count'
        ]
        read_only_fields = ['created_at', 'updated_at']
    
    def get_creatives_count(self, obj):
        return obj.creatives.count()


class CreativeSerializer(serializers.ModelSerializer):
    """Serializer for Creative model"""
    advertiser = AdvertiserSerializer(read_only=True)
    advertiser_id = serializers.CharField(write_only=True, required=False)
    aspect_ratio = serializers.FloatField(read_only=True)
    duration_days = serializers.IntegerField(read_only=True)
    creative_title = serializers.CharField(source='get_creative_title', read_only=True)
    user_custom_title = serializers.SerializerMethodField()

    class Meta:
        model = Creative
        fields = [
            'ad_creative_id', 'advertiser', 'advertiser_id', 'format', 'image_url',
            'video_link', 'width', 'height', 'target_domain', 'first_shown',
            'last_shown', 'details_link', 'region', 'platform', 'fetched_at',
            'created_at', 'updated_at', 'aspect_ratio', 'duration_days', 'title',
            'creative_title', 'user_custom_title'
        ]
        read_only_fields = ['fetched_at', 'created_at', 'updated_at','duration_days']

    def get_user_custom_title(self, obj):
        """Get user-specific custom title if exists"""
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            try:
                user_title = UserCreativeTitle.objects.get(user=request.user, creative=obj)
                return user_title.custom_title
            except UserCreativeTitle.DoesNotExist:
                return None
        return None


class CreativeListSerializer(serializers.ModelSerializer):
    """Simplified serializer for Creative list views"""
    advertiser_name = serializers.CharField(source='advertiser.name', read_only=True)
    aspect_ratio = serializers.FloatField(read_only=True)
    duration_days = serializers.IntegerField(read_only=True)
    creative_title = serializers.CharField(source='get_creative_title', read_only=True)
    user_custom_title = serializers.SerializerMethodField()

    class Meta:
        model = Creative
        fields = [
            'ad_creative_id', 'advertiser_name', 'format', 'platform', 'region',
            'target_domain', 'first_shown', 'last_shown', 'width', 'height',
            'aspect_ratio', 'duration_days', 'image_url', 'title', 'creative_title',
            'user_custom_title'
        ]

    def get_user_custom_title(self, obj):
        """Get user-specific custom title if exists"""
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            try:
                user_title = UserCreativeTitle.objects.get(user=request.user, creative=obj)
                return user_title.custom_title
            except UserCreativeTitle.DoesNotExist:
                return None
        return None


class WatchSerializer(serializers.ModelSerializer):
    """Serializer for Watch model"""

    class Meta:
        model = Watch
        fields = [
            'id', 'name', 'advertiser_ids', 'text', 'region', 'platform',
            'creative_format', 'political_ads', 'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class UserCreativeTitleSerializer(serializers.ModelSerializer):
    """Serializer for UserCreativeTitle model"""

    class Meta:
        model = UserCreativeTitle
        fields = ['id', 'user', 'creative', 'custom_title', 'created_at', 'updated_at']
        read_only_fields = ['user', 'created_at', 'updated_at']


class TimelineInsightSerializer(serializers.Serializer):
    """Serializer for timeline insights"""
    date = serializers.DateField()
    count = serializers.IntegerField()
    format = serializers.CharField(required=False)
    platform = serializers.CharField(required=False)


class SizeInsightSerializer(serializers.Serializer):
    """Serializer for size insights"""
    aspect_ratio = serializers.FloatField()
    count = serializers.IntegerField()
    width = serializers.IntegerField()
    height = serializers.IntegerField()


class CreativeFilter(filters.FilterSet):
    """Filter for Creative model"""
    advertiser_id = filters.CharFilter(field_name='advertiser__advertiser_id')
    advertiser_name = filters.CharFilter(field_name='advertiser__name', lookup_expr='icontains')
    q = filters.CharFilter(method='search_filter', label='Search')
    format = filters.ChoiceFilter(choices=Creative.FORMAT_CHOICES)
    platform = filters.ChoiceFilter(choices=Creative.PLATFORM_CHOICES)
    region = filters.CharFilter()
    target_domain = filters.CharFilter(lookup_expr='icontains')
    political = filters.BooleanFilter(method='political_filter')
    start = filters.DateTimeFilter(field_name='first_shown', lookup_expr='gte')
    end = filters.DateTimeFilter(field_name='last_shown', lookup_expr='lte')
    min_width = filters.NumberFilter(field_name='width', lookup_expr='gte')
    min_height = filters.NumberFilter(field_name='height', lookup_expr='gte')
    aspect_ratio = filters.NumberFilter(method='aspect_ratio_filter')
    seen_since_days = filters.NumberFilter(method='seen_since_days_filter')
    
    class Meta:
        model = Creative
        fields = [
            'advertiser_id', 'advertiser_name', 'q', 'format', 'platform', 'region',
            'target_domain', 'political', 'start', 'end', 'min_width', 'min_height',
            'aspect_ratio', 'seen_since_days'
        ]
    
    def search_filter(self, queryset, name, value):
        """Search across advertiser name and target domain"""
        return queryset.filter(
            models.Q(advertiser__name__icontains=value) |
            models.Q(target_domain__icontains=value)
        )
    
    def political_filter(self, queryset, name, value):
        """Filter for political ads (placeholder - would need additional field)"""
        # This is a placeholder - you might need to add a political field to the model
        # or implement logic based on other criteria
        return queryset
    
    def aspect_ratio_filter(self, queryset, name, value):
        """Filter by aspect ratio (approximate)"""
        # This is a simplified implementation
        # You might want to store aspect ratio as a computed field
        return queryset
    
    def seen_since_days_filter(self, queryset, name, value):
        """Filter creatives seen since X days ago"""
        from django.utils import timezone
        from datetime import timedelta
        
        cutoff_date = timezone.now() - timedelta(days=value)
        return queryset.filter(last_shown__gte=cutoff_date)
