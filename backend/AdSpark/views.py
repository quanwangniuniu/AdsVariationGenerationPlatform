from django.shortcuts import render
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Count, Q, F, Avg
from django.utils import timezone
from datetime import timedelta
from .models import Advertiser, Creative, Watch, UserCreativeTitle
from .serializers import (
    AdvertiserSerializer, CreativeSerializer, CreativeListSerializer,
    WatchSerializer, TimelineInsightSerializer, SizeInsightSerializer,
    CreativeFilter, UserCreativeTitleSerializer
)


class AdvertiserViewSet(viewsets.ModelViewSet):
    """ViewSet for Advertiser model"""
    queryset = Advertiser.objects.all().prefetch_related('creatives')
    serializer_class = AdvertiserSerializer
    permission_classes = [AllowAny]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['advertiser_id']
    search_fields = ['name']
    ordering_fields = ['name', 'first_seen_at', 'last_seen_at', 'created_at']
    ordering = ['-created_at']
    
    @action(detail=True, methods=['get'])
    def creatives(self, request, pk=None):
        """Get creatives for a specific advertiser"""
        advertiser = self.get_object()
        creatives = advertiser.creatives.all().select_related('advertiser')
        
        # Apply filters
        filterset = CreativeFilter(request.GET, queryset=creatives)
        filtered_creatives = filterset.qs
        
        # Apply pagination
        page = self.paginate_queryset(filtered_creatives)
        if page is not None:
            serializer = CreativeListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = CreativeListSerializer(filtered_creatives, many=True)
        return Response(serializer.data)


class CreativeViewSet(viewsets.ModelViewSet):
    """ViewSet for Creative model"""
    queryset = Creative.objects.all().select_related('advertiser')
    serializer_class = CreativeSerializer
    permission_classes = [AllowAny]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = CreativeFilter
    search_fields = [
        'advertiser__name',
        'advertiser__advertiser_id',
        'target_domain',
        'format',
        'region',
        'platform',
    ]
    ordering_fields = ['first_shown', 'last_shown', 'fetched_at', 'width', 'height']
    ordering = ['-first_shown']
    
    def get_serializer_class(self):
        """Use different serializer for list view"""
        if self.action == 'list':
            return CreativeListSerializer
        return CreativeSerializer
    
    @action(detail=False, methods=['get'])
    def timeline(self, request):
        """Get timeline insights for creatives"""
        queryset = self.filter_queryset(self.get_queryset())
        
        # Get parameters
        group_by = request.query_params.get('group_by', 'day')  # day, week, month
        format_filter = request.query_params.get('format')
        platform_filter = request.query_params.get('platform')
        date_field = request.query_params.get('date_field', 'first_shown')  # first_shown or last_shown
        
        # Apply additional filters
        if format_filter:
            queryset = queryset.filter(format=format_filter)
        if platform_filter:
            queryset = queryset.filter(platform=platform_filter)
        
        # Group by date
        if group_by == 'day':
            date_trunc = 'day'
        elif group_by == 'week':
            date_trunc = 'week'
        elif group_by == 'month':
            date_trunc = 'month'
        else:
            date_trunc = 'day'
        
        # Annotate with date grouping
        if date_field == 'first_shown':
            queryset = queryset.extra(
                select={'date': f"DATE_TRUNC('{date_trunc}', first_shown)"}
            )
        else:
            queryset = queryset.extra(
                select={'date': f"DATE_TRUNC('{date_trunc}', last_shown)"}
            )
        
        # Group and count
        timeline_data = queryset.values('date').annotate(
            count=Count('ad_creative_id')
        ).order_by('date')
        
        # Serialize
        serializer = TimelineInsightSerializer(timeline_data, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def sizes(self, request):
        """Get size distribution insights for creatives"""
        queryset = self.filter_queryset(self.get_queryset())
        
        # Filter out creatives without dimensions
        queryset = queryset.filter(width__isnull=False, height__isnull=False)
        
        # Group by aspect ratio (rounded to 2 decimal places)
        size_data = queryset.extra(
            select={'aspect_ratio': 'ROUND(CAST(width AS FLOAT) / CAST(height AS FLOAT), 2)'}
        ).values('aspect_ratio', 'width', 'height').annotate(
            count=Count('ad_creative_id')
        ).order_by('-count')
        
        # Serialize
        serializer = SizeInsightSerializer(size_data, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get general statistics for creatives"""
        queryset = self.filter_queryset(self.get_queryset())

        # Basic counts
        total_creatives = queryset.count()
        total_advertisers = queryset.values('advertiser').distinct().count()

        # Format distribution
        format_distribution = queryset.values('format').annotate(
            count=Count('ad_creative_id')
        ).order_by('-count')

        # Platform distribution
        platform_distribution = queryset.values('platform').annotate(
            count=Count('ad_creative_id')
        ).order_by('-count')

        # Recent activity (last 7 days)
        week_ago = timezone.now() - timedelta(days=7)
        recent_creatives = queryset.filter(last_shown__gte=week_ago).count()

        # Average dimensions
        avg_dimensions = queryset.filter(
            width__isnull=False, height__isnull=False
        ).aggregate(
            avg_width=Avg('width'),
            avg_height=Avg('height')
        )

        stats = {
            'total_creatives': total_creatives,
            'total_advertisers': total_advertisers,
            'recent_creatives_7_days': recent_creatives,
            'format_distribution': format_distribution,
            'platform_distribution': platform_distribution,
            'average_dimensions': avg_dimensions,
        }

        return Response(stats)

    @action(detail=True, methods=['get', 'post', 'patch', 'delete'], permission_classes=[IsAuthenticated])
    def user_title(self, request, pk=None):
        """Get, set, or delete user-specific custom title for a creative"""
        creative = self.get_object()

        if request.method == 'GET':
            # Get user's custom title
            try:
                user_title = UserCreativeTitle.objects.get(user=request.user, creative=creative)
                serializer = UserCreativeTitleSerializer(user_title)
                return Response(serializer.data)
            except UserCreativeTitle.DoesNotExist:
                return Response({'custom_title': None})

        elif request.method in ['POST', 'PATCH']:
            # Set or update user's custom title
            custom_title = request.data.get('custom_title', '').strip()

            if not custom_title:
                return Response(
                    {'error': 'custom_title is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            user_title, created = UserCreativeTitle.objects.update_or_create(
                user=request.user,
                creative=creative,
                defaults={'custom_title': custom_title}
            )

            serializer = UserCreativeTitleSerializer(user_title)
            return Response(
                serializer.data,
                status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
            )

        elif request.method == 'DELETE':
            # Delete user's custom title
            try:
                user_title = UserCreativeTitle.objects.get(user=request.user, creative=creative)
                user_title.delete()
                return Response(status=status.HTTP_204_NO_CONTENT)
            except UserCreativeTitle.DoesNotExist:
                return Response(
                    {'error': 'No custom title found'},
                    status=status.HTTP_404_NOT_FOUND
                )


class WatchViewSet(viewsets.ModelViewSet):
    """ViewSet for Watch model"""
    queryset = Watch.objects.all()
    serializer_class = WatchSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active', 'political_ads', 'platform', 'creative_format']
    search_fields = ['name', 'advertiser_ids', 'text']
    ordering_fields = ['name', 'created_at', 'updated_at']
    ordering = ['-created_at']

    def get_queryset(self):
        # limit to current signed account
        queryset = Watch.objects.filter(user=self.request.user)
        return queryset

    # when Watch creating, to avoid empty user_id
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


    @action(detail=True, methods=['post'])
    def trigger(self, request, pk=None):
        """Trigger a watch to fetch new creatives"""
        from .tasks import process_watch_task
        
        watch = self.get_object()
        if not watch.is_active:
            return Response(
                {'error': 'Watch is not active'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Trigger the task
        task = process_watch_task.delay(watch.id)
        
        return Response({
            'message': 'Watch triggered successfully',
            'task_id': task.id
        })
    
    @action(detail=False, methods=['post'])
    def trigger_all(self, request):
        """Trigger all active watches"""
        from .tasks import process_all_active_watches_task
        
        task = process_all_active_watches_task.delay()
        
        return Response({
            'message': 'All active watches triggered successfully',
            'task_id': task.id
        })
