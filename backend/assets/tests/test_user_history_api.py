import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APIClient, APITestCase

from assets.models import Asset
from workspace.models import Workspace


class UserAssetHistoryViewTests(APITestCase):

    def setUp(self):
        self._temp_media = tempfile.mkdtemp()
        self.override = override_settings(MEDIA_ROOT=self._temp_media)
        self.override.enable()
        self.client = APIClient()
        User = get_user_model()
        self.user = User.objects.create_user(
            username="alice",
            email="alice@example.com",
            password="password123",
        )
        self.other_user = User.objects.create_user(
            username="bob",
            email="bob@example.com",
            password="password123",
        )
        self.workspace = Workspace.objects.create(
            name="Creative Lab",
            owner=self.user,
            plan="pro",
        )
        self.other_workspace = Workspace.objects.create(
            name="Growth Team",
            owner=self.other_user,
            plan="basic",
        )

        self.client.force_authenticate(self.user)

        self.user_asset = self._create_asset(
            workspace=self.workspace,
            uploader=self.user,
            name="campaign.png",
        )
        self.other_asset = self._create_asset(
            workspace=self.other_workspace,
            uploader=self.other_user,
            name="other.pdf",
        )

    def tearDown(self):
        self.override.disable()
        shutil.rmtree(self._temp_media, ignore_errors=True)
        super().tearDown()

    def _create_asset(self, workspace, uploader, name):
        content = b"dummy content"
        file = SimpleUploadedFile(name, content, content_type="application/octet-stream")
        return Asset.objects.create(
            workspace=workspace,
            uploader=uploader,
            uploader_name=uploader.username,
            file=file,
            size=len(content),
            mime_type="application/octet-stream",
            checksum=f"checksum-{name}",
        )

    def test_history_returns_only_current_user_assets(self):
        response = self.client.get("/api/assets/files/")
        self.assertEqual(response.status_code, 200)
        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], self.user_asset.id)

    def test_history_allows_workspace_filtering(self):
        response = self.client.get("/api/assets/files/", {"workspace_id": str(self.workspace.id)})
        self.assertEqual(response.status_code, 200)
        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["workspace_id"], str(self.workspace.id))

        response_other = self.client.get("/api/assets/files/", {"workspace_id": str(self.other_workspace.id)})
        self.assertEqual(response_other.status_code, 200)
        results_other = response_other.data.get("results", response_other.data)
        self.assertEqual(len(results_other), 0)
