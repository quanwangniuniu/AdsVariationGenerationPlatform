import os
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from django.conf import settings
from serpapi import GoogleSearch
from .models import Advertiser, Creative
from .text_to_domain import keyword_to_domain,keyword_to_domain_with_region
from dotenv import load_dotenv
from pathlib import Path

#load .env
current_file = Path(__file__)
backend_dir = current_file.parent.parent
env_path = backend_dir.parent / '.env'

load_dotenv(env_path)

logger = logging.getLogger(__name__)

class SerpApiService:
    """Service for interacting with SerpApi Google Ads Transparency Center API"""
    
    BASE_URL = "https://serpapi.com/search"
    ENGINE = "google_ads_transparency_center"
    
    def __init__(self):
        self.api_key = os.getenv('SERP_API_KEY')
        if not self.api_key:
            raise ValueError("SerpApiKey environment variable is required")

        # Supported region codes for SerpAPI Google Ads Transparency Center
        self.supported_regions = {
            '2840': 'United States',
            '2036': 'Australia', 
            '124': 'Canada',
            '826': 'United Kingdom',
            '276': 'Germany',
            '250': 'France',
            '380': 'Italy',
            '724': 'Spain',
            '392': 'Japan',
            '410': 'South Korea',
            '356': 'India',
            '076': 'Brazil',
            '484': 'Mexico'
        }

    def validate_region(self, region: str) -> bool:
        """Validate if the region code is supported by SerpAPI"""
        if not region:
            return True
        return region in self.supported_regions

    def fetch_creatives(self, 
                       advertiser_ids: Optional[str] = None,
                       text: Optional[str] = None,
                       region: Optional[str] = None,
                       platform: Optional[str] = None,
                       creative_format: Optional[str] = None,
                       start_date: Optional[str] = None,
                       end_date: Optional[str] = None,
                       political_ads: Optional[bool] = None,
                       num: int = 40,max_pages: Optional[int] = 0) -> List[Dict[str, Any]]:
        """
        Fetch creatives from SerpApi with pagination support
        
        Args:
            advertiser_ids: Comma-separated advertiser IDs
            text: Free text or domain search
            region: Numeric region code (e.g., AU = 2036, US = 2840)
            platform: PLAY, MAPS, SEARCH, SHOPPING, YOUTUBE
            creative_format: text, image, or video
            start_date: YYYYMMDD format
            end_date: YYYYMMDD format
            political_ads: True/false for political ads filter
            num: Results per page (default 40, max 100)
        
        Returns:
            List of creative data dictionaries
        """
        # Validate region if provided
        if region and not self.validate_region(region):
            supported_regions = ', '.join([f"{code} ({name})" for code, name in self.supported_regions.items()])
            raise ValueError(f"Unsupported region '{region}'. Supported regions: {supported_regions}")
        
        all_creatives = []
        next_page_token = None
        page_count = 0
        while True:
            params = {
                'engine': 'google_ads_transparency_center',
                'api_key': self.api_key,
                'num': min(num, 100),  # Ensure we don't exceed max
            }

            # Add optional parameters
            if advertiser_ids:
                params['advertiser_id'] = advertiser_ids
            #Changed for covert to domain
            if text:
                if advertiser_ids:
                    params['text'] = text
                else:
                    if region:
                        domain_text = keyword_to_domain_with_region(text,region)
                    else:
                        domain_text = keyword_to_domain(text)

                    if domain_text:
                        params['text'] = domain_text
            if region:
                params['region'] = region
            if platform:
                params['platform'] = platform
            if creative_format:
                params['creative_format'] = creative_format
            if start_date:
                params['start_date'] = start_date
            if end_date:
                params['end_date'] = end_date
            if political_ads is not None:
                params['political_ads'] = 'true' if political_ads else 'false'
            if next_page_token:
                params['next_page_token'] = next_page_token
            
            try:
                if not text and not advertiser_ids:
                    error_msg = "Either 'text' or 'advertiser_ids' must be provided."
                    logger.error(error_msg)
                    raise ValueError(error_msg)
                search = GoogleSearch(params)
                results = search.get_dict()
                
                # Log raw SerpAPI response structure
                logger.info(f"=== SERPAPI RAW RESPONSE STRUCTURE ===")
                logger.info(f"Response keys: {list(results.keys())}")
                logger.info(f"Pagination info: {results.get('serpapi_pagination', {})}")
                logger.info(f"Search metadata: {results.get('search_metadata', {})}")
                
                # Check for errors
                if 'error' in results:
                    if text:
                        with open('unworkable_urls.txt', 'a', encoding='utf-8') as f:
                            f.write(text + '\n')
                        logger.info(f"Added '{text}' to unworkable_urls.txt due to API error")
                    logger.error(f"SerpApi error: {results['error']}")
                    raise Exception(f"SerpApi error: {results['error']}")
                
                creatives = results.get('ad_creatives', [])
                
                if not creatives:
                    logger.info("No creatives found in response")
                    break
                
                # Log sample creative data structure
                if all_creatives == [] and creatives:  # First batch
                    sample_creative = creatives[0]
                    logger.info(f"=== SAMPLE CREATIVE DATA STRUCTURE ===")
                    logger.info(f"Creative keys: {list(sample_creative.keys())}")
                    logger.info(f"Sample creative: {sample_creative}")
                    
                    # Log advertiser structure if present
                    if 'advertiser' in sample_creative:
                        logger.info(f"Advertiser data: {sample_creative['advertiser']}")
                    
                    # Log image/video data if present
                    if 'image' in sample_creative:
                        logger.info(f"Image URL: {sample_creative['image']}")
                    if 'video_link' in sample_creative:
                        logger.info(f"Video link: {sample_creative['video_link']}")
                
                all_creatives.extend(creatives)
                logger.info(f"Fetched {len(creatives)} creatives (total: {len(all_creatives)})")

                page_count += 1
                if max_pages >= 0 and page_count >= max_pages:
                    logger.info(f"Reached max_pages={max_pages}, stopping fetch")
                    break

                # Check for pagination
                pagination = results.get('serpapi_pagination', {})
                next_page_token = pagination.get('next_page_token')
                
                if not next_page_token:
                    logger.info("No more pages available")
                    break
                    
            except Exception as e:
                logger.error(f"Error fetching data from SerpApi: {e}")
                raise
        
        return all_creatives
    
    def process_creative_data(self, creative_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process and validate creative data from SerpApi
        
        Args:
            creative_data: Raw creative data from API
            
        Returns:
            Processed creative data ready for database storage
        """
        # Log raw creative data for first few items
        if hasattr(self, '_log_count'):
            self._log_count += 1
        else:
            self._log_count = 1
            
        if self._log_count <= 3:  # Log first 3 items
            logger.info(f"=== PROCESSING CREATIVE #{self._log_count} ===")
            logger.info(f"Raw creative data: {creative_data}")
        
        # Convert epoch timestamps to datetime objects
        first_shown_epoch = creative_data.get('first_shown')
        last_shown_epoch = creative_data.get('last_shown')
        
        if first_shown_epoch:
            first_shown = datetime.fromtimestamp(first_shown_epoch, tz=timezone.utc)
        else:
            first_shown = None
            
        if last_shown_epoch:
            last_shown = datetime.fromtimestamp(last_shown_epoch, tz=timezone.utc)
        else:
            last_shown = None
        
        # Process advertiser data
        advertiser_data = {
            'advertiser_id': creative_data.get('advertiser_id'),
            'name': creative_data.get('advertiser'),
        }
        
        # Process creative data
        processed_data = {
            'ad_creative_id': creative_data.get('ad_creative_id'),
            'advertiser_data': advertiser_data,
            'format': creative_data.get('format'),
            'image_url': creative_data.get('image'),
            'video_link': creative_data.get('video_link'),
            'width': creative_data.get('width'),
            'height': creative_data.get('height'),
            'target_domain': creative_data.get('target_domain'),
            'first_shown': first_shown,
            'last_shown': last_shown,
            'details_link': creative_data.get('details_link'),
            'region': creative_data.get('region'),
            'platform': creative_data.get('platform'),
        }
        
        # Log processed data for first few items
        if self._log_count <= 3:
            logger.info(f"Processed data: {processed_data}")
            logger.info(f"First shown (epoch): {first_shown_epoch} -> (datetime): {first_shown}")
            logger.info(f"Last shown (epoch): {last_shown_epoch} -> (datetime): {last_shown}")
            logger.info(f"=== END PROCESSING CREATIVE #{self._log_count} ===")
        
        return processed_data
    
    def upsert_creative(self, processed_data: Dict[str, Any]) -> Creative:
        """
        Upsert creative data into the database
        
        Args:
            processed_data: Processed creative data
            
        Returns:
            Created or updated Creative instance
        """
        advertiser_data = processed_data.pop('advertiser_data')
        
        # Log database operation for first few items
        if hasattr(self, '_log_count') and self._log_count <= 3:
            logger.info(f"=== DATABASE UPSERT FOR CREATIVE #{self._log_count} ===")
            logger.info(f"Advertiser data to upsert: {advertiser_data}")
            logger.info(f"Creative data to upsert: {processed_data}")
        
        # Upsert advertiser
        advertiser, advertiser_created = Advertiser.objects.update_or_create(
            advertiser_id=advertiser_data['advertiser_id'],
            defaults={
                'name': advertiser_data['name'],
                'first_seen_at': advertiser_data.get('first_seen_at'),
                'last_seen_at': advertiser_data.get('last_seen_at'),
            }
        )
        
        # Update advertiser's first_seen_at and last_seen_at if needed
        if processed_data.get('first_shown'):
            if not advertiser.first_seen_at or processed_data['first_shown'] < advertiser.first_seen_at:
                advertiser.first_seen_at = processed_data['first_shown']
                advertiser.save(update_fields=['first_seen_at'])
        
        if processed_data.get('last_shown'):
            if not advertiser.last_seen_at or processed_data['last_shown'] > advertiser.last_seen_at:
                advertiser.last_seen_at = processed_data['last_shown']
                advertiser.save(update_fields=['last_seen_at'])
        
        # Upsert creative
        creative, creative_created = Creative.objects.update_or_create(
            ad_creative_id=processed_data['ad_creative_id'],
            defaults={
                'advertiser': advertiser,
                **processed_data
            }
        )
        
        if advertiser_created:
            logger.info(f"Created new advertiser: {advertiser.name}")
        if creative_created:
            logger.info(f"Created new creative: {creative.ad_creative_id}")
        else:
            logger.info(f"Updated existing creative: {creative.ad_creative_id}")
        
        # Log final database state for first few items
        if hasattr(self, '_log_count') and self._log_count <= 3:
            logger.info(f"Final advertiser object: ID={advertiser.id}, Name={advertiser.name}")
            logger.info(f"Final creative object: ID={creative.id}, Creative ID={creative.ad_creative_id}")
            logger.info(f"=== END DATABASE UPSERT FOR CREATIVE #{self._log_count} ===")
        
        return creative
