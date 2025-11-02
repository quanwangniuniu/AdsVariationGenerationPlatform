from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from audit.models import ApiAccessLog


class ApiAccessLogViewSetTests(APITestCase):
    def setUp(self):
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

    def test_user_sees_only_their_logs(self):
        ApiAccessLog.objects.create(
            user=self.user,
            method="GET",
            path="/api/example/",
            action="example-list",
            status_code=200,
        )
        ApiAccessLog.objects.create(
            user=self.other_user,
            method="POST",
            path="/api/other/",
            action="other-create",
            status_code=201,
        )

        self.client.force_authenticate(self.user)
        response = self.client.get("/api/audit/logs/")

        self.assertEqual(response.status_code, 200)
        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 1)
        entry = results[0]
        self.assertEqual(entry["user"]["username"], "alice")
        self.assertEqual(entry["request_summary"], "GET • Example")
        self.assertEqual(entry["location_label"], "Example")
        self.assertEqual(entry["status_code"], 200)

    def test_staff_user_sees_all_logs(self):
        self.user.is_staff = True
        self.user.save(update_fields=["is_staff"])

        ApiAccessLog.objects.create(
            user=self.user,
            method="GET",
            path="/api/example/",
            action="example-list",
            status_code=200,
        )
        ApiAccessLog.objects.create(
            user=self.other_user,
            method="POST",
            path="/api/other/",
            action="other-create",
            status_code=201,
        )

        self.client.force_authenticate(self.user)
        response = self.client.get("/api/audit/logs/")

        self.assertEqual(response.status_code, 200)
        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 2)
        usernames = {item["user"]["username"] for item in results}
        self.assertSetEqual(usernames, {"alice", "bob"})
