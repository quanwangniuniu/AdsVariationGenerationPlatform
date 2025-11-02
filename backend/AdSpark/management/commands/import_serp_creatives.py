import json
from datetime import datetime
from django.core.management.base import BaseCommand
from AdSpark.models import Creative, Advertiser

class Command(BaseCommand):
    help = "Import creatives from SerpAPI JSON file"

    def add_arguments(self, parser):
        parser.add_argument("json_path", type=str, help="Path to the SerpAPI JSON file")

    def handle(self, *args, **options):
        json_path = options["json_path"]

        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        ads = data.get("ad_creatives", [])
        self.stdout.write(self.style.WARNING(f"Importing {len(ads)} creatives..."))

        def parse_time(s):
            if not s:
                return datetime.now()
            try:
                return datetime.fromisoformat(s.replace("Z", "+00:00"))
            except Exception:
                return datetime.now()

        count = 0
        for ad in ads:
            adv_id = ad.get("advertiser_id")
            adv_name = ad.get("advertiser")

            advertiser, _ = Advertiser.objects.get_or_create(
                advertiser_id=adv_id,
                defaults={"name": adv_name}
            )

            Creative.objects.update_or_create(
                ad_creative_id=ad.get("ad_creative_id"),
                defaults={
                    "advertiser": advertiser,
                    "format": ad.get("format", "image"),
                    "image_url": ad.get("image") or None,
                    "video_link": ad.get("video_link") or None,
                    "width": ad.get("width") or None,
                    "height": ad.get("height") or None,
                    "target_domain": ad.get("target_domain") or None,
                    "first_shown": parse_time(ad.get("first_seen")),
                    "last_shown": parse_time(ad.get("last_seen")),
                    "details_link": ad.get("details_link") or "",
                    "region": ad.get("region") or None,
                    "platform": ad.get("platform") or None,
                }
            )
            count += 1

        self.stdout.write(self.style.SUCCESS(f" Imported {count} creatives successfully."))
