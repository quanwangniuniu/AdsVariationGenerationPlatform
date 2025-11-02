from rest_framework import serializers
from .models import AdVariant, AdVariantFeedback, WorkspaceAdVariant
from AdSpark.models import Creative
from accounts.models import User



class AdVariantSerializer(serializers.ModelSerializer):
    """
    Serializer for AdVariant model
    """
    original_ad_title = serializers.CharField(source='original_ad.advertiser.name', read_only=True)
    original_ad_image = serializers.URLField(source='original_ad.image_url', read_only=True)
    user_username = serializers.CharField(source='user.username', read_only=True)
    generation_duration = serializers.SerializerMethodField()
    token_transaction_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = AdVariant
        fields = [
            'id',
            'original_ad',
            'original_ad_title',
            'original_ad_image',
            'user',
            'user_username',
            'variant_title',
            'variant_description',
            'variant_image_url',
            'ai_generation_params',
            'ai_agent_platform',
            'generation_status',
            'ai_prompt_used',
            'ai_response_metadata',
            'generation_requested_at',
            'generation_completed_at',
            'generation_duration',
            'confidence_score',
            'token_transaction_id',
        ]
        read_only_fields = [
            'id',
            'generation_requested_at',
            'generation_completed_at',
            'generation_status',
            'ai_response_metadata',
            'token_transaction_id',
        ]

    def get_generation_duration(self, obj):
        """Calculate generation duration in seconds"""
        if obj.generation_completed_at and obj.generation_requested_at:
            delta = obj.generation_completed_at - obj.generation_requested_at
            return delta.total_seconds()
        return None


class WorkspaceAdVariantSerializer(serializers.ModelSerializer):
    """Serializer for WorkspaceAdVariant model."""

    original_ad_title = serializers.CharField(source='original_ad.advertiser.name', read_only=True)
    original_ad_image = serializers.URLField(source='original_ad.image_url', read_only=True)
    workspace_id = serializers.UUIDField(source='workspace.id', read_only=True)
    requested_by = serializers.SerializerMethodField()
    generation_duration = serializers.SerializerMethodField()
    token_transaction_id = serializers.UUIDField(read_only=True, allow_null=True)

    class Meta:
        model = WorkspaceAdVariant
        fields = [
            'id',
            'workspace',
            'workspace_id',
            'original_ad',
            'original_ad_title',
            'original_ad_image',
            'user',
            'requested_by',
            'variant_title',
            'variant_description',
            'variant_image_url',
            'ai_generation_params',
            'ai_agent_platform',
            'generation_status',
            'ai_prompt_used',
            'ai_response_metadata',
            'generation_requested_at',
            'generation_completed_at',
            'generation_duration',
            'confidence_score',
            'token_transaction_id',
        ]
        read_only_fields = [
            'id',
            'workspace',
            'workspace_id',
            'user',
            'generation_requested_at',
            'generation_completed_at',
            'generation_status',
            'ai_response_metadata',
            'generation_duration',
            'token_transaction_id',
        ]

    def get_generation_duration(self, obj):
        """Calculate generation duration in seconds."""
        if obj.generation_completed_at and obj.generation_requested_at:
            delta = obj.generation_completed_at - obj.generation_requested_at
            return delta.total_seconds()
        return None

    def get_requested_by(self, obj):
        """Return the username of the requester if available."""
        return obj.user.username if obj.user else None


class WorkspaceAdVariantListSerializer(serializers.ModelSerializer):
    """Simplified serializer for listing workspace ad variants."""

    original_ad_title = serializers.CharField(source='original_ad.advertiser.name', read_only=True)
    requested_by = serializers.SerializerMethodField()

    class Meta:
        model = WorkspaceAdVariant
        fields = [
            'id',
            'original_ad',
            'original_ad_title',
            'variant_title',
            'variant_image_url',
            'generation_status',
            'generation_requested_at',
            'generation_completed_at',
            'confidence_score',
            'requested_by',
        ]

    def get_requested_by(self, obj):
        return obj.user.username if obj.user else None


class WorkspaceAdVariantCreateSerializer(serializers.Serializer):
    """Serializer for creating workspace ad variants."""

    original_ad_id = serializers.CharField(max_length=32)
    prompt = serializers.CharField(max_length=1000)
    ai_agent_platform = serializers.CharField(max_length=50, default='dify')

    def validate_original_ad_id(self, value):
        """Ensure the referenced creative exists."""
        try:
            Creative.objects.get(ad_creative_id=value)
        except Creative.DoesNotExist:
            raise serializers.ValidationError("Original ad with this ID does not exist.")
        return value

    def validate_prompt(self, value):
        """Prompt must be non-empty once trimmed."""
        trimmed = value.strip()
        if not trimmed:
            raise serializers.ValidationError("Prompt cannot be empty.")
        return trimmed


class WorkspaceAdVariantUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating workspace ad variants."""

    class Meta:
        model = WorkspaceAdVariant
        fields = ['variant_title', 'variant_description']
        extra_kwargs = {
            'variant_title': {'required': False},
            'variant_description': {'required': False},
        }


class AdVariantCreateSerializer(serializers.Serializer):
    """
    Serializer for creating ad variants
    """
    original_ad_id = serializers.CharField(max_length=32)
    prompt = serializers.CharField(max_length=1000)
    ai_agent_platform = serializers.CharField(max_length=50, default='dify')

    def validate_original_ad_id(self, value):
        """Validate that the original ad exists"""
        try:
            Creative.objects.get(ad_creative_id=value)
        except Creative.DoesNotExist:
            raise serializers.ValidationError("Original ad with this ID does not exist.")
        return value

    def validate_prompt(self, value):
        """Validate prompt is not empty"""
        if not value.strip():
            raise serializers.ValidationError("Prompt cannot be empty.")
        return value.strip()

class AdVariantUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating AdVariant (only title & description allowed).
    """

    class Meta:
        model = AdVariant
        fields = ['variant_title', 'variant_description']  # 只暴露可更新字段
        extra_kwargs = {
            'variant_title': {'required': False},  # PATCH 时可选
            'variant_description': {'required': False},
        }
class AdVariantFeedbackSerializer(serializers.ModelSerializer):
    """
    Serializer for AdVariantFeedback model
    """
    variant_title = serializers.CharField(source='variant.variant_title', read_only=True)
    user_username = serializers.CharField(source='user.username', read_only=True)
    approval_status = serializers.SerializerMethodField()

    class Meta:
        model = AdVariantFeedback
        fields = [
            'id',
            'variant',
            'variant_title',
            'user',
            'user_username',
            'is_approved',
            'rating',
            'feedback_text',
            'feedback_details',
            'approval_status',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'created_at',
            'updated_at',
        ]

    def get_approval_status(self, obj):
        """Get human-readable approval status"""
        if obj.is_approved is True:
            return "Approved"
        elif obj.is_approved is False:
            return "Rejected"
        else:
            return "Pending"

    def validate_rating(self, value):
        """Validate rating is within acceptable range"""
        if value is not None and (value < 1 or value > 5):
            raise serializers.ValidationError("Rating must be between 1 and 5.")
        return value

    def validate(self, data):
        """Validate that user hasn't already provided feedback for this variant"""
        variant = data.get('variant')
        user = data.get('user')

        if variant and user:
            # Check if this is an update (instance exists)
            if not self.instance:
                existing_feedback = AdVariantFeedback.objects.filter(
                    variant=variant,
                    user=user
                ).exists()
                if existing_feedback:
                    raise serializers.ValidationError(
                        "You have already provided feedback for this variant."
                    )

        return data


class AdVariantFeedbackCreateSerializer(serializers.Serializer):
    """
    Serializer for creating ad variant feedback
    """
    variant_id = serializers.IntegerField()
    is_approved = serializers.BooleanField(required=False, allow_null=True)
    rating = serializers.IntegerField(required=False, allow_null=True)
    feedback_text = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    feedback_details = serializers.JSONField(required=False, allow_null=True)

    def validate_variant_id(self, value):
        """Validate that the variant exists"""
        try:
            AdVariant.objects.get(id=value)
        except AdVariant.DoesNotExist:
            raise serializers.ValidationError("Ad variant with this ID does not exist.")
        return value

    def validate_rating(self, value):
        """Validate rating is within acceptable range"""
        if value is not None and (value < 1 or value > 5):
            raise serializers.ValidationError("Rating must be between 1 and 5.")
        return value

    def validate(self, data):
        """Validate that at least one feedback field is provided"""
        feedback_fields = ['is_approved', 'rating', 'feedback_text', 'feedback_details']
        if not any(data.get(field) is not None for field in feedback_fields):
            raise serializers.ValidationError(
                "At least one feedback field (is_approved, rating, feedback_text, or feedback_details) must be provided."
            )
        return data


class AdVariantListSerializer(serializers.ModelSerializer):
    """
    Simplified serializer for listing ad variants
    """
    original_ad_title = serializers.CharField(source='original_ad.advertiser.name', read_only=True)
    user_username = serializers.CharField(source='user.username', read_only=True)
    feedback_count = serializers.SerializerMethodField()
    average_rating = serializers.SerializerMethodField()

    class Meta:
        model = AdVariant
        fields = [
            'id',
            'original_ad',
            'original_ad_title',
            'user_username',
            'variant_title',
            'variant_description',
            'variant_image_url',
            'ai_agent_platform',
            'generation_status',
            'generation_requested_at',
            'generation_completed_at',
            'confidence_score',
            'feedback_count',
            'average_rating',
        ]

    def get_feedback_count(self, obj):
        """Get total number of feedbacks for this variant"""
        return obj.feedbacks.count()

    def get_average_rating(self, obj):
        """Calculate average rating for this variant"""
        ratings = obj.feedbacks.filter(rating__isnull=False).values_list('rating', flat=True)
        if ratings:
            return round(sum(ratings) / len(ratings), 2)
        return None
