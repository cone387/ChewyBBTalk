FROM python:3.13-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy project files
COPY pyproject.toml uv.lock README.md ./
COPY main.py application.py ./
COPY api/ ./api/
COPY services/ ./services/
COPY models/ ./models/
COPY schemas/ ./schemas/
COPY core/ ./core/
COPY database/ ./database/
COPY storage/ ./storage/
COPY backups/ ./backups/
COPY admin/ ./admin/
COPY cli/ ./cli/
COPY templates/ ./templates/

# Install dependencies
RUN uv sync --frozen --no-dev

EXPOSE 8020

# 保留 GUNICORN_WORKERS 作为旧部署的兼容变量。
ENV WEB_CONCURRENCY=2

CMD ["sh", "-c", "uv run --frozen --no-dev python -m cli migrate && uv run --frozen --no-dev python -m cli init && exec uv run --frozen --no-dev uvicorn main:app --host 0.0.0.0 --port 8020 --workers ${GUNICORN_WORKERS:-${WEB_CONCURRENCY}} --no-proxy-headers"]
