FROM python:3.13-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy project files
COPY pyproject.toml uv.lock README.md ./
COPY chewy_api/ ./chewy_api/

# Install dependencies
RUN uv sync --frozen --no-dev

EXPOSE 8020

# 保留 GUNICORN_WORKERS 作为旧部署的兼容变量。
ENV WEB_CONCURRENCY=2

CMD ["sh", "-c", "uv run --frozen --no-dev python -m chewy_api.cli migrate && uv run --frozen --no-dev python -m chewy_api.cli init && exec uv run --frozen --no-dev uvicorn chewy_api.app:app --host 0.0.0.0 --port 8020 --workers ${GUNICORN_WORKERS:-${WEB_CONCURRENCY}} --no-proxy-headers"]
