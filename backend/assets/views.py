# apps/assets/views.py
from rest_framework import viewsets, permissions, status, filters
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.generics import ListAPIView
from rest_framework.decorators import action
from rest_framework.response import Response

from django.http import FileResponse
from django.utils.encoding import smart_str

from .models import Asset, PendingAsset
from .serializers import AssetSerializer, PendingAssetSerializer
from .utils import generate_signed_token, verify_signed_token
from workspace.permissions import WorkspaceResourcePermission


class UserAssetHistoryView(ListAPIView):
    """Return all active assets uploaded by the current user across workspaces."""

    serializer_class = AssetSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = (
            Asset.objects.filter(is_active=True)
            .select_related("workspace", "uploader")
            .filter(uploader=self.request.user)
            .order_by("-uploaded_at")
        )

        workspace_id = self.request.query_params.get("workspace_id")
        if workspace_id:
            qs = qs.filter(workspace_id=workspace_id)
        return qs


class AssetViewSet(viewsets.ModelViewSet):
    queryset = Asset.objects.filter(is_active=True)
    serializer_class = AssetSerializer
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = [
        "uploader_name",
        "file",
        "checksum",
        "workspace__name",
    ]

    def get_queryset(self):
        qs = Asset.objects.filter(
            workspace__memberships__user=self.request.user,
            is_active=True,
        )
        workspace_id = self.kwargs.get("workspace_pk")
        if workspace_id:
            qs = qs.filter(workspace_id=workspace_id)
        return qs

    @action(detail=True, methods=["get"])
    def get_download_url(self, request, pk=None):
        """Generate a signed download link for the asset"""
        asset = self.get_object()
        token = generate_signed_token(asset.id)
        url = f"/api/assets/{asset.id}/download/?token={token}"
        return Response({"url": url})

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        """Validate the signed token and return the file if valid"""
        token = request.query_params.get("token")
        asset_id = verify_signed_token(token)

        if not asset_id or asset_id != int(pk):
            return Response({"error": "Invalid or expired token"}, status=403)

        asset = self.get_object()
        response = FileResponse(asset.file.open("rb"), as_attachment=True)
        response["Content-Disposition"] = f'attachment; filename="{smart_str(asset.file.name)}"'
        return response

    def perform_destroy(self, instance):
        instance.soft_delete()

class AssetUploadViewSet(viewsets.ModelViewSet):
    queryset = PendingAsset.objects.all()
    serializer_class = PendingAssetSerializer
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [permissions.IsAuthenticated,WorkspaceResourcePermission]

    def create(self, request, *args, **kwargs):
        from workspace.models import Workspace

        workspace_id = self.kwargs.get("workspace_pk")
        workspace = Workspace.objects.get(pk=workspace_id)

        data = request.data.copy()
        serializer = self.get_serializer(data=data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        pending = serializer.save(workspace=workspace)

        return Response({
            "pending_id": pending.id,
            "status": pending.status,
            "scan_result": pending.scan_result,
            "message": "File uploaded successfully. Scan in progress..."
        }, status=status.HTTP_202_ACCEPTED)
