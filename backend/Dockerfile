FROM python:3.13-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy project files
COPY pyproject.toml .
COPY chewy_space/ ./chewy_space/

# Install dependencies using uv
RUN uv sync --no-dev

WORKDIR /app/chewy_space

# Collect static files
RUN uv run python manage.py collectstatic --noinput || true

EXPOSE 8000

CMD ["uv", "run", "gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "chewy_space.wsgi:application"]
