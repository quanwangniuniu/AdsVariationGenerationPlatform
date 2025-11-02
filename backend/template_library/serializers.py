from rest_framework import serializers

from .models import Template
from .services import (
    ModerationError,
    check_content_allowed,
    count_words,
    normalize_content,
)


class TemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Template
        fields = (
            "id",
            "title",
            "content",
            "word_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "word_count", "created_at", "updated_at")

    def validate_content(self, value: str) -> str:
        normalized = normalize_content(value or "")
        if not normalized:
            raise serializers.ValidationError(
                {
                    "code": "TEMPLATE_EMPTY",
                    "message": "Template content is required.",
                }
            )

        word_count = count_words(normalized)
        if word_count > 48:
            raise serializers.ValidationError(
                {
                    "code": "TEMPLATE_TOO_LONG",
                    "message": "Template must be 48 words or fewer.",
                }
            )

        try:
            check_content_allowed(normalized)
        except ModerationError as exc:
            raise serializers.ValidationError(
                {"code": exc.code, "message": exc.message}
            ) from exc

        self.context["normalized_content"] = normalized
        self.context["word_count"] = word_count
        return normalized

    def create(self, validated_data):
        request = self.context.get("request")
        owner = getattr(request, "user", None)
        if owner is None or not owner.is_authenticated:
            raise serializers.ValidationError(
                {
                    "code": "AUTH_REQUIRED",
                    "message": "Authentication required.",
                }
            )

        normalized = self.context.get("normalized_content", validated_data["content"])
        word_count = self.context.get("word_count")
        if word_count is None:
            word_count = count_words(normalized)

        template = Template.objects.create(
            owner=owner,
            title=validated_data.get("title", ""),
            content=normalized,
            word_count=word_count,
        )
        return template

    def update(self, instance, validated_data):
        if "title" in validated_data:
            instance.title = validated_data["title"]

        if "content" in validated_data:
            normalized = self.context.get("normalized_content", validated_data["content"])
            word_count = self.context.get("word_count")
            if word_count is None:
                word_count = count_words(normalized)
            instance.content = normalized
            instance.word_count = word_count

        instance.save()
        return instance

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        rep["word_count"] = instance.word_count
        return rep
