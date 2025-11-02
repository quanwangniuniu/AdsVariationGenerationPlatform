import json

from django.contrib import admin
from django.db import models
from django.urls import reverse
from django.utils import timezone
from django.utils.html import format_html

from .models import AdVariant, AdVariantFeedback, WorkspaceAdVariant


class VariantAdminMixin:
    """Shared display helpers for ad variant admin screens."""

    @admin.display(description="Variant Title")
    def variant_title_short(self, obj):
        title = getattr(obj, "variant_title", "")
        if not title:
            return "-"
        return f"{title[:47]}..." if len(title) > 50 else title

    @admin.display(description="Original Ad")
    def original_ad_link(self, obj):
        original_ad = getattr(obj, "original_ad", None)
        if original_ad:
            url = reverse("admin:AdSpark_creative_change", args=[original_ad.pk])
            advertiser = getattr(original_ad, "advertiser", None)
            advertiser_name = getattr(advertiser, "name", original_ad.pk)
            return format_html('<a href="{}">{}</a>', url, advertiser_name)
        return "-"

    @admin.display(description="User")
    def user_link(self, obj):
        user = getattr(obj, "user", None)
        if user:
            url = reverse("admin:accounts_user_change", args=[user.pk])
            return format_html('<a href="{}">{}</a>', url, user.username)
        return "-"

    @admin.display(description="Duration")
    def generation_duration_display(self, obj):
        requested = getattr(obj, "generation_requested_at", None)
        completed = getattr(obj, "generation_completed_at", None)
        if requested and completed:
            delta = completed - requested
            total_seconds = int(delta.total_seconds())
            if total_seconds < 60:
                return f"{total_seconds}s"
            if total_seconds < 3600:
                minutes, seconds = divmod(total_seconds, 60)
                return f"{minutes}m {seconds}s"
            hours, remainder = divmod(total_seconds, 3600)
            minutes = remainder // 60
            return f"{hours}h {minutes}m"
        return "-"

    @admin.display(description="AI Response Metadata")
    def ai_response_metadata_pretty(self, obj):
        metadata = getattr(obj, "ai_response_metadata", None)
        if metadata:
            return format_html(
                '<pre style="white-space: pre-wrap; font-family: monospace; font-size: 12px;">{}</pre>',
                json.dumps(metadata, indent=2),
            )
        return "-"

    @admin.display(description="Image Preview")
    def variant_image_preview(self, obj):
        image_url = getattr(obj, "variant_image_url", "")
        if image_url:
            return format_html(
                '<img src="{}" style="max-height: 200px; max-width: 300px;" />',
                image_url,
            )
        return "No image available"


@admin.register(AdVariant)
class AdVariantAdmin(VariantAdminMixin, admin.ModelAdmin):
    """Admin configuration for AdVariant model."""

    list_display = [
        "id",
        "variant_title_short",
        "original_ad_link",
        "user_link",
        "generation_status",
        "confidence_score",
        "generation_duration_display",
        "generation_requested_at",
        "feedback_count",
        "average_rating_display",
    ]

    list_filter = [
        "generation_status",
        "ai_agent_platform",
        "generation_requested_at",
        "generation_completed_at",
        ("confidence_score", admin.EmptyFieldListFilter),
        "original_ad__advertiser",
    ]

    search_fields = [
        "variant_title",
        "variant_description",
        "user__username",
        "user__email",
        "original_ad__advertiser__name",
        "ai_prompt_used",
        "token_transaction__id",
    ]

    readonly_fields = [
        "id",
        "generation_requested_at",
        "generation_completed_at",
        "generation_duration_display",
        "ai_response_metadata_pretty",
        "feedback_summary",
        "variant_image_preview",
        "token_transaction",
    ]

    fieldsets = (
        (
            "Basic Information",
            {
                "fields": (
                    "id",
                    "original_ad",
                    "user",
                    "variant_title",
                    "variant_description",
                )
            },
        ),
        (
            "AI Generation Details",
            {
                "fields": (
                    "ai_agent_platform",
                    "ai_prompt_used",
                    "ai_generation_params",
                    "generation_status",
                    "confidence_score",
                    "token_transaction",
                )
            },
        ),
        (
            "Media",
            {
                "fields": (
                    "variant_image_url",
                    "variant_image_preview",
                )
            },
        ),
        (
            "Timestamps & Metadata",
            {
                "fields": (
                    "generation_requested_at",
                    "generation_completed_at",
                    "generation_duration_display",
                    "ai_response_metadata_pretty",
                ),
                "classes": ("collapse",),
            },
        ),
        (
            "Feedback Summary",
            {
                "fields": ("feedback_summary",),
                "classes": ("collapse",),
            },
        ),
    )

    list_per_page = 25
    date_hierarchy = "generation_requested_at"
    ordering = ["-generation_requested_at"]
    list_select_related = ("original_ad", "original_ad__advertiser", "user", "token_transaction")
    raw_id_fields = ["original_ad", "user"]

    actions = ["mark_as_completed", "mark_as_failed", "recalculate_confidence_scores"]

    @admin.display(description="Feedback Count")
    def feedback_count(self, obj):
        return obj.feedbacks.count()

    @admin.display(description="Avg Rating")
    def average_rating_display(self, obj):
        ratings = obj.feedbacks.filter(rating__isnull=False).values_list("rating", flat=True)
        if ratings:
            avg_rating = sum(ratings) / len(ratings)
            stars = "⭐" * int(avg_rating)
            return f"{avg_rating:.1f} {stars}"
        return "-"

    @admin.display(description="Feedback Summary")
    def feedback_summary(self, obj):
        try:
            feedbacks = obj.feedbacks.all()
            if not feedbacks.exists():
                return format_html('<span style="color: gray;">No feedback yet</span>')

            stats = feedbacks.aggregate(
                total=models.Count("id"),
                approved=models.Count("id", filter=models.Q(is_approved=True)),
                rejected=models.Count("id", filter=models.Q(is_approved=False)),
                avg_rating=models.Avg("rating"),
            )

            total = stats["total"] or 0
            approved = stats["approved"] or 0
            rejected = stats["rejected"] or 0
            pending = total - approved - rejected
            avg_rating = stats["avg_rating"]

            summary_parts = [
                f"<strong>Total:</strong> {total}",
                f"<span style='color: green;'>✅ Approved:</span> {approved}",
                f"<span style='color: red;'>❌ Rejected:</span> {rejected}",
                f"<span style='color: orange;'>⏳ Pending:</span> {pending}",
            ]

            if avg_rating is not None:
                summary_parts.append(f"<strong>Average Rating:</strong> {avg_rating:.1f}/5")

            summary = " | ".join(summary_parts)
            return format_html(summary)

        except AttributeError:
            return format_html('<span style="color: red;">Error: Invalid object</span>')
        except Exception as exc:
            return format_html(f'<span style="color: red;">Error: {str(exc)}</span>')

    def mark_as_completed(self, request, queryset):
        updated = queryset.filter(generation_status__in=["pending", "processing"]).update(
            generation_status="completed",
            generation_completed_at=timezone.now(),
        )
        self.message_user(request, f"{updated} variants marked as completed.")

    mark_as_completed.short_description = "Mark selected variants as completed"

    def mark_as_failed(self, request, queryset):
        updated = queryset.filter(generation_status__in=["pending", "processing"]).update(
            generation_status="failed",
            generation_completed_at=timezone.now(),
        )
        self.message_user(request, f"{updated} variants marked as failed.")

    mark_as_failed.short_description = "Mark selected variants as failed"

    def recalculate_confidence_scores(self, request, queryset):
        updated = 0
        for variant in queryset:
            if variant.ai_response_metadata:
                text = variant.ai_response_metadata.get("text", "")
                variant_url = variant.ai_response_metadata.get("variant_url", "")

                score = 0.5
                if text and len(text.strip()) > 0:
                    score += 0.3
                if variant_url and variant_url.startswith("http"):
                    score += 0.2

                variant.confidence_score = min(score, 1.0)
                variant.save(update_fields=["confidence_score"])
                updated += 1

        self.message_user(request, f"Confidence scores recalculated for {updated} variants.")

    recalculate_confidence_scores.short_description = "Recalculate confidence scores"


@admin.register(WorkspaceAdVariant)
class WorkspaceAdVariantAdmin(VariantAdminMixin, admin.ModelAdmin):
    """Admin configuration for WorkspaceAdVariant model."""

    list_display = [
        "id",
        "workspace_link",
        "original_ad_link",
        "user_link",
        "generation_status",
        "confidence_score",
        "generation_duration_display",
        "generation_requested_at",
        "generation_completed_at",
    ]

    list_filter = [
        "generation_status",
        "ai_agent_platform",
        "workspace",
        "generation_requested_at",
        "generation_completed_at",
        ("confidence_score", admin.EmptyFieldListFilter),
    ]

    search_fields = [
        "variant_title",
        "variant_description",
        "workspace__name",
        "workspace__owner__username",
        "user__username",
        "user__email",
        "original_ad__advertiser__name",
    ]

    readonly_fields = [
        "generation_requested_at",
        "generation_completed_at",
        "generation_duration_display",
        "ai_response_metadata_pretty",
        "variant_image_preview",
        "token_transaction",
    ]

    fieldsets = (
        (
            "Basic Information",
            {
                "fields": (
                    "workspace",
                    "original_ad",
                    "user",
                    "variant_title",
                    "variant_description",
                )
            },
        ),
        (
            "AI Generation Details",
            {
                "fields": (
                    "ai_agent_platform",
                    "ai_prompt_used",
                    "ai_generation_params",
                    "generation_status",
                    "confidence_score",
                    "token_transaction",
                )
            },
        ),
        (
            "Media",
            {
                "fields": (
                    "variant_image_url",
                    "variant_image_preview",
                )
            },
        ),
        (
            "Timestamps & Metadata",
            {
                "fields": (
                    "generation_requested_at",
                    "generation_completed_at",
                    "generation_duration_display",
                    "ai_response_metadata_pretty",
                ),
                "classes": ("collapse",),
            },
        ),
    )

    list_per_page = 25
    date_hierarchy = "generation_requested_at"
    ordering = ["-generation_requested_at"]
    list_select_related = (
        "workspace",
        "workspace__owner",
        "original_ad",
        "original_ad__advertiser",
        "user",
        "token_transaction",
    )
    raw_id_fields = ["workspace", "original_ad", "user"]

    actions = ["mark_as_completed", "mark_as_failed"]

    @admin.display(description="Workspace")
    def workspace_link(self, obj):
        workspace = getattr(obj, "workspace", None)
        if workspace:
            url = reverse("admin:workspace_workspace_change", args=[workspace.pk])
            return format_html('<a href="{}">{}</a>', url, workspace.name)
        return "-"

    def mark_as_completed(self, request, queryset):
        updated = queryset.filter(generation_status__in=["pending", "processing"]).update(
            generation_status="completed",
            generation_completed_at=timezone.now(),
        )
        self.message_user(request, f"{updated} workspace variants marked as completed.")

    mark_as_completed.short_description = "Mark selected workspace variants as completed"

    def mark_as_failed(self, request, queryset):
        updated = queryset.filter(generation_status__in=["pending", "processing"]).update(
            generation_status="failed",
            generation_completed_at=timezone.now(),
        )
        self.message_user(request, f"{updated} workspace variants marked as failed.")

    mark_as_failed.short_description = "Mark selected workspace variants as failed"


@admin.register(AdVariantFeedback)
class AdVariantFeedbackAdmin(admin.ModelAdmin):
    """Admin configuration for AdVariantFeedback model."""

    list_display = [
        "id",
        "variant_link",
        "user_link",
        "approval_status_display",
        "rating_display",
        "feedback_text_short",
        "created_at",
        "updated_at",
    ]

    list_filter = [
        "is_approved",
        "rating",
        "created_at",
        "updated_at",
        "variant__generation_status",
        "variant__ai_agent_platform",
    ]

    search_fields = [
        "feedback_text",
        "user__username",
        "user__email",
        "variant__variant_title",
        "variant__original_ad__advertiser__name",
    ]

    readonly_fields = [
        "id",
        "created_at",
        "updated_at",
        "feedback_details_pretty",
    ]

    fieldsets = (
        (
            "Basic Information",
            {
                "fields": (
                    "id",
                    "variant",
                    "user",
                    "is_approved",
                    "rating",
                )
            },
        ),
        (
            "Feedback Content",
            {
                "fields": (
                    "feedback_text",
                    "feedback_details",
                    "feedback_details_pretty",
                )
            },
        ),
        (
            "Timestamps",
            {
                "fields": (
                    "created_at",
                    "updated_at",
                ),
                "classes": ("collapse",),
            },
        ),
    )

    list_per_page = 25
    date_hierarchy = "created_at"
    ordering = ["-created_at"]
    raw_id_fields = ["variant", "user"]
    list_select_related = ("variant", "variant__user", "user")

    actions = ["approve_feedback", "reject_feedback", "clear_approval_status"]

    @admin.display(description="Variant")
    def variant_link(self, obj):
        variant = getattr(obj, "variant", None)
        if variant:
            url = reverse("admin:ai_agent_advariant_change", args=[variant.pk])
            title = variant.variant_title or "-"
            if len(title) > 30:
                title = f"{title[:27]}..."
            return format_html('<a href="{}">{}</a>', url, title)
        return "-"

    @admin.display(description="User")
    def user_link(self, obj):
        user = getattr(obj, "user", None)
        if user:
            url = reverse("admin:accounts_user_change", args=[user.pk])
            return format_html('<a href="{}">{}</a>', url, user.username)
        return "-"

    @admin.display(description="Status")
    def approval_status_display(self, obj):
        if obj.is_approved is True:
            return format_html('<span style="color: green;">✅ Approved</span>')
        if obj.is_approved is False:
            return format_html('<span style="color: red;">❌ Rejected</span>')
        return format_html('<span style="color: orange;">⏳ Pending</span>')

    @admin.display(description="Rating")
    def rating_display(self, obj):
        if obj.rating:
            stars = "⭐" * obj.rating
            return f"{obj.rating}/5 {stars}"
        return "-"

    @admin.display(description="Feedback Text")
    def feedback_text_short(self, obj):
        text = getattr(obj, "feedback_text", "")
        if text:
            return f"{text[:97]}..." if len(text) > 100 else text
        return "-"

    @admin.display(description="Feedback Details (JSON)")
    def feedback_details_pretty(self, obj):
        details = getattr(obj, "feedback_details", None)
        if details:
            return format_html(
                '<pre style="white-space: pre-wrap; font-family: monospace; font-size: 12px;">{}</pre>',
                json.dumps(details, indent=2),
            )
        return "-"

    def approve_feedback(self, request, queryset):
        updated = queryset.update(is_approved=True)
        self.message_user(request, f"{updated} feedback entries approved.")

    approve_feedback.short_description = "Approve selected feedback"

    def reject_feedback(self, request, queryset):
        updated = queryset.update(is_approved=False)
        self.message_user(request, f"{updated} feedback entries rejected.")

    reject_feedback.short_description = "Reject selected feedback"

    def clear_approval_status(self, request, queryset):
        updated = queryset.update(is_approved=None)
        self.message_user(request, f"{updated} feedback entries set to pending.")

    clear_approval_status.short_description = "Set selected feedback to pending"


admin.site.site_header = "Ad Variant Management System"
admin.site.site_title = "Ad Variant Admin"
admin.site.index_title = "Welcome to Ad Variant Administration"
