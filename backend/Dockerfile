FROM m.daocloud.io/docker.io/python:3.13-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy project files
COPY pyproject.toml README.md ./
COPY chewy_space/ ./chewy_space/

# Configure PyPI mirror and install dependencies
ENV UV_INDEX_URL=https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple
RUN uv sync --no-dev

WORKDIR /app/chewy_space

# Collect static files
RUN uv run python manage.py collectstatic --noinput || true

EXPOSE 8020

# 支持通过环境变量配置 workers 数量
ENV GUNICORN_WORKERS=2

CMD ["sh", "-c", "uv run python manage.py migrate && uv run python manage.py init_system && uv run gunicorn --bind 0.0.0.0:8020 --workers 2 --access-logfile - --error-logfile - chewy_space.wsgi:application"]
