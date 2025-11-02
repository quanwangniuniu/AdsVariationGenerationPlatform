# AdSpark - AI-Powered Ads Intelligence Platform

AdSpark is a Django application that provides an AI-powered ads intelligence platform using the SerpApi Google Ads Transparency Center API.

## Features

- **Data Ingestion**: Fetch and store ad creatives from SerpApi with automatic upsert functionality
- **Comprehensive Filtering**: Filter creatives by advertiser, domain, region, platform, format, and more
- **Analytics & Insights**: Timeline analysis, size distribution, and statistical insights
- **Scheduled Tasks**: Automated data fetching using Celery with configurable watches
- **RESTful API**: Full-featured API for accessing and managing ad data
- **Admin Interface**: Django admin integration for data management

## Models

### Advertiser
- `advertiser_id`: Primary key, unique advertiser identifier
- `name`: Advertiser name
- `first_seen_at`: First time this advertiser was seen
- `last_seen_at`: Last time this advertiser was seen
- `created_at`, `updated_at`: Timestamps

### Creative
- `ad_creative_id`: Primary key, unique creative identifier
- `advertiser`: Foreign key to Advertiser
- `format`: Creative format (text, image, video)
- `image_url`, `video_link`: Media URLs
- `width`, `height`: Creative dimensions
- `target_domain`: Target domain for the ad
- `first_shown`, `last_shown`: Ad display period
- `details_link`: Link to ad transparency details
- `region`, `platform`: Geographic and platform information
- `fetched_at`: When this creative was fetched

### Watch
- `name`: Watch configuration name
- `advertiser_ids`: Comma-separated advertiser IDs to monitor
- `text`: Domain or text to search for
- `region`, `platform`, `creative_format`: Filter parameters
- `political_ads`: Whether to filter for political ads
- `is_active`: Whether this watch is active

## API Endpoints

**Note: All API endpoints are publicly accessible without authentication.**

### Creatives
- `GET /api/adspark/creatives/` - List creatives with filtering
- `GET /api/adspark/creatives/{id}/` - Get specific creative
- `GET /api/adspark/creatives/timeline/` - Timeline insights
- `GET /api/adspark/creatives/sizes/` - Size distribution insights
- `GET /api/adspark/creatives/stats/` - General statistics

### Advertisers
- `GET /api/adspark/advertisers/` - List advertisers
- `GET /api/adspark/advertisers/{id}/` - Get specific advertiser
- `GET /api/adspark/advertisers/{id}/creatives/` - Get advertiser's creatives

### Watches
- `GET /api/adspark/watches/` - List watch configurations
- `POST /api/adspark/watches/` - Create new watch
- `GET /api/adspark/watches/{id}/` - Get specific watch
- `PUT /api/adspark/watches/{id}/` - Update watch
- `DELETE /api/adspark/watches/{id}/` - Delete watch
- `POST /api/adspark/watches/{id}/trigger/` - Trigger specific watch
- `POST /api/adspark/watches/trigger_all/` - Trigger all active watches

## Filtering Options

### Creative Filters
- `advertiser_id`: Filter by advertiser ID
- `advertiser_name`: Filter by advertiser name (partial match)
- `q`: Search across advertiser name and target domain
- `format`: Filter by creative format (text, image, video)
- `platform`: Filter by platform (PLAY, MAPS, SEARCH, SHOPPING, YOUTUBE)
- `region`: Filter by region code
- `target_domain`: Filter by target domain
- `start`, `end`: Date range filters
- `min_width`, `min_height`: Minimum dimension filters
- `seen_since_days`: Filter creatives seen in the last N days

## Management Commands

### Fetch Creatives
```bash
python manage.py ads_fetch_creatives [options]
```

Options:
- `--advertiser-ids`: Comma-separated advertiser IDs
- `--text`: Free text or domain search
- `--region`: Numeric region code
- `--platform`: Platform filter
- `--creative-format`: Format filter
- `--start-date`, `--end-date`: Date range (YYYYMMDD)
- `--political-ads`: Filter for political ads
- `--num`: Results per page (default: 40, max: 100)
- `--dry-run`: Fetch without saving to database

## Celery Tasks

### Available Tasks
- `fetch_creatives_task`: Fetch creatives with given parameters
- `process_watch_task`: Process a specific watch configuration
- `process_all_active_watches_task`: Process all active watches
- `cleanup_old_creatives_task`: Clean up old creative records

### Scheduling
Tasks can be scheduled using django-celery-beat. Configure periodic tasks in the Django admin interface.

## Environment Variables

Required environment variables:
- `SERPAPI_API_KEY`: Your SerpApi API key
- `CELERY_BROKER_URL`: Redis broker URL (default: redis://localhost:6379/0)
- `CELERY_RESULT_BACKEND`: Redis result backend URL (default: redis://localhost:6379/0)

## Installation

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Run migrations:
```bash
python manage.py makemigrations AdSpark
python manage.py migrate
```

3. Set up Celery (optional):
```bash
# Start Celery worker
celery -A backend worker --loglevel=info

# Start Celery beat scheduler
celery -A backend beat --loglevel=info
```

4. Create a superuser for admin access:
```bash
python manage.py createsuperuser
```

## Usage Examples

### Fetch Creatives for a Specific Advertiser
```bash
python manage.py ads_fetch_creatives --advertiser-ids "AR17828074650563772417"
```

### Search for Domain
```bash
python manage.py ads_fetch_creatives --text "apple.com"
```

### Filter by Region and Platform
```bash
python manage.py ads_fetch_creatives --region "2840" --platform "SEARCH"
```

### API Usage
```python
import requests

# Get creatives with filters (no authentication required)
response = requests.get('http://localhost:8000/api/adspark/creatives/', params={
    'advertiser_name': 'Tesla',
    'format': 'image',
    'platform': 'SEARCH'
})

# Get timeline insights
response = requests.get('http://localhost:8000/api/adspark/creatives/timeline/', params={
    'group_by': 'week',
    'format': 'image'
})

# Test API accessibility
python backend/AdSpark/test_api_access.py
```

## Testing

Run tests:
```bash
python manage.py test AdSpark
```

## Contributing

1. Follow Django coding standards
2. Write tests for new features
3. Update documentation as needed
4. Ensure all tests pass before submitting

## License

This project is part of the ELEC5620 Group 10 AI Creative Agent project.
