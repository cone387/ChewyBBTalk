# ================================
# 单容器部署：Django + 前端 + Nginx
# ================================
# Quickstart:
#   docker run -d -p 4010:4010 -v bbtalk_data:/app/data ghcr.io/cone387/chewybbtalk
#
# 默认管理员账号: admin / admin123
# 访问: http://localhost:4010

# ================================
# 后端构建阶段
# ================================
FROM python:3.13-slim AS backend-builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

# 复制后端代码
COPY backend/pyproject.toml backend/uv.lock* ./

# 安装 uv 和依赖
ARG PIP_INDEX_URL=https://pypi.org/simple
RUN pip install --no-cache-dir uv && \
    uv pip install --system -r pyproject.toml

COPY backend/chewy_space ./chewy_space

# 收集静态文件
WORKDIR /app/chewy_space
ENV MEDIA_ROOT=/app/media
ENV STATIC_ROOT=/app/staticfiles
RUN python manage.py collectstatic --noinput


# ================================
# 前端构建阶段
# ================================
FROM node:22-alpine AS frontend-builder

WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./

# 复制根目录 .env 供 Vite 构建时读取 VITE_* 变量
COPY .env* ./

# 通过 ARG 触发缓存失效：当 .env 变化时，后续步骤会重新执行
ARG ENV_HASH=default
RUN echo "ENV_HASH: $ENV_HASH" && \
    cat .env 2>/dev/null | grep "^VITE_" || echo "Warning: No VITE_ vars in .env"

# 构建前端
RUN npm run build


# ================================
# 最终运行阶段
# ================================
FROM python:3.13-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    libpq5 \
    curl \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

# 安装gunicorn
RUN pip install --no-cache-dir gunicorn

# 复制后端依赖和代码
COPY --from=backend-builder /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=backend-builder /usr/local/bin /usr/local/bin
COPY --from=backend-builder /app/chewy_space /app/backend
COPY --from=backend-builder /app/staticfiles /app/staticfiles

# 复制前端构建产物
COPY --from=frontend-builder /app/dist /app/frontend

# 复制配置文件
COPY nginx.conf /etc/nginx/nginx.conf
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY start_django.sh /app/start_django.sh

# 创建必要的目录和设置权限
RUN sed -i 's/\r$//' /app/start_django.sh && \
    sed -i 's/\r$//' /etc/supervisor/conf.d/supervisord.conf && \
    mkdir -p /app/data/media /app/data/staticfiles /app/data/db /run/nginx && \
    chown -R www-data:www-data /app/data && \
    chown -R nobody:nogroup /run/nginx && \
    chmod +x /app/start_django.sh

# 所有运行时数据统一在 /app/data (挂载卷即可持久化)
ENV MEDIA_ROOT=/app/data/media
ENV STATIC_ROOT=/app/data/staticfiles
ENV DATABASE_URL=sqlite:////app/data/db/db.sqlite3
ENV DATA_DIR=/app/data
ENV DEBUG=false
ENV ALLOWED_HOSTS=*

# 暴露端口
EXPOSE 4010

# 启动容器
CMD ["/app/start_django.sh", "supervisor"]
