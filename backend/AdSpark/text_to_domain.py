import os
import sys
import django
from datetime import datetime

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from googlesearch import search
from publicsuffix2 import get_sld
from urllib.parse import urlparse
from AdSpark.models import Google_Ads_GeoId
import re

def is_domain_format(text):
    """Simple check if the text is already in domain format"""
    return bool(re.match(r'^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$', text.strip()))


def get_domain_from_url(url):
    """Extract normalized domain from a full URL"""
    parsed = urlparse(url)
    host = parsed.netloc or parsed.path  # Some results may directly be a domain
    return get_sld(host)

def url_in_txt(url):
    txt_path = "unworkable_urls.txt"
    try:
        with open(txt_path, "r", encoding="utf-8") as f:
            urls = set(line.strip().lower() for line in f if line.strip())
        return url.lower() in urls
    except FileNotFoundError:
        print(f"The file {txt_path} does not exist")
        return True


def keyword_to_domain_with_region(keyword, region_geo_id):
    """
    Get domain from a keyword:
    - If it's already a domain, return directly
    - Otherwise, search via Google and extract the result domain
    """
    region_code = None
    try:
        region = Google_Ads_GeoId.objects.get(geo_id=region_geo_id)
        region_code = region.country_code
        region_tld = region.tld.lower() if region.tld else None
    except Google_Ads_GeoId.DoesNotExist:
        region_tld = None

    keyword = keyword.strip()
    if is_domain_format(keyword):
        return keyword.lower()
    # Google search
    for result_url in search(keyword,region=region_code):
        domain = get_domain_from_url(result_url)
        if url_in_txt(domain):
            continue
        if not domain:
            continue

        # Extract domain suffix
        domain_parts = domain.split('.')
        if len(domain_parts) < 3:  # No tls, e.g. .com
            return domain

        tld = '.' + domain_parts[-1].lower()  # e.g. .au

        # Three cases
        if not tld:  # Case 1: no region suffix
            return domain
        elif region_tld and tld == region_tld:  # Matches geo_id's tld
            return domain
        else:
            continue  # No match, continue to next result

    # If no results found
    return keyword

def keyword_to_domain(keyword):
    """
    Get domain from keyword, without region filtering.
    """
    keyword = keyword.strip()
    if is_domain_format(keyword):
        return keyword.lower()

    for result_url in search(keyword):
        domain = get_domain_from_url(result_url)
        if domain:
            return domain

    return keyword  # fallback

if __name__ == "__main__":
    keywords = ["shoes", "coca cola", "example.com"]
    for kw in keywords:
        domain = keyword_to_domain_with_region(kw,"2392")  # 只接受澳大利亚域名或 .com
        print(f"{kw} -> {domain}")
