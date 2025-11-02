from rest_framework import status, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from django.utils import timezone
from django.db import transaction, models
from django.shortcuts import get_object_or_404
from django.db.models import Count, Avg, Q
import logging

from .models import AdVariant, AdVariantFeedback, WorkspaceAdVariant
from .serializers import (
    AdVariantSerializer,
    AdVariantCreateSerializer,
    WorkspaceAdVariantSerializer,
    WorkspaceAdVariantListSerializer,
    WorkspaceAdVariantCreateSerializer,
    WorkspaceAdVariantUpdateSerializer,
    AdVariantFeedbackSerializer,
    AdVariantFeedbackCreateSerializer,
    AdVariantListSerializer,
    AdVariantUpdateSerializer,
)
from AdSpark.models import Creative
from workspace.models import Workspace
from .tasks import generate_ad_variant_async, generate_workspace_ad_variant_async
from celery.result import AsyncResult
from django.conf import settings
from billing.models import TokenAccount
from billing.services.product_catalog import get_token_products
from billing.services.token_ledger import consume as consume_tokens
from billing.services.token_ledger import InsufficientTokenBalance
# Configure logging
logger = logging.getLogger(__name__)


class AdVariantViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing AdVariant instances

    Provides:
    - list: GET /ad-variants/ - List all variants for authenticated user
    - create: POST /ad-variants/ - Create new variant by calling Dify API
    - retrieve: GET /ad-variants/{id}/ - Get specific variant details
    - update: PUT/PATCH /ad-variants/{id}/ - Update variant (limited fields)
    - destroy: DELETE /ad-variants/{id}/ - Delete variant

    Custom actions:
    - status: GET /ad-variants/{id}/status/ - Get generation status
    - by_original_ad: GET /ad-variants/by_original_ad/{original_ad_id}/ - List variants for specific original ad
    - user_variants: GET /ad-variants/user_variants/ - List current user's variants
    """
    permission_classes = [permissions.IsAuthenticated]
    queryset = AdVariant.objects.none()
    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'create':
            return AdVariantCreateSerializer
        elif self.action in ['list', 'by_original_ad', 'user_variants']:
            return AdVariantListSerializer
        elif self.action in ['update', 'partial_update']:
            return AdVariantUpdateSerializer
        else:
            return AdVariantSerializer

    def get_queryset(self):
        """Filter queryset: admin sees all, normal user sees only their own"""
        base = AdVariant.objects.select_related('original_ad', 'user').prefetch_related('feedbacks')

        user = self.request.user
        if user.is_staff:  # admin
            return base
        return base.filter(user=user)  # user

    def list(self, request, *args, **kwargs):
        """
        List ad variants for the current user with optional filtering.
        Supports:
          - generation_status: single status or comma-separated list.
          - search: fuzzy search across title, description, advertiser, platform, original ad id.
          - ordering: comma-separated fields (prefix with '-' for descending).
          - page / page_size: standard pagination controls.
        """
        queryset = self.get_queryset()

        status_param = request.query_params.get('generation_status')
        if status_param:
            statuses = [
                status.strip().lower()
                for status in status_param.split(',')
                if status.strip()
            ]
            valid_statuses = {'pending', 'processing', 'completed', 'failed'}
            filtered_statuses = [
                status for status in statuses if status in valid_statuses
            ]
            if filtered_statuses:
                queryset = queryset.filter(generation_status__in=filtered_statuses)

        search_query = request.query_params.get('search')
        if search_query:
            trimmed = search_query.strip()
            if trimmed:
                queryset = queryset.filter(
                    Q(variant_title__icontains=trimmed)
                    | Q(variant_description__icontains=trimmed)
                    | Q(original_ad__advertiser__name__icontains=trimmed)
                    | Q(original_ad__ad_creative_id__icontains=trimmed)
                    | Q(ai_agent_platform__icontains=trimmed)
                )

        ordering_params = request.query_params.get('ordering')
        allowed_ordering = {
            'generation_requested_at',
            'generation_completed_at',
            'variant_title',
            'ai_agent_platform',
            'confidence_score',
        }
        if ordering_params:
            requested_fields = [
                field.strip() for field in ordering_params.split(',') if field.strip()
            ]
            sanitized_fields = []
            for field in requested_fields:
                raw = field.lstrip('-')
                if raw in allowed_ordering:
                    sanitized_fields.append(field)
            if sanitized_fields:
                queryset = queryset.order_by(*sanitized_fields)
            else:
                queryset = queryset.order_by('-generation_requested_at')
        else:
            queryset = queryset.order_by('-generation_requested_at')

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        """
        Create a new ad variant (asynchronous version)
        """
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": "Invalid input data", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        validated_data = serializer.validated_data
        original_ad_id = validated_data['original_ad_id']
        prompt = validated_data['prompt']
        ai_agent_platform = validated_data['ai_agent_platform']

        try:
            # Retrieve the original ad
            original_ad = get_object_or_404(Creative, ad_creative_id=original_ad_id)

            # Check if the original ad has an image URL
            if not original_ad.image_url:
                return Response(
                    {"error": "Original ad does not have an image URL"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            token_account, _ = TokenAccount.objects.get_or_create(user=request.user)
            required_tokens = settings.DEFAULT_TOKENS_PER_GENERATION

            try:
                with transaction.atomic():
                    ad_variant = AdVariant.objects.create(
                        original_ad=original_ad,
                        user=request.user,
                        variant_title=f"Variant for {original_ad.advertiser.name}",
                        variant_description="AI-generated variant",
                        variant_image_url="",  # Will be updated after API call
                        ai_generation_params={
                            "original_image_url": original_ad.image_url,
                            "user_prompt": prompt
                        },
                        ai_agent_platform=ai_agent_platform,
                        generation_status='pending',
                        ai_prompt_used=prompt,
                        ai_response_metadata={},
                        generation_requested_at=timezone.now(),
                    )

                    consumption = consume_tokens(
                        token_account,
                        required_tokens,
                        description=f"AdVariant {ad_variant.id} generation",
                    )

                    ad_variant.token_transaction = consumption.transaction
                    ad_variant.save(update_fields=["token_transaction"])

            except InsufficientTokenBalance:
                token_account.refresh_from_db(fields=["balance"])
                return Response(
                    {
                        "error": "insufficient_tokens",
                        "detail": "Not enough tokens to start generation.",
                        "required_tokens": required_tokens,
                        "current_balance": token_account.balance,
                        "top_up_products": [
                            {
                                "key": product.key,
                                "tokens": product.tokens,
                                "unit_amount": product.unit_amount,
                                "currency": product.currency,
                            }
                            for product in get_token_products()
                        ],
                    },
                    status=status.HTTP_402_PAYMENT_REQUIRED,
                )

            # Launch the asynchronous task
            task = generate_ad_variant_async.delay(
                variant_id=ad_variant.id,
                original_ad_id=original_ad_id,
                prompt=prompt,
                user_id=request.user.id
            )

            logger.info(f"Asynchronous task {task.id} started for ad variant {ad_variant.id}")

            response_serializer = AdVariantSerializer(ad_variant)
            return Response(
                {
                    "message": "Ad variant creation started. Check status for progress.",
                    "variant": response_serializer.data,
                    "task_id": task.id,
                    "status": "pending"
                },
                status=status.HTTP_202_ACCEPTED
            )

        except Exception as e:
            logger.error(f"Unexpected error occurred while creating ad variant: {str(e)}")
            return Response(
                {"error": "Unexpected error occurred", "details": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get'])
    def task_status(self, request, pk=None):
        """
        Retrieve detailed status of an ad variant generation task
        """
        try:
            variant = self.get_object()

            # Basic variant status
            response_data = {
                "variant_id": variant.id,
                "generation_status": variant.generation_status,
                "requested_at": variant.generation_requested_at,
                "completed_at": variant.generation_completed_at,
                "confidence_score": variant.confidence_score,
            }

            # If a task ID exists, retrieve Celery task status
            if hasattr(variant, 'task_id') and variant.task_id:
                task_result = AsyncResult(variant.task_id)
                response_data.update({
                    "task_id": variant.task_id,
                    "task_state": task_result.state,
                    "task_info": task_result.info if task_result.info else None,
                })

            return Response(response_data)

        except Exception as e:
            return Response(
                {"error": "Failed to retrieve task status", "details": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'])
    def pending_variants(self, request):
        """
        Retrieve all pending ad variants for the current user
        """
        pending_variants = self.get_queryset().filter(
            user=request.user,
            generation_status__in=['pending', 'processing']
        )

        serializer = self.get_serializer(pending_variants, many=True)

        return Response({
            "user": request.user.username,
            "pending_count": pending_variants.count(),
            "variants": serializer.data
        })

    def update(self, request, *args, **kwargs):
        """
        Update ad variant (only variant_title & variant_description are editable).
        Uses AdVariantUpdateSerializer.
        """
        return super().update(request, *args, **kwargs)

    @action(detail=True, methods=['get'])
    def status(self, request, pk=None):
        """
        Get the status of an ad variant generation process
        """
        try:
            variant = self.get_object()

            return Response({
                "variant_id": variant.id,
                "status": variant.generation_status,
                "requested_at": variant.generation_requested_at,
                "completed_at": variant.generation_completed_at,
                "confidence_score": variant.confidence_score,
            })

        except Exception as e:
            return Response(
                {"error": "Failed to retrieve variant status", "details": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'], url_path='by-original-ad/(?P<original_ad_id>[^/.]+)')
    def by_original_ad(self, request, original_ad_id=None):
        """
        List all ad variants for a specific original ad
        """
        try:
            # Verify that the original ad exists
            original_ad = get_object_or_404(Creative, ad_creative_id=original_ad_id)

            queryset = AdVariant.objects.filter(original_ad=original_ad)
            serializer = self.get_serializer(queryset, many=True)

            return Response({
                "original_ad_id": original_ad_id,
                "original_ad_title": original_ad.advertiser.name,
                "variants": serializer.data
            })

        except Creative.DoesNotExist:
            return Response(
                {"error": "Original ad not found"},
                status=status.HTTP_404_NOT_FOUND
            )

    @action(detail=False, methods=['get'])
    def user_variants(self, request):
        """
        List all ad variants created by the current user
        """
        queryset = AdVariant.objects.filter(user=request.user)
        serializer = self.get_serializer(queryset, many=True)

        return Response({
            "user": request.user.username,
            "total_variants": queryset.count(),
            "variants": serializer.data
        })

class WorkspaceAdVariantViewSet(viewsets.ModelViewSet):
    """Workspace-scoped ad variant management with token consumption."""

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = WorkspaceAdVariantSerializer
    queryset = WorkspaceAdVariant.objects.none()

    permission_required_map = {
        'list': 'can_view_library',
        'retrieve': 'can_view_library',
        'status': 'can_view_library',
        'by_original_ad': 'can_view_library',
        'create': 'can_generate_variants',
        'update': 'can_edit_variants',
        'partial_update': 'can_edit_variants',
        'destroy': 'can_edit_variants',
    }

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self.get_workspace()
        action = getattr(self, 'action', None)
        if action is None:
            return
        self._enforce_action_permission()

    def get_workspace(self):
        if not hasattr(self, '_workspace_cache'):
            self._workspace_cache = get_object_or_404(Workspace, pk=self.kwargs['workspace_id'])
        return self._workspace_cache

    def get_membership(self):
        if not hasattr(self, '_membership_cache'):
            workspace = self.get_workspace()
            membership = (
                workspace.memberships.select_related('permissions')
                .filter(user=self.request.user, is_active=True)
                .first()
            )
            if membership is None:
                raise PermissionDenied("You must be a member of this workspace to access variants.")
            self._membership_cache = membership
        return self._membership_cache

    def _enforce_action_permission(self):
        membership = self.get_membership()
        required = self.permission_required_map.get(self.action)
        if required and not membership.has_permission(required):
            raise PermissionDenied("You do not have permission to perform this action in this workspace.")

    def _top_up_products(self):
        return [
            {
                "key": product.key,
                "tokens": product.tokens,
                "unit_amount": product.unit_amount,
                "currency": product.currency,
            }
            for product in get_token_products()
        ]

    def _insufficient_tokens_response(self, required_tokens, current_balance, detail=None):
        return Response(
            {
                "error": "insufficient_tokens",
                "detail": detail or "Not enough tokens to start generation.",
                "required_tokens": required_tokens,
                "current_balance": current_balance,
                "top_up_products": self._top_up_products(),
            },
            status=status.HTTP_402_PAYMENT_REQUIRED,
        )

    def get_queryset(self):
        workspace = self.get_workspace()
        return (
            WorkspaceAdVariant.objects
            .filter(workspace=workspace)
            .select_related('original_ad__advertiser', 'user', 'token_transaction')
            .order_by('-generation_requested_at')
        )

    def get_serializer_class(self):
        if self.action == 'create':
            return WorkspaceAdVariantCreateSerializer
        if self.action == 'list':
            return WorkspaceAdVariantListSerializer
        if self.action in {'update', 'partial_update'}:
            return WorkspaceAdVariantUpdateSerializer
        return WorkspaceAdVariantSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['workspace'] = self.get_workspace()
        return context

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        workspace = self.get_workspace()
        validated = serializer.validated_data

        original_ad = get_object_or_404(
            Creative,
            ad_creative_id=validated['original_ad_id'],
        )
        if not original_ad.image_url:
            return Response(
                {
                    "error": "original_ad_missing_image",
                    "detail": "Original ad does not have an image URL.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        required_tokens = settings.DEFAULT_TOKENS_PER_GENERATION

        try:
            token_account = workspace.token_account
        except TokenAccount.DoesNotExist:
            return self._insufficient_tokens_response(
                required_tokens,
                0,
                detail="Workspace token account is not provisioned or has insufficient tokens.",
            )

        try:
            with transaction.atomic():
                consumption = consume_tokens(
                    token_account,
                    required_tokens,
                    description="Workspace AdVariant generation",
                )

                variant = WorkspaceAdVariant.objects.create(
                    original_ad=original_ad,
                    workspace=workspace,
                    user=request.user,
                    variant_title=f"Variant for {original_ad.advertiser.name}",
                    variant_description="AI-generated variant",
                    variant_image_url="",
                    ai_generation_params={
                        "original_image_url": original_ad.image_url,
                        "user_prompt": validated['prompt'],
                        "workspace_id": str(workspace.id),
                    },
                    ai_agent_platform=validated['ai_agent_platform'],
                    generation_status='pending',
                    ai_prompt_used=validated['prompt'],
                    ai_response_metadata={},
                    token_transaction=consumption.transaction,
                )
        except InsufficientTokenBalance:
            token_account.refresh_from_db(fields=['balance'])
            return self._insufficient_tokens_response(required_tokens, token_account.balance)

        task = generate_workspace_ad_variant_async.delay(
            variant_id=variant.id,
            original_ad_id=original_ad.ad_creative_id,
            prompt=validated['prompt'],
            workspace_id=str(workspace.id),
            user_id=request.user.id,
        )

        response_payload = {
            "message": "Workspace variant generation started.",
            "variant": WorkspaceAdVariantSerializer(
                variant,
                context=self.get_serializer_context(),
            ).data,
            "task_id": task.id,
            "status": "pending",
        }
        return Response(response_payload, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        data = WorkspaceAdVariantSerializer(
            instance,
            context=self.get_serializer_context(),
        ).data
        return Response(data)

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    @action(detail=True, methods=['get'])
    def status(self, request, workspace_id=None, pk=None):
        variant = self.get_object()
        return Response(
            {
                "variant_id": variant.id,
                "generation_status": variant.generation_status,
                "requested_at": variant.generation_requested_at,
                "completed_at": variant.generation_completed_at,
                "confidence_score": variant.confidence_score,
            }
        )

    @action(detail=False, methods=['get'], url_path='by-original-ad/(?P<original_ad_id>[^/.]+)')
    def by_original_ad(self, request, workspace_id=None, original_ad_id=None):
        original_ad = get_object_or_404(Creative, ad_creative_id=original_ad_id)
        variants = self.get_queryset().filter(original_ad=original_ad)
        serializer = WorkspaceAdVariantListSerializer(
            variants,
            many=True,
            context=self.get_serializer_context(),
        )
        return Response(
            {
                "original_ad_id": original_ad_id,
                "original_ad_title": original_ad.advertiser.name,
                "variants": serializer.data,
            }
        )


class AdVariantFeedbackViewSet(viewsets.ModelViewSet):

    """
    ViewSet for managing AdVariantFeedback instances

    Provides:
    - list: GET /ad-variant-feedback/ - List all feedback (filtered by user)
    - create: POST /ad-variant-feedback/ - Create or update feedback for a variant
    - retrieve: GET /ad-variant-feedback/{id}/ - Get specific feedback details
    - update: PUT/PATCH /ad-variant-feedback/{id}/ - Update feedback
    - destroy: DELETE /ad-variant-feedback/{id}/ - Delete feedback

    Custom actions:
    - by_variant: GET /ad-variant-feedback/by_variant/{variant_id}/ - List feedback for specific variant
    - user_feedback: GET /ad-variant-feedback/user_feedback/ - List current user's feedback
    """
    queryset = AdVariantFeedback.objects.none()
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'create':
            return AdVariantFeedbackCreateSerializer
        else:
            return AdVariantFeedbackSerializer

    def get_queryset(self):
        """Filter queryset to show only user's own feedback by default"""
        return AdVariantFeedback.objects.filter(user=self.request.user).select_related('variant', 'user')

    def create(self, request, *args, **kwargs):
        """
        Create or update feedback for an ad variant
        """
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": "Invalid feedback data", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        validated_data = serializer.validated_data
        variant_id = validated_data['variant_id']

        try:
            variant = get_object_or_404(AdVariant, id=variant_id)

            if not request.user.is_staff and variant.user_id != request.user.id:
                return Response({"error": "You cannot feedback on this variant."},
                                status=status.HTTP_403_FORBIDDEN)

            # Check if feedback already exists for this user and variant
            existing_feedback = AdVariantFeedback.objects.filter(
                variant=variant,
                user=request.user
            ).first()

            if existing_feedback:
                # Update existing feedback
                feedback_data = {
                    'is_approved': validated_data.get('is_approved', existing_feedback.is_approved),
                    'rating': validated_data.get('rating', existing_feedback.rating),
                    'feedback_text': validated_data.get('feedback_text', existing_feedback.feedback_text),
                    'feedback_details': validated_data.get('feedback_details', existing_feedback.feedback_details),
                }

                feedback_serializer = AdVariantFeedbackSerializer(
                    existing_feedback,
                    data=feedback_data,
                    partial=True
                )

                if feedback_serializer.is_valid():
                    feedback_serializer.save()
                    return Response(
                        {
                            "message": "Feedback updated successfully",
                            "feedback": feedback_serializer.data
                        },
                        status=status.HTTP_200_OK
                    )
                else:
                    return Response(
                        {"error": "Invalid feedback data", "details": feedback_serializer.errors},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            else:
                # Create new feedback
                feedback_data = {
                    'variant': variant.id,
                    'user': request.user.id,
                    'is_approved': validated_data.get('is_approved'),
                    'rating': validated_data.get('rating'),
                    'feedback_text': validated_data.get('feedback_text'),
                    'feedback_details': validated_data.get('feedback_details'),
                }

                feedback_serializer = AdVariantFeedbackSerializer(data=feedback_data)

                if feedback_serializer.is_valid():
                    feedback_serializer.save()
                    return Response(
                        {
                            "message": "Feedback created successfully",
                            "feedback": feedback_serializer.data
                        },
                        status=status.HTTP_201_CREATED
                    )
                else:
                    return Response(
                        {"error": "Invalid feedback data", "details": feedback_serializer.errors},
                        status=status.HTTP_400_BAD_REQUEST
                    )

        except Exception as e:
            logger.error(f"Unexpected error in feedback creation: {str(e)}")
            return Response(
                {"error": "Unexpected error occurred", "details": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'], url_path='by-variant/(?P<variant_id>[^/.]+)')
    def by_variant(self, request, variant_id=None):
        """
        List all feedback for a specific ad variant
        """
        try:
            # Verify that the variant exists
            variant = get_object_or_404(AdVariant, id=variant_id)

            queryset = AdVariantFeedback.objects.filter(variant=variant).select_related('user','variant')
            serializer = self.get_serializer(queryset, many=True)

            # Calculate summary statistics
            feedback_stats = queryset.aggregate(
                total_count=Count('id'),
                average_rating=Avg('rating'),
                approved_count=Count('id', filter=models.Q(is_approved=True)),
                rejected_count=Count('id', filter=models.Q(is_approved=False))
            )

            return Response({
                "variant_id": variant_id,
                "variant_title": variant.variant_title,
                "feedback_stats": {
                    "total_feedback": feedback_stats['total_count'],
                    "average_rating": round(feedback_stats['average_rating'], 2) if feedback_stats[
                        'average_rating'] else None,
                    "approved_count": feedback_stats['approved_count'],
                    "rejected_count": feedback_stats['rejected_count'],
                    "pending_count": feedback_stats['total_count'] - feedback_stats['approved_count'] - feedback_stats[
                        'rejected_count']
                },
                "feedback": serializer.data
            })

        except AdVariant.DoesNotExist:
            return Response(
                {"error": "Ad variant not found"},
                status=status.HTTP_404_NOT_FOUND
            )

    @action(detail=False, methods=['get'])
    def user_feedback(self, request):
        """
        List all feedback provided by the current user
        """
        queryset = self.get_queryset().order_by('-id')
        serializer = self.get_serializer(queryset, many=True)

        # Calculate user's feedback statistics
        feedback_stats = queryset.aggregate(
            total_count=Count('id'),
            average_rating_given=Avg('rating'),
            approved_count=Count('id', filter=models.Q(is_approved=True)),
            rejected_count=Count('id', filter=models.Q(is_approved=False))
        )

        return Response({
            "user": request.user.username,
            "feedback_stats": {
                "total_feedback_given": feedback_stats['total_count'],
                "average_rating_given": round(feedback_stats['average_rating_given'], 2) if feedback_stats[
                    'average_rating_given'] else None,
                "approved_count": feedback_stats['approved_count'],
                "rejected_count": feedback_stats['rejected_count'],
                "pending_count": feedback_stats['total_count'] - feedback_stats['approved_count'] - feedback_stats[
                    'rejected_count']
            },
            "feedback": serializer.data
        })

    def update(self, request, *args, **kwargs):
        """
        Update feedback (ensure user can only update their own feedback)
        """
        instance = self.get_object()

        # Ensure user can only update their own feedback
        if instance.user != request.user:
            return Response(
                {"error": "You can only update your own feedback"},
                status=status.HTTP_403_FORBIDDEN
            )

        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """
        Delete feedback (ensure user can only delete their own feedback)
        """
        instance = self.get_object()

        # Ensure user can only delete their own feedback
        if instance.user != request.user:
            return Response(
                {"error": "You can only delete your own feedback"},
                status=status.HTTP_403_FORBIDDEN
            )

        return super().destroy(request, *args, **kwargs)
