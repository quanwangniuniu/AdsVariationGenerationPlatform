# monitor_celery.py - Celery monitoring and test script

import os
import sys
import django
import time
from datetime import datetime

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from backend.celery import app
from celery.result import AsyncResult
import redis


def check_redis_connection():
    """Check Redis connection"""
    try:
        r = redis.Redis.from_url(os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0'))
        r.ping()
        return True, "Redis connection OK"
    except Exception as e:
        return False, f"Redis connection failed: {e}"


def check_celery_workers():
    """Check Celery Workers status"""
    try:
        inspect = app.control.inspect()
        stats = inspect.stats()

        if not stats:
            return False, "No active Celery workers"

        worker_info = []
        active = inspect.active() or {}
        for worker_name, worker_stats in stats.items():
            worker_info.append(f"Worker: {worker_name}")
            worker_info.append(f"  - Max concurrency: {worker_stats.get('pool', {}).get('max-concurrency', 'N/A')}")
            worker_info.append(f"  - Running tasks: {len(active.get(worker_name, []))}")

        return True, "\n".join(worker_info)
    except Exception as e:
        return False, f"Failed to check workers: {e}"


def check_task_queues():
    """Check task queue status"""
    try:
        inspect = app.control.inspect()

        # Get queue info
        active_queues = inspect.active_queues() or {}
        queue_info = []

        for worker, queues in active_queues.items():
            queue_info.append(f"Worker {worker}:")
            for queue in queues:
                queue_info.append(f"  - Queue: {queue['name']}")

        return True, "\n".join(queue_info) if queue_info else "No active queues"
    except Exception as e:
        return False, f"Failed to check queues: {e}"


def test_basic_task():
    """Test basic task execution"""
    try:
        from backend.celery import debug_task, health_check

        # Test debug task
        debug_result = debug_task.delay()

        # Test health check task
        health_result = health_check.delay()

        # Wait briefly for results
        time.sleep(2)

        results = []
        results.append(f"Debug task ID: {debug_result.id}, Status: {debug_result.status}")
        results.append(f"Health check task ID: {health_result.id}, Status: {health_result.status}")

        if health_result.ready():
            results.append(f"Health check result: {health_result.result}")

        return True, "\n".join(results)
    except Exception as e:
        return False, f"Task test failed: {e}"


def test_adspark_tasks():
    """Test AdSpark task"""
    try:
        from AdSpark.tasks import fetch_creatives_task

        # Send a test task (dry run)
        task_result = fetch_creatives_task.delay(
            advertiser_ids="AR17828074650563772417",  # Example ID
            text="test",
            dry_run=True  # Ensure no real execution
        )

        return True, f"AdSpark task sent: {task_result.id}, Status: {task_result.status}"
    except Exception as e:
        return False, f"AdSpark task test failed: {e}"


def test_ai_agent_tasks():
    """Test AI Agent task (only ensure signature can be created, do not execute)"""
    try:
        from ai_agent.tasks import generate_ad_variant_async

        # Note: do not actually send the task, just create a signature
        task_signature = generate_ad_variant_async.s(
            variant_id=1,
            original_ad_id="test",
            prompt="test prompt",
            user_id=1
        )

        return True, f"AI Agent task signature created successfully: {task_signature}"
    except Exception as e:
        return False, f"AI Agent task test failed: {e}"


def monitor_tasks(duration=60):
    """Monitor task execution over time"""
    print(f"Start monitoring tasks for {duration} seconds...")
    start_time = time.time()

    while time.time() - start_time < duration:
        try:
            inspect = app.control.inspect()

            # Get active tasks
            active_tasks = inspect.active() or {}
            total_active = sum(len(tasks) for tasks in active_tasks.values())

            # Get scheduled tasks
            scheduled_tasks = inspect.scheduled() or {}
            total_scheduled = sum(len(tasks) for tasks in scheduled_tasks.values())

            print(f"[{datetime.now().strftime('%H:%M:%S')}] "
                  f"Active tasks: {total_active}, Scheduled tasks: {total_scheduled}")

            time.sleep(5)  # Check every 5 seconds

        except KeyboardInterrupt:
            print("\nMonitoring stopped")
            break
        except Exception as e:
            print(f"Monitoring error: {e}")
            time.sleep(5)


def main():
    """Main entrypoint"""
    print("=" * 50)
    print("Celery System Monitoring & Testing")
    print("=" * 50)

    # 1. Check Redis connection
    print("\n1. Checking Redis connection...")
    success, message = check_redis_connection()
    print(f"   {'✅' if success else '❌'} {message}")

    if not success:
        print("   Please start Redis first: redis-server")
        return

    # 2. Check Celery Workers
    print("\n2. Checking Celery Workers...")
    success, message = check_celery_workers()
    print(f"   {'✅' if success else '❌'} {message}")

    if not success:
        print("   Start a worker: celery -A backend worker --loglevel=info")
        return

    # 3. Check task queues
    print("\n3. Checking task queues...")
    success, message = check_task_queues()
    print(f"   {'✅' if success else '❌'} {message}")

    # 4. Test basic tasks
    print("\n4. Testing basic tasks...")
    success, message = test_basic_task()
    print(f"   {'✅' if success else '❌'} {message}")

    # 5. Test AdSpark task
    print("\n5. Testing AdSpark task...")
    success, message = test_adspark_tasks()
    print(f"   {'✅' if success else '❌'} {message}")

    # 6. Test AI Agent task
    print("\n6. Testing AI Agent task...")
    success, message = test_ai_agent_tasks()
    print(f"   {'✅' if success else '❌'} {message}")

    print("\n" + "=" * 50)
    print("Tests complete!")

    # Ask whether to start monitoring
    choice = input("\nStart real-time monitoring? (y/N): ").lower()
    if choice in ['y', 'yes']:
        duration = input("Monitoring duration (seconds, default 60): ").strip()
        duration = int(duration) if duration.isdigit() else 60
        monitor_tasks(duration)


def get_task_status(task_id):
    """Get status of a specific task"""
    try:
        result = AsyncResult(task_id, app=app)
        return {
            'id': task_id,
            'status': result.status,
            'result': result.result if result.ready() else None,
            'traceback': result.traceback if result.failed() else None,
        }
    except Exception as e:
        return {'error': str(e)}


def purge_all_queues():
    """Purge all queues"""
    print("Warning: this will purge all task queues!")
    confirm = input("Are you sure you want to proceed? (yes/no): ").lower()

    if confirm == 'yes':
        try:
            app.control.purge()
            print("All queues purged")
        except Exception as e:
            print(f"Failed to purge queues: {e}")
    else:
        print("Operation cancelled")


def interactive_menu():
    """Interactive menu"""
    while True:
        print("\n" + "=" * 40)
        print("Celery Management Menu")
        print("=" * 40)
        print("1. Run full check")
        print("2. Check Workers status")
        print("3. View active tasks")
        print("4. View queue status")
        print("5. Send test tasks")
        print("6. Query task status")
        print("7. Start monitoring")
        print("8. Purge queues")
        print("9. Exit")

        choice = input("\nChoose an option (1-9): ").strip()

        if choice == '1':
            main()
        elif choice == '2':
            success, message = check_celery_workers()
            print(f"{'✅' if success else '❌'} {message}")
        elif choice == '3':
            try:
                inspect = app.control.inspect()
                active = inspect.active()
                if active:
                    for worker, tasks in active.items():
                        print(f"Worker {worker}: {len(tasks)} active task(s)")
                        for task in tasks:
                            print(f"  - {task['name']} ({task['id']})")
                else:
                    print("No active tasks")
            except Exception as e:
                print(f"Failed to get active tasks: {e}")
        elif choice == '4':
            success, message = check_task_queues()
            print(f"{'✅' if success else '❌'} {message}")
        elif choice == '5':
            success, message = test_basic_task()
            print(f"{'✅' if success else '❌'} {message}")
        elif choice == '6':
            task_id = input("Enter task ID: ").strip()
            if task_id:
                status = get_task_status(task_id)
                print(f"Task status: {status}")
        elif choice == '7':
            duration = input("Monitoring duration (seconds, default 60): ").strip()
            duration = int(duration) if duration.isdigit() else 60
            monitor_tasks(duration)
        elif choice == '8':
            purge_all_queues()
        elif choice == '9':
            print("Goodbye!")
            break
        else:
            print("Invalid choice, please try again")


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Celery monitoring and testing tool')
    parser.add_argument('--check', action='store_true', help='Run full check')
    parser.add_argument('--monitor', type=int, help='Monitor for N seconds')
    parser.add_argument('--interactive', action='store_true', help='Interactive menu')
    parser.add_argument('--task-id', help='Query a specific task status')

    args = parser.parse_args()

    if args.check:
        main()
    elif args.monitor:
        monitor_tasks(args.monitor)
    elif args.task_id:
        status = get_task_status(args.task_id)
        print(f"Task {args.task_id} status: {status}")
    elif args.interactive:
        interactive_menu()
    else:
        # Default: run full check
        main()
