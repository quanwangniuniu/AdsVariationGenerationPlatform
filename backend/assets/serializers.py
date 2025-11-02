# apps/assets/serializers.py
from django.contrib.sessions.backends import file
from rest_framework import serializers
from django.db import models
from .models import Asset, PendingAsset
from workspace.models import WorkspacePermission
import magic
from .utils import format_file_size, generate_signed_token

class AssetSerializer(serializers.ModelSerializer):
    workspace_id = serializers.UUIDField(source="workspace.id", read_only=True)
    file_size_display = serializers.SerializerMethodField()

    class Meta:
        model = Asset
        fields = [
            "id",
            "workspace_id",
            "uploader_name",
            "file",
            "size",
            "file_size_display",
            "mime_type",
            "checksum",
            "uploaded_at",
            "is_active",
        ]
        read_only_fields = [
            "id",
            "workspace_id",
            "uploader_name",
            "file",
            "size",
            "file_size_display",
            "mime_type",
            "checksum",
            "uploaded_at",
            "is_active",
        ]

    def get_file_size_display(self, obj):
        return format_file_size(obj.size)

class AssetUploadSerializer(serializers.ModelSerializer):
    uploader_name = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = Asset
        fields = ["id", "workspace_id", "uploader_name", "file"]
        read_only_fields = ["id", "workspace_id"]

    def create(self, validated_data):
        request = self.context.get("request")
        pending = self.context.get("pending")

        workspace = validated_data.pop("workspace", None)
        user = validated_data.pop("uploader", None)
        username = validated_data.pop("uploader_name", None)

        if pending is not None:
            workspace = pending.workspace
            if pending.uploader:
                user = pending.uploader
            username = username or pending.uploader_name
        elif request and hasattr(request, "user"):
            user = request.user
            # Prefer the display name when available
            display_name = getattr(user, "get_full_name", lambda: "")()
            fallback_name = getattr(user, "get_username", lambda: "")()
            username = username or display_name or fallback_name

        if workspace is None:
            raise serializers.ValidationError({"workspace": ["This field is required."]})

        file = validated_data["file"]

        if not username:
            if user is not None:
                fallback_name = getattr(user, "get_full_name", lambda: "")() or getattr(user, "get_username", lambda: "")()
                username = fallback_name or "Unknown"
            else:
                username = "Unknown"

        asset = Asset(
            workspace=workspace,
            uploader=user,
            uploader_name=username,
            **validated_data,
        )

        asset.checksum = asset.compute_checksum()
        asset.size = file.size
        mime_type = getattr(file, "content_type", None)
        if not mime_type:
            mime_type = magic.from_buffer(file.read(2048), mime=True)
            file.seek(0)
        asset.mime_type = mime_type

        existing = Asset.objects.filter(
            workspace=asset.workspace,
            checksum=asset.checksum,
            is_active=True,
        ).first()
        if existing:
            raise serializers.ValidationError(
                {"detail": "This file already exists in the workspace. Duplicate uploads are not allowed."}
            )

        asset.save()
        return asset


class PendingAssetSerializer(serializers.ModelSerializer):
    tmp_file = serializers.FileField(
        required=True,
        help_text="choose the file for uploading"
    )
    class Meta:
        model = PendingAsset
        fields = ["id", "workspace", "uploader", "uploader_name","tmp_file","status", "scan_result"]
        read_only_fields = ["id", "workspace", "uploader", "uploader_name","tmp_file","status", "scan_result"]

    def validate_tmp_file(self, value):
        ext = value.name.split('.')[-1].lower()
        allowed_exts = ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'mov']

        # 1. Check file extension
        if ext not in allowed_exts:
            raise serializers.ValidationError("Unsupported file type")

        # 2. Check actual MIME type
        mime = magic.from_buffer(value.read(2048), mime=True)
        value.seek(0)  # Reset to the beginning after reading
        allowed_mimes = [
            "image/png", "image/jpeg", "image/webp",
            "video/mp4", "video/quicktime"
        ]
        if mime not in allowed_mimes:
            raise serializers.ValidationError(f"Suspicious file type: {mime}")

        # 3. Check file size
        if ext in ['mp4', 'mov'] and value.size > 100 * 1024 * 1024:
            raise serializers.ValidationError("Video too large (max 100MB)")
        if ext in ['png', 'jpg', 'jpeg', 'webp'] and value.size > 10 * 1024 * 1024:
            raise serializers.ValidationError("Image too large (max 10MB)")

        return value

    def validate(self, attrs):
        request = self.context["request"]
        user = request.user

        # Get workspace from URL params since it's not in attrs (it's read_only)
        workspace_id = request.parser_context['kwargs'].get('workspace_pk')
        if not workspace_id:
            raise serializers.ValidationError(
                {"workspace": ["Workspace ID is required in URL."]}
            )

        try:
            from workspace.models import Workspace
            workspace = Workspace.objects.get(pk=workspace_id)
        except Workspace.DoesNotExist:
            raise serializers.ValidationError(
                {"workspace": ["Workspace not found."]}
            )

        file = attrs["tmp_file"]

        # 1. Confirm user is a workspace member
        membership = workspace.memberships.filter(user=user, is_active=True).first()
        if not membership:
            raise serializers.ValidationError(
                {"workspace": ["You are not a member of this workspace."]}
            )

        # 2. Get workspace permissions
        try:
            perm = WorkspacePermission.objects.get(
                membership=membership
            )
        except WorkspacePermission.DoesNotExist:
            raise serializers.ValidationError(
                {"workspace": ["No workspace permission found."]}
            )

        # 3. Single file size limit (MB)
        if file.size > perm.max_upload_size_mb * 1024 * 1024:
            raise serializers.ValidationError(
                {"tmp_file": [f"File exceeds your per-file limit ({perm.max_upload_size_mb} MB)."]}
            )

        # 4. Total space limit (GB)
        used = workspace.assets.filter(is_active=True).aggregate(
            total=models.Sum("size")
        )["total"] or 0
        new_total = used + file.size
        if new_total > workspace.max_storage_gb * 1024 * 1024 * 1024:
            raise serializers.ValidationError(
                {"workspace": [f"Workspace storage limit exceeded ({workspace.max_storage_gb} GB)."]}
            )

        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        user = request.user
        file = validated_data["tmp_file"]
        pending = PendingAsset.objects.create(
            workspace=validated_data["workspace"],
            uploader=user,
            uploader_name=user.username,
            tmp_file=file,
            original_name=file.name
        )

        from .tasks import process_pending_asset
        process_pending_asset.delay(pending.id)

        return pending
