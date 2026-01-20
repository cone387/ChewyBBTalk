# ================================
# 单容器部署：Django + 前端 + Nginx
# ================================

FROM m.daocloud.io/docker.io/python:3.13-slim AS backend-builder

WORKDIR /app

# 使用国内镜像源
RUN sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 复制后端代码
COPY backend/pyproject.toml backend/uv.lock* ./

# 安装 uv 和依赖（使用国内源）
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple uv && \
    uv pip install --system -r pyproject.toml --index-url https://pypi.tuna.tsinghua.edu.cn/simple

COPY backend/chewy_space ./chewy_space

# 收集静态文件并初始化系统
WORKDIR /app/chewy_space
ENV MEDIA_ROOT=/app/media
ENV STATIC_ROOT=/app/staticfiles
RUN python manage.py collectstatic --noinput


# ================================
# 前端构建阶段
# ================================
FROM m.daocloud.io/docker.io/node:18-alpine AS frontend-builder

WORKDIR /app

# 使用国内npm源
RUN npm config set registry https://registry.npmmirror.com

COPY frontend/package*.json ./
RUN npm ci --only=production

COPY frontend/ ./

# 构建前端
RUN npm run build


# ================================
# 最终运行阶段
# ================================
FROM m.daocloud.io/docker.io/python:3.13-slim

WORKDIR /app

# 使用国内镜像源并安装运行时依赖
RUN sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    libpq5 \
    curl \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

# 安装gunicorn
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple gunicorn

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
RUN mkdir -p /app/media /app/staticfiles /data /run/nginx && \
    chown -R www-data:www-data /app/media /app/staticfiles && \
    chown -R nobody:nogroup /data && \
    chmod +x /app/start_django.sh

# 暴露端口
EXPOSE 4010

# 启动 supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
