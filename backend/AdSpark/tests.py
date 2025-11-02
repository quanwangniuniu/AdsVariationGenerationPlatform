from django.test import TestCase
from django.utils import timezone
from datetime import datetime, timezone as dt_timezone

from accounts.models import User
from create_admin import username
from .models import Advertiser, Creative, Watch


class AdvertiserModelTest(TestCase):
    def setUp(self):
        self.advertiser = Advertiser.objects.create(
            advertiser_id="AR123456789",
            name="Test Advertiser Inc.",
            first_seen_at=timezone.now(),
            last_seen_at=timezone.now()
        )

    def test_advertiser_creation(self):
        self.assertEqual(self.advertiser.advertiser_id, "AR123456789")
        self.assertEqual(self.advertiser.name, "Test Advertiser Inc.")
        self.assertIsNotNone(self.advertiser.created_at)
        self.assertIsNotNone(self.advertiser.updated_at)

    def test_advertiser_str_representation(self):
        expected_str = "Test Advertiser Inc. (AR123456789)"
        self.assertEqual(str(self.advertiser), expected_str)


class CreativeModelTest(TestCase):
    def setUp(self):
        self.advertiser, _  = Advertiser.objects.get_or_create(
            advertiser_id="AR123456789",
            name="Test Advertiser Inc."
        )
        
        self.creative, _ = Creative.objects.get_or_create(
            ad_creative_id="CR987654321",
            advertiser=self.advertiser,
            format="image",
            image_url="https://example.com/image.jpg",
            width=1200,
            height=628,
            target_domain="example.com",
            first_shown=datetime(2024, 1, 1, tzinfo=dt_timezone.utc),
            last_shown=datetime(2024, 1, 31, tzinfo=dt_timezone.utc),
            details_link="https://adstransparency.google.com/details/CR987654321",
            region="US",
            platform="SEARCH"
        )

    def test_creative_creation(self):
        self.assertEqual(self.creative.ad_creative_id, "CR987654321")
        self.assertEqual(self.creative.advertiser, self.advertiser)
        self.assertEqual(self.creative.format, "image")
        self.assertEqual(self.creative.width, 1200)
        self.assertEqual(self.creative.height, 628)
        self.assertEqual(self.creative.region, "US")
        self.assertEqual(self.creative.platform, "SEARCH")

    def test_creative_aspect_ratio(self):
        expected_ratio = 1200 / 628
        self.assertEqual(self.creative.aspect_ratio, round(expected_ratio, 2))

    def test_creative_duration_days(self):
        expected_duration = 30  # January has 31 days, so 31 - 1 = 30
        self.assertEqual(self.creative.duration_days, expected_duration)

    def test_creative_str_representation(self):
        expected_str = "CR987654321 - Test Advertiser Inc."
        self.assertEqual(str(self.creative), expected_str)


class WatchModelTest(TestCase):
    def setUp(self):
        #Create TestUser
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.watch = Watch.objects.create(
            name="Test Watch",
            user=self.user,
            advertiser_ids="AR123456789,AR987654321",
            text="test.com",
            region="US",
            platform="SEARCH",
            creative_format="image",
            political_ads=False,
            is_active=True
        )

    def test_watch_creation(self):
        self.assertEqual(self.watch.name, "Test Watch")
        self.assertEqual(self.watch.advertiser_ids, "AR123456789,AR987654321")
        self.assertEqual(self.watch.text, "test.com")
        self.assertEqual(self.watch.region, "US")
        self.assertEqual(self.watch.platform, "SEARCH")
        self.assertEqual(self.watch.creative_format, "image")
        self.assertFalse(self.watch.political_ads)
        self.assertTrue(self.watch.is_active)

    def test_watch_str_representation(self):
        self.assertEqual(str(self.watch), "Test Watch")
