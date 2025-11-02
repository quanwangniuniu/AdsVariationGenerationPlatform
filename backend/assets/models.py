import hashlib
from django.db import models
from workspace.models import Workspace
from django.utils import timezone

def workspace_upload_path(instance, filename):
    ext = filename.split('.')[-1].lower()
    folder = 'videos' if ext in ['mp4', 'mov'] else 'images'
    return f"media/workspace_{instance.workspace.id}/{folder}/{filename}"


class Asset(models.Model):
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name="assets"
    )
    uploader = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="uploaded_files"
    )
    uploader_name = models.CharField(max_length=255)
    file = models.FileField(upload_to=workspace_upload_path)
    checksum = models.CharField(max_length=64, db_index=True)
    size = models.BigIntegerField()
    mime_type = models.CharField(max_length=50)
    metadata = models.JSONField(blank=True, null=True)

    is_active = models.BooleanField(default=True)  # soft delete
    deleted_at = models.DateTimeField(blank=True, null=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)


    class Meta:
        unique_together = ("workspace", "checksum")

    def compute_checksum(self):
        sha256 = hashlib.sha256()
        self.file.seek(0)
        for chunk in self.file.chunks():
            sha256.update(chunk)
        self.file.seek(0)
        return sha256.hexdigest()

    def soft_delete(self):
        self.is_active = False
        self.deleted_at = timezone.now()
        self.save()

class PendingAsset(models.Model):
    workspace = models.ForeignKey("workspace.Workspace", on_delete=models.CASCADE)
    uploader = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="pending_assets"
    )
    uploader_name = models.CharField(max_length=255)
    tmp_file = models.FileField(upload_to="tmp_uploads/")
    original_name = models.CharField(max_length=255)
    status = models.CharField(
        max_length=20,
        choices=[("pending", "Pending"), ("in_progress", "In Progress"), ("completed", "Completed"), ("failed", "Failed")],
        default="pending"
    )
    scan_result = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
