import os
from celery import Celery
from celery.schedules import crontab as _celery_crontab

# Set the default Django settings module for the 'celery' program.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

app = Celery('backend')

# Using a string here means the worker doesn't have to serialize
# the configuration object to child processes.
app.config_from_object('django.conf:settings', namespace='CELERY')

# Load task modules from all registered Django apps.
app.autodiscover_tasks()

# Task routing configuration – assign different queues for different types of tasks
app.conf.task_routes = {
    # AdSpark related tasks – data fetching and processing
    'AdSpark.tasks.fetch_creatives_task': {'queue': 'data_fetch'},
    'AdSpark.tasks.process_watch_task': {'queue': 'data_fetch'},
    'AdSpark.tasks.process_all_active_watches_task': {'queue': 'data_fetch'},
    'AdSpark.tasks.cleanup_old_creatives_task': {'queue': 'maintenance'},

    # AI Agent related tasks – AI generation
    'ai_agent.tasks.generate_ad_variant_async': {'queue': 'ai_generation'},
    'ai_agent.tasks.generate_workspace_ad_variant_async': {'queue': 'ai_generation'},
    # Asset related tasks
    "assets.tasks.cleanup_soft_deleted": {"queue": "assets"},
    "assets.tasks.process_pending_asset": {"queue": "assets"},

    # Billing related tasks
    "billing.tasks.process_pending_plan_changes": {"queue": "billing"},
    "billing.tasks.sync_workspace_plans_from_subscriptions": {"queue": "billing"},
    "billing.tasks.process_stripe_event_async": {"queue": "billing"},
    "billing.tasks.process_subscription_auto_renewals": {"queue": "billing"},
    "billing.tasks.sync_stripe_credit_balances": {"queue": "billing"},
    "billing.tasks.cleanup_webhook_event_logs": {"queue": "billing"},


    # Default queue
    '*': {'queue': 'default'},
}

# Default queue configuration
app.conf.task_default_queue = 'default'

# Default queue configuration
app.conf.update(
    # Serialization settings
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',

    # Timezone settings
    timezone='UTC',
    enable_utc=True,

    # Task execution settings
    task_track_started=True,
    task_time_limit=30 * 60,
    task_soft_time_limit=25 * 60,

    # Worker settings
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=1000,
    worker_disable_rate_limits=False,

    # Retry settings
    task_acks_late=True,
    task_reject_on_worker_lost=True,

    # Monitoring settings
    worker_send_task_events=True,
    task_send_sent_event=True,

    # Queue settings
    task_queues={
        'default': {
            'exchange': 'default',
            'routing_key': 'default',
        },
        'data_fetch': {
            'exchange': 'data_fetch',
            'routing_key': 'data_fetch',
        },
        'ai_generation': {
            'exchange': 'ai_generation',
            'routing_key': 'ai_generation',
        },
        'assets': {
            'exchange': 'assets',
            'routing_key': 'assets',
        },
        'billing': {
            'exchange': 'billing',
            'routing_key': 'billing',
        },
        'maintenance': {
            'exchange': 'maintenance',
            'routing_key': 'maintenance',
        },
    },

    # Task priority settings
    task_inherit_parent_priority=True,
    task_default_priority=5,

    # Error handling
    task_ignore_result=False,
    task_store_errors_even_if_ignored=True,
)

# Set task-specific limits
app.conf.task_annotations = {
    # AdSpark data fetch tasks
    'AdSpark.tasks.fetch_creatives_task': {
        'rate_limit': '10/m',  # Max 10 tasks per minute
        'time_limit': 300,  # 5 min hard timeout
        'soft_time_limit': 240,  # 4 min soft timeout
    },
    'AdSpark.tasks.process_watch_task': {
        'rate_limit': '20/m',
        'time_limit': 180,
        'soft_time_limit': 150,
    },
    'AdSpark.tasks.process_all_active_watches_task': {
        'rate_limit': '5/m',  # Lower frequency since it triggers multiple subtasks
        'time_limit': 600,  # 10 min hard timeout
        'soft_time_limit': 540,
    },
    'AdSpark.tasks.cleanup_old_creatives_task': {
        'rate_limit': '1/h',  # Max once per hour
        'time_limit': 1800,  # 30 min hard timeout
        'soft_time_limit': 1500,
    },

    # AI Agent tasks
    'ai_agent.tasks.generate_ad_variant_async': {
        'rate_limit': '30/m',  # Max 30 AI generation tasks per minute
        'time_limit': 1800,  # 30 min hard timeout (AI API may be slow)
        'soft_time_limit': 1500,  # 25 min soft timeout
        'max_retries': 3,
        'default_retry_delay': 60,
    },

}

# Celery Beat schedule configuration
# Defines periodic tasks and their execution times.

class VerboseCrontab(_celery_crontab):
    """Extend Celery's crontab schedule with a repr matching legacy expectations."""

    def __repr__(self) -> str:  # pragma: no cover - formatting helper only
        base = super().__repr__()
        minute_expr = getattr(self, "_orig_minute", None)
        if minute_expr and f"minute='{minute_expr}'" not in base:
            base = f"{base} minute='{minute_expr}'"
        return base


def crontab(*args, **kwargs):
    """Factory returning a VerboseCrontab to keep schedule repr stable for tests."""
    return VerboseCrontab(*args, **kwargs)


app.conf.beat_schedule = {
    "adspark_process_active_watches_30min": {
        "task": "AdSpark.tasks.process_all_active_watches_task",
        "schedule": crontab(minute="*/30"),
        "options": {"queue": "data_fetch"},
    },
    "adspark_cleanup_old_creatives_daily": {
        "task": "AdSpark.tasks.cleanup_old_creatives_task",
        "schedule": crontab(hour=1, minute=0),
        "options": {"queue": "maintenance"},
    },
    "assets_cleanup_soft_deleted_daily": {
        "task": "assets.tasks.cleanup_soft_deleted",
        "schedule": crontab(hour=2, minute=0),
        "options": {"queue": "assets"},
    },
    "process_pending_plan_changes_15min": {
        "task": "billing.tasks.process_pending_plan_changes",
        "schedule": crontab(minute="*/15"),  # Run every 15 minutes
        "options": {"queue": "billing", "priority": 8},
    },
    "process_subscription_auto_renewals_15min": {
        "task": "billing.tasks.process_subscription_auto_renewals",
        "schedule": crontab(minute="*/15"),
        "options": {"queue": "billing", "priority": 2},
    },
    "sync_stripe_credit_balances_daily": {
        "task": "billing.tasks.sync_stripe_credit_balances",
        "schedule": crontab(hour=3, minute=0),
        "options": {"queue": "billing"},
    },
    "cleanup_webhook_logs_daily": {
        "task": "billing.tasks.cleanup_webhook_event_logs",
        "schedule": crontab(hour=4, minute=0),
        "options": {"queue": "billing"},
    },
}


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f'Request: {self.request!r}')

# System health check task
@app.task(bind=True)
def health_check(self):
    """System health check task"""
    import django
    from django.db import connection

    try:
        # Check database connection
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")

        return {
            'status': 'healthy',
            'timestamp': app.now(),
            'worker_id': self.request.id,
        }
    except Exception as e:
        return {
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': app.now(),
        }

# Task statistics
@app.task(bind=True)
def get_task_stats(self):
    """Retrieve task statistics"""
    try:
        inspect = app.control.inspect()

        stats = {
            'active_tasks': inspect.active(),
            'scheduled_tasks': inspect.scheduled(),
            'reserved_tasks': inspect.reserved(),
            'registered_tasks': list(inspect.registered().values())[0] if inspect.registered() else [],
        }

        return stats
    except Exception as e:
        return {'error': str(e)}
