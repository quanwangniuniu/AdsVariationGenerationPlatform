# Celery Configuration and Usage Guide

## Overview

This project uses Celery for handling asynchronous background tasks. Celery helps offload time-consuming operations from the main Django application, improving response times and user experience.

## What Celery Does in This Project

### Task Types

* **AdSpark Tasks**: Fetch creative advertisements from external APIs
* **AI Agent Tasks**: Generate ad variants using AI workflows
* **Maintenance Tasks**: Clean up old data and perform housekeeping
* **General Tasks**: Handle miscellaneous background operations

### Queue System

The project uses multiple queues to organize different types of work:

* `default`: General background tasks
* `data_fetch`: AdSpark API calls and data collection
* `ai_generation`: AI-powered ad variant creation
* `maintenance`: Database cleanup and system maintenance

## Architecture

### Components

* **Redis**: Message broker that stores task queues
* **Celery Workers**: Process tasks from specific queues
* **Celery Beat**: Scheduler for recurring tasks
* **Flower**: Web-based monitoring dashboard

### Worker Distribution

```
celery-worker-default      → Handles general tasks (2 concurrent)
celery-worker-data-fetch   → Processes AdSpark tasks (2 concurrent)
celery-worker-ai-generation → Runs AI tasks (1 concurrent)
celery-worker-maintenance  → Cleanup operations (1 concurrent)
```

## Quick Start

### Using Docker (Recommended)

1. **Start all services**:

```bash
docker-compose up -d
```

2. **Check service status**:

```bash
docker-compose ps
```

3. **View logs**:

```bash
# All services
docker-compose logs -f

# Specific worker
docker-compose logs -f celery-worker-data-fetch
```

4. **Access monitoring**:

* Flower dashboard: [http://localhost:5555](http://localhost:5555)

### Using Helper Scripts

The project includes convenient shell scripts in `backend/celery_scripts/`:

```bash
# Start workers
./backend/celery_scripts/start_celery_workers.sh

# Start beat scheduler
./backend/celery_scripts/start_celery_beat.sh

# Start Flower monitoring
./backend/celery_scripts/start_celery_flower.sh

# Check Celery status
./backend/celery_scripts/celery_status.sh
```

### Manual Setup (Development)

1. **Start Redis**:

```bash
redis-server
```
Windows:
```bash
docker run -d --name redis -p 6379:6379 redis
```
2. **Start workers (Linux/Mac)** (run each in separate terminals):

```bash
# Default queue worker
celery -A backend worker --loglevel=info --queues=default --concurrency=2

# Data fetch worker
celery -A backend worker --loglevel=info --queues=data_fetch --concurrency=2

# AI generation worker
celery -A backend worker --loglevel=info --queues=ai_generation --concurrency=1

# Maintenance worker
celery -A backend worker --loglevel=info --queues=maintenance --concurrency=1
```

3. **Start workers (Windows)**:
   On Windows, the default **prefork** pool causes `PermissionError: [WinError 5]`. Use `solo` or `threads` pool instead.

**Single-process:**

```powershell
celery -A backend.celery worker -P solo -c 1 -l info -Q default,data_fetch,ai_generation,maintenance
```

**Thread-based (for light concurrency,this is the one you should use for this project):**

```powershell
celery -A backend.celery worker -P threads -c 4 -l info -Q default,data_fetch,ai_generation,maintenance
```

Optional flags to improve stability:

```powershell
--without-gossip --without-mingle --without-heartbeat
```

4. **Start beat scheduler**:

```bash
celery -A backend beat --loglevel=info
```

5. **Start Flower (optional)**:

```bash
celery -A backend flower --port=5555
```

## Task Examples

### AdSpark Tasks

```python
from AdSpark.tasks import fetch_creatives_task

# Fetch creatives asynchronously
result = fetch_creatives_task.delay(
    advertiser_ids="AR17828074650563772417",
    text="keyword",
    region="US"
)
```

### AI Agent Tasks

```python
from ai_agent.tasks import generate_ad_variant_async

# Generate AI ad variant
result = generate_ad_variant_async.delay(
    variant_id=1,
    original_ad_id="ad123",
    prompt="Create a summer-themed version",
    user_id=1
)
```

### Watch Processing

```python
from AdSpark.tasks import process_all_active_watches_task

# Process all active watch configurations
result = process_all_active_watches_task.delay()
```

## Monitoring and Management

### Using Flower Dashboard

1. Open [http://localhost:5555](http://localhost:5555)
2. View active tasks, worker status, and queue lengths
3. Monitor task execution times and failure rates

### Using the Monitor Script

Located at `backend/monitor_celery.py`:

```bash
# Run comprehensive system check
python backend/monitor_celery.py --check

# Interactive management menu
python backend/monitor_celery.py --interactive

# Monitor tasks for 60 seconds
python backend/monitor_celery.py --monitor 60

# Check specific task status
python backend/monitor_celery.py --task-id <task-id>
```

### Command Line Inspection

```bash
# Check active tasks
celery -A backend inspect active

# Check worker stats
celery -A backend inspect stats

# Purge all queues
celery -A backend purge
```

## Configuration Details

### Queue Settings

Defined in `backend/celery.py`:

* Task routing assigns different tasks to appropriate queues
* Rate limiting prevents API overload
* Retry policies handle temporary failures
* Memory and time limits prevent runaway tasks

### Worker Resources

From `docker-compose.yml`:

* AI generation: 2GB memory (AI processing intensive)
* Data fetch: 1GB memory (handles API calls)
* Default/Maintenance: 512MB memory (lightweight tasks)

### Redis Configuration

* Memory limit: 512MB with LRU eviction
* Persistent storage with append-only file
* Health checks ensure availability

## Common Operations

### Scaling Workers

```bash
# Scale data fetch workers to 3 instances
docker-compose up -d --scale celery-worker-data-fetch=3

# Scale AI workers to 2 instances
docker-compose up -d --scale celery-worker-ai-generation=2
```

### Restarting Services

```bash
# Restart all Celery services
docker-compose restart celery-worker-default celery-worker-data-fetch celery-worker-ai-generation celery-worker-maintenance celery-beat

# Restart specific worker
docker-compose restart celery-worker-ai-generation
```

### Updating Configuration

After changing `celery.py`:

```bash
# Rebuild and restart
docker-compose down
docker-compose build backend
docker-compose up -d
```

## Troubleshooting

### Workers Not Starting

**Symptoms**: No workers visible in Flower dashboard

**Solutions**:

1. Check Redis connectivity:

```bash
docker-compose logs redis
redis-cli ping
```

2. Verify Django settings:

```bash
docker-compose exec backend python manage.py shell
>>> from django.conf import settings
>>> print(settings.CELERY_BROKER_URL)
```

3. Check worker logs:

```bash
docker-compose logs celery-worker-default
```

### Tasks Stuck in Queue

**Symptoms**: Tasks remain in PENDING status

**Solutions**:

1. Check if appropriate worker is running:

```bash
celery -A backend inspect active_queues
```

2. Verify task routing:

```bash
# In Django shell
>>> from backend.celery import app
>>> print(app.conf.task_routes)
```

3. Restart workers:

```bash
docker-compose restart celery-worker-data-fetch
```

### High Memory Usage

**Symptoms**: Workers consuming excessive memory

**Solutions**:

1. Check worker settings:

```bash
celery -A backend inspect stats
```

2. Adjust concurrency:

```bash
# Reduce concurrent tasks
celery -A backend worker --queues=ai_generation --concurrency=1
```

3. Monitor with Flower and adjust resources in `docker-compose.yml`

### Database Connection Issues

**Symptoms**: Database errors in worker logs

**Solutions**:

1. Verify database host configuration:

```bash
docker-compose exec backend env | grep DB_HOST
```

2. Test database connectivity:

```bash
docker-compose exec backend python manage.py dbshell
```

3. Check PostgreSQL service status if using local database

### Task Failures

**Symptoms**: Tasks failing with errors

**Solutions**:

1. Check task logs in Flower dashboard
2. Review worker logs:

```bash
docker-compose logs celery-worker-ai-generation
```

3. Test tasks manually:

```bash
docker-compose exec backend python manage.py shell
>>> from ai_agent.tasks import generate_ad_variant_async
>>> result = generate_ad_variant_async.delay(1, "test", "test prompt", 1)
>>> result.status
```

## Development Tips

### Adding New Tasks

1. Define task in appropriate `tasks.py` file
2. Add routing rule in `backend/celery.py`
3. Set rate limits and timeouts in task annotations
4. Test with monitor script

### Testing Tasks Locally

```python
# In Django shell
from ai_agent.tasks import generate_ad_variant_async

# Run synchronously for testing
result = generate_ad_variant_async(
    variant_id=1,
    original_ad_id="test",
    prompt="test prompt",
    user_id=1
)
```

### Performance Optimization

1. Monitor queue lengths in Flower
2. Adjust worker concurrency based on resource usage
3. Use rate limiting to prevent API throttling
4. Implement proper error handling and retries

## Environment Variables

Key settings in `.env`:

```env
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0
DB_HOST=host.docker.internal
DEBUG=False
```

Optional optimizations:

```env
CELERY_WORKER_PREFETCH_MULTIPLIER=1
CELERY_TASK_ACKS_LATE=true
CELERY_WORKER_MAX_TASKS_PER_CHILD=1000
```

## File Structure

```
ELEC5620-GROUP10-AI-Creative-Agent/
├── backend/
│   ├── backend/
│   │   ├── celery.py              # Main Celery configuration
│   │   ├── monitor_celery.py      # Monitoring and testing script
│   │   └── settings.py            # Django settings with Celery config
│   ├── AdSpark/
│   │   ├── tasks.py              # AdSpark-related tasks
│   │   ├── services.py           # SerpApi integration
│   │   └── management/
│   │       └── commands/
│   │           └── ads_fetch_creatives.py  # Management command
│   ├── ai_agent/
│   │   ├── tasks.py              # AI generation tasks
│   │   ├── dify_api_access.py    # Dify API integration
│   │   └── generate_screenshot.py # Screenshot utilities
│   ├── celery_scripts/           # Helper scripts for Celery management
│   │   ├── start_celery_workers.sh
│   │   ├── start_celery_beat.sh
│   │   ├── start_celery_flower.sh
│   │   └── celery_status.sh
│   └── logs/                     # Task execution logs
├── docker-compose.yml            # Production Docker configuration
├── docker-compose.dev.yml        # Development Docker configuration
└── frontend/                     # Next.js frontend application
```

## Project Structure Integration

This Celery setup is part of the ELEC5620 Group 10 AI Creative Agent project, which includes:

* **Backend**: Django REST API with Celery task processing
* **Frontend**: Next.js application for user interface
* **AdSpark Module**: Advertisement data collection and processing
* **AI Agent Module**: AI-powered creative generation using Dify API
* **Accounts/Search**: User management and search functionality

### Development vs Production

The project provides two Docker configurations:

* `docker-compose.dev.yml`: Development with hot reloading
* `docker-compose.yml`: Production with optimized settings

### Database Setup

Before running Celery tasks, ensure your database is set up:

```bash
# Windows
setup_local_db.bat

# PowerShell
setup_local_db.ps1

# Manual Django migrations
python manage.py migrate
```
