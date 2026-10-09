FROM python:3.13-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy project files
COPY pyproject.toml uv.lock README.md cli.py ./
COPY chewy_space/ ./chewy_space/

# Install dependencies
RUN uv sync --frozen --no-dev

WORKDIR /app/chewy_space

# Collect static files
RUN uv run --frozen --no-dev python manage.py collectstatic --noinput

EXPOSE 8020

# 保留 GUNICORN_WORKERS 作为旧部署的兼容变量。
ENV WEB_CONCURRENCY=2

CMD ["sh", "-c", "uv run --frozen --no-dev python manage.py migrate --noinput && uv run --frozen --no-dev python manage.py init_system && exec uv run --frozen --no-dev uvicorn chewy_space.asgi:application --host 0.0.0.0 --port 8020 --workers ${GUNICORN_WORKERS:-${WEB_CONCURRENCY}} --no-proxy-headers"]
