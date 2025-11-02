#!/bin/bash
# Development entrypoint script for Django backend
# This script handles database setup and starts appropriate services

set -e

echo "=== Development Mode ==="

# Function to wait for database
wait_for_db() {
    echo "Waiting for database connection..."

    # Wait for PostgreSQL to be ready
    while ! python -c "
import django
import os
import sys
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
from django.db import connection
try:
    connection.ensure_connection()
    print('Database connection successful!')
except Exception as e:
    print('Database not ready:', e)
    sys.exit(1)
" 2>/dev/null; do
        echo "Database not ready, waiting..."
        sleep 2
    done
}

# Wait for database to be ready
if [[ "$1" != "flower" ]] && [[ "$1" != "celery" ]]; then
    # Wait for database to be ready
    wait_for_db

    # Run migrations
    echo "Making migrations..."
    python manage.py makemigrations --noinput || true

    echo "Applying migrations..."
    python manage.py migrate --noinput || true
fi

# Handle different command types
if [[ "$1" == "runserver" ]]; then
    echo "Collecting static files..."
    python manage.py collectstatic --noinput --clear
    if [ $? -eq 0 ]; then
        echo "✅ Static files collected successfully"
    else
        echo "⚠️  Static files collection failed, but continuing..."
    fi

    echo "Starting Daphne ASGI server for development..."
    echo "HTTP: http://0.0.0.0:8000  |  WebSocket: ws://0.0.0.0:8000"
    exec daphne -b 0.0.0.0 -p 8000 backend.asgi:application

elif [[ "$1" == "celery" ]]; then
    echo "Starting Celery: $@"

    # Ensure database is accessible for Celery
    python manage.py check --database=default

    # Execute the celery command
    exec "$@"

elif [[ "$1" == "flower" ]]; then
    echo "Starting Flower monitoring interface..."
    exec celery --broker=redis://redis:6379/0 flower --port=5555

elif [[ "$1" == "shell" ]]; then
    echo "Starting Django shell..."
    exec python manage.py shell

elif [[ "$1" == "bash" ]]; then
    echo "Starting bash shell..."
    exec /bin/bash

else
    echo "Running custom command: $@"
    exec "$@"
fi
