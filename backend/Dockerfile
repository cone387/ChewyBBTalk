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

EXPOSE 8000

CMD ["uv", "run", "gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "chewy_space.wsgi:application"]
