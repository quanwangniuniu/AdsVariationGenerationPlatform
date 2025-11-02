#!/usr/bin/env python
"""
Test script to verify SerpApi integration and fetch real data.
Run this script to test the SerpApi connection and see real ad data.
"""

import os
import sys
import django
from datetime import datetime

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from AdSpark.services import SerpApiService

def test_serpapi_connection():
    """Test basic SerpApi connection"""
    print("🔍 Testing SerpApi Connection...")
    
    try:
        service = SerpApiService()
        print("✅ SerpApi service initialized successfully")
        return service
    except Exception as e:
        print(f"❌ Failed to initialize SerpApi service: {e}")
        return None

def test_fetch_tesla_ads(service):
    """Test fetching Tesla ads"""
    print("\n🚗 Testing Tesla Ads Fetch...")
    
    try:
        # Fetch Tesla ads using advertiser ID
        creatives = service.fetch_creatives(
            text="shoes",
            region="2840",  # US
            num=5  # Limit to 5 for testing
        )
        
        print(f"✅ Successfully fetched {len(creatives)} Tesla creatives")
        
        if creatives:
            print("\n📊 Sample Tesla Creative:")
            sample = creatives[0]
            for key, value in sample.items():
                print(f"  {key}: {value}")
        
        return creatives
    except Exception as e:
        print(f"❌ Failed to fetch Tesla ads: {e}")
        sys.exit(1)
        return []

def test_fetch_apple_domain_ads(service):
    """Test fetching Apple domain ads"""
    print("\n🍎 Testing Apple Domain Ads Fetch...")
    
    try:
        # Fetch ads targeting apple.com
        creatives = service.fetch_creatives(
            text="apple.com",
            region="2840",  # US
            num=5  # Limit to 5 for testing
        )
        
        print(f"✅ Successfully fetched {len(creatives)} Apple domain creatives")
        
        if creatives:
            print("\n📊 Sample Apple Domain Creative:")
            sample = creatives[0]
            for key, value in sample.items():
                print(f"  {key}: {value}")
        
        return creatives
    except Exception as e:
        print(f"❌ Failed to fetch Apple domain ads: {e}")
        sys.exit(1)
        return []

def test_fetch_video_ads(service):
    """Test fetching video ads"""
    print("\n🎥 Testing Video Ads Fetch...")
    
    try:
        # Fetch video ads
        creatives = service.fetch_creatives(
            text="apple.com",
            creative_format="video",
            region="2840",  # US
            num=3  # Limit to 3 for testing
        )
        
        print(f"✅ Successfully fetched {len(creatives)} video creatives")
        
        if creatives:
            print("\n📊 Sample Video Creative:")
            sample = creatives[0]
            for key, value in sample.items():
                print(f"  {key}: {value}")
        
        return creatives
    except Exception as e:
        print(f"❌ Failed to fetch video ads: {e}")
        sys.exit(1)
        return []

def test_dry_run_command():
    """Test the management command in dry-run mode"""
    print("\n🛠️ Testing Management Command (Dry Run)...")
    
    try:
        from django.core.management import call_command
        from io import StringIO
        
        out = StringIO()
        call_command('ads_fetch_creatives', 
                    advertiser_ids="AR17828074650563772417",
                    region="2840",
                    num=3,
                    dry_run=True,
                    stdout=out)
        
        output = out.getvalue()
        print("✅ Management command executed successfully")
        print("📋 Command Output:")
        print(output)
        
    except Exception as e:
        print(f"❌ Failed to execute management command: {e}")
        sys.exit(1)

def main():
    """Main test function"""
    print("🚀 AdSpark SerpApi Integration Test")
    print("=" * 50)
    
    # Test 1: Basic connection
    service = test_serpapi_connection()
    if not service:
        print("❌ Cannot proceed without SerpApi service")
        return
    
    # Test 2: Fetch Tesla ads
    tesla_creatives = test_fetch_tesla_ads(service)
    
    # Test 3: Fetch Apple domain ads

    apple_creatives = test_fetch_apple_domain_ads(service)
    
    # Test 4: Fetch video ads
    video_creatives = test_fetch_video_ads(service)
    
    # Test 5: Management command
    test_dry_run_command()
    
    # Summary
    print("\n" + "=" * 50)
    print("🎯 Test Summary:")
    print(f"  Tesla creatives: {len(tesla_creatives)}")
    print(f"  Apple domain creatives: {len(apple_creatives)}")
    print(f"  Video creatives: {len(video_creatives)}")
    
    if tesla_creatives or apple_creatives or video_creatives:
        print("✅ SerpApi integration is working correctly!")
        print("\n📝 Next steps:")
        print("1. Run: python manage.py ads_fetch_creatives --advertiser-ids AR17828074650563772417 --region 2840")
        print("2. Test API endpoints with the fetched data")
    else:
        print("❌ No data fetched. Check your API key and parameters.")


if __name__ == "__main__":
    main()
