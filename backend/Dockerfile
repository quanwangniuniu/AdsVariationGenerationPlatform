FROM python:3.11-slim

WORKDIR /app


RUN apt-get update && apt-get install -y \
    libmagic1 \
    libmagic-dev \
    gcc \
    g++ \
    curl \
    jq  \
    && rm -rf /var/lib/apt/lists/*


# Copy requirements first for better caching
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .


RUN python manage.py collectstatic --noinput

RUN adduser --disabled-password --gecos '' appuser && \
    chown -R appuser:appuser /app
USER appuser

RUN mkdir -p logs

# Expose port
EXPOSE 8000


# Create entrypoint script for production
RUN echo '#!/bin/bash\nset -e\nif [[ "$1" == "gunicorn" ]]; then\n    echo "Making migrations..."\n    python manage.py makemigrations\n    echo "Applying migrations..."\n    python manage.py migrate\n    echo "Starting production server..."\nelif [[ "$1" == "celery" ]]; then\n    echo "Starting Celery: $@"\n    python manage.py check --database=default\nelse\n    echo "Running: $@"\nfi\nexec "$@"' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "120", "backend.wsgi:application"]
