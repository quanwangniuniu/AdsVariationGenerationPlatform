#!/usr/bin/env python
"""
Simple test script to verify that the AdSpark API is accessible without authentication.
Run this script to test API endpoints.
"""

import requests
import json

# Base URL for the API
BASE_URL = "http://localhost:8000/api/adspark"

def test_api_endpoint(endpoint, description):
    """Test a specific API endpoint"""
    url = f"{BASE_URL}{endpoint}"
    print(f"\n🔍 Testing {description}")
    print(f"URL: {url}")
    
    try:
        response = requests.get(url, timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            print("✅ SUCCESS: Endpoint is accessible")
            data = response.json()
            if 'count' in data:
                print(f"   Total items: {data['count']}")
            elif 'results' in data:
                print(f"   Total items: {len(data['results'])}")
            else:
                print(f"   Response keys: {list(data.keys())}")
        else:
            print(f"❌ FAILED: Status code {response.status_code}")
            print(f"   Response: {response.text[:200]}...")
            
    except requests.exceptions.ConnectionError:
        print("❌ FAILED: Could not connect to server. Make sure Django is running.")
    except requests.exceptions.Timeout:
        print("❌ FAILED: Request timed out")
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")

def main():
    """Test all main API endpoints"""
    print("🚀 Testing AdSpark API Accessibility")
    print("=" * 50)
    
    # Test main endpoints
    test_api_endpoint("/creatives/", "Creatives List")
    test_api_endpoint("/advertisers/", "Advertisers List")
    test_api_endpoint("/watches/", "Watches List")
    
    # Test analytics endpoints
    test_api_endpoint("/creatives/stats/", "Creative Statistics")
    test_api_endpoint("/creatives/timeline/", "Creative Timeline")
    test_api_endpoint("/creatives/sizes/", "Creative Sizes")
    
    print("\n" + "=" * 50)
    print("🎯 API Accessibility Test Complete")
    print("\nTo start the Django server, run:")
    print("cd backend && python manage.py runserver")

if __name__ == "__main__":
    main()
