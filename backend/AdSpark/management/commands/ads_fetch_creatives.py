import logging
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from AdSpark.services import SerpApiService

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Fetch ad creatives from SerpApi Google Ads Transparency Center and store them in the database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--advertiser-ids',
            type=str,
            help='Comma-separated advertiser IDs to search for'
        )
        parser.add_argument(
            '--text',
            type=str,
            help='Free text or domain search (e.g., apple.com)'
        )
        parser.add_argument(
            '--region',
            type=str,
            help='Numeric region code (e.g., AU = 2036, US = 2840)'
        )
        parser.add_argument(
            '--platform',
            type=str,
            choices=['PLAY', 'MAPS', 'SEARCH', 'SHOPPING', 'YOUTUBE'],
            help='Platform to search in'
        )
        parser.add_argument(
            '--creative-format',
            type=str,
            choices=['text', 'image', 'video'],
            help='Creative format to filter by'
        )
        parser.add_argument(
            '--start-date',
            type=str,
            help='Start date in YYYYMMDD format'
        )
        parser.add_argument(
            '--end-date',
            type=str,
            help='End date in YYYYMMDD format'
        )
        parser.add_argument(
            '--political-ads',
            action='store_true',
            help='Filter for political ads only'
        )
        parser.add_argument(
            '--num',
            type=int,
            default=40,
            help='Number of results per page (default: 40, max: 100)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Fetch data without saving to database'
        )

    def handle(self, *args, **options):
        start_time = timezone.now()
        self.stdout.write(f"Starting ad creatives fetch at {start_time}")
        
        try:
            # Initialize SerpApi service
            service = SerpApiService()
            
            # Prepare parameters
            params = {
                'advertiser_ids': options.get('advertiser_ids'),
                'text': options.get('text'),
                'region': options.get('region'),
                'platform': options.get('platform'),
                'creative_format': options.get('creative_format'),
                'start_date': options.get('start_date'),
                'end_date': options.get('end_date'),
                'political_ads': options.get('political_ads'),
                'num': options.get('num'),
            }
            
            # Remove None values
            params = {k: v for k, v in params.items() if v is not None}
            
            self.stdout.write(f"Fetching creatives with parameters: {params}")
            
            # Fetch creatives from SerpApi
            creatives_data = service.fetch_creatives(**params)
            
            if not creatives_data:
                self.stdout.write(self.style.WARNING("No creatives found"))
                return
            
            self.stdout.write(f"Found {len(creatives_data)} creatives")
            
            if options.get('dry_run'):
                self.stdout.write(self.style.SUCCESS("=== DRY RUN MODE - NO DATA SAVED ==="))
                self.stdout.write(f"Found {len(creatives_data)} creatives in dry run")
                
                # Show detailed sample data for dry run
                if creatives_data:
                    self.stdout.write("\n=== SAMPLE CREATIVE DATA STRUCTURES ===")
                    for i, sample in enumerate(creatives_data[:3]):  # Show first 3
                        self.stdout.write(f"\n--- Creative #{i+1} ---")
                        self.stdout.write(f"Keys: {list(sample.keys())}")
                        self.stdout.write(f"Full data: {sample}")
                        
                        # Show specific fields
                        if 'advertiser' in sample:
                            self.stdout.write(f"Advertiser: {sample['advertiser']}")
                        if 'image' in sample:
                            self.stdout.write(f"Image URL: {sample['image']}")
                        if 'video_link' in sample:
                            self.stdout.write(f"Video link: {sample['video_link']}")
                        if 'first_shown' in sample:
                            self.stdout.write(f"First shown (epoch): {sample['first_shown']}")
                        if 'last_shown' in sample:
                            self.stdout.write(f"Last shown (epoch): {sample['last_shown']}")
                
                self.stdout.write(self.style.SUCCESS("\nDry run completed. No data saved to database."))
                return
            
            # Process and upsert creatives
            processed_count = 0
            created_count = 0
            updated_count = 0
            
            for creative_data in creatives_data:
                try:
                    # Process the creative data
                    processed_data = service.process_creative_data(creative_data)
                    
                    # Upsert to database
                    creative = service.upsert_creative(processed_data)
                    
                    processed_count += 1
                    
                    if processed_count % 10 == 0:
                        self.stdout.write(f"Processed {processed_count}/{len(creatives_data)} creatives...")
                        
                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(f"Error processing creative {creative_data.get('ad_creative_id', 'unknown')}: {e}")
                    )
                    continue
            
            end_time = timezone.now()
            duration = end_time - start_time
            
            self.stdout.write(
                self.style.SUCCESS(
                    f"Successfully processed {processed_count} creatives in {duration.total_seconds():.2f} seconds"
                )
            )
            
        except ValueError as e:
            raise CommandError(f"Configuration error: {e}")
        except Exception as e:
            raise CommandError(f"Unexpected error: {e}")
