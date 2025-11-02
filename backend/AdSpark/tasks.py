import logging
from celery import shared_task
from django.core.management import call_command
from django.utils import timezone
from .models import Watch,Creative
from .services import SerpApiService

logger = logging.getLogger(__name__)


@shared_task(bind=True)
def fetch_creatives_task(self, **kwargs):
    """
    Celery task to fetch creatives from SerpApi
    
    Args:
        **kwargs: Parameters to pass to the management command
    """
    try:
        logger.info(f"Starting fetch_creatives_task with parameters: {kwargs}")
        
        # Call the management command
        call_command('ads_fetch_creatives', **kwargs)
        
        logger.info("fetch_creatives_task completed successfully")
        return {"status": "success", "message": "Creatives fetched successfully"}
        
    except Exception as e:
        logger.error(f"Error in fetch_creatives_task: {e}")
        raise self.retry(countdown=60, max_retries=3)


@shared_task(bind=True)
def process_watch_task(self, watch_id):
    """
    Celery task to process a specific watch configuration
    
    Args:
        watch_id: ID of the Watch instance to process
    """
    try:
        logger.info(f"Starting process_watch_task for watch_id: {watch_id}")
        
        # Get the watch configuration
        watch = Watch.objects.get(id=watch_id, is_active=True)
        
        # Prepare parameters from watch configuration
        params = {}
        
        if watch.advertiser_ids:
            params['advertiser_ids'] = watch.advertiser_ids
        if watch.text:
            params['text'] = watch.text
        if watch.region:
            params['region'] = watch.region
        if watch.platform:
            params['platform'] = watch.platform
        if watch.creative_format:
            params['creative_format'] = watch.creative_format
        if watch.political_ads:
            params['political_ads'] = True
        
        # Call the fetch task with watch parameters
        result = fetch_creatives_task.apply_async(kwargs=params)
        
        logger.info(f"process_watch_task completed for watch_id: {watch_id}")
        return {"status": "success", "watch_id": watch_id, "task_id": result.id}
        
    except Watch.DoesNotExist:
        logger.warning(f"Watch with id {watch_id} not found or inactive")
        return {"status": "error", "message": "Watch not found or inactive"}
    except Exception as e:
        logger.error(f"Error in process_watch_task for watch_id {watch_id}: {e}")
        raise self.retry(countdown=60, max_retries=3)


@shared_task(bind=True)
def process_all_active_watches_task(self):
    """
    Celery task to process all active watch configurations
    """
    try:
        logger.info("Starting process_all_active_watches_task")
        
        # Get all active watches
        active_watches = Watch.objects.filter(is_active=True)
        
        if not active_watches.exists():
            logger.info("No active watches found")
            return {"status": "success", "message": "No active watches to process"}
        
        # Process each active watch
        results = []
        for watch in active_watches:
            try:
                result = process_watch_task.delay(watch.id)
                results.append({"watch_id": watch.id, "task_id": result.id})
            except Exception as e:
                logger.error(f"Error processing watch {watch.id}: {e}")
                results.append({"watch_id": watch.id, "error": str(e)})
        
        logger.info(f"process_all_active_watches_task completed. Processed {len(results)} watches")
        return {"status": "success", "results": results}
        
    except Exception as e:
        logger.error(f"Error in process_all_active_watches_task: {e}")
        raise self.retry(countdown=60, max_retries=3)


@shared_task(bind=True)
def cleanup_old_creatives_task(self, days_old=90):
    """
    Celery task to cleanup old creative records
    
    Args:
        days_old: Number of days after which creatives are considered old
    """
    try:
        logger.info(f"Starting cleanup_old_creatives_task for creatives older than {days_old} days")
        
        from django.utils import timezone
        from datetime import timedelta
        
        cutoff_date = timezone.now() - timedelta(days=days_old)
        
        # Count creatives to be deleted
        old_creatives_count = Creative.objects.filter(
            last_shown__lt=cutoff_date
        ).count()
        
        # Delete old creatives
        deleted_count, _ = Creative.objects.filter(
            last_shown__lt=cutoff_date
        ).delete()
        
        logger.info(f"cleanup_old_creatives_task completed. Deleted {deleted_count} creatives")
        return {"status": "success", "deleted_count": deleted_count}
        
    except Exception as e:
        logger.error(f"Error in cleanup_old_creatives_task: {e}")
        raise self.retry(countdown=60, max_retries=3)
