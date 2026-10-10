#!/bin/bash

# FastAPI 启动脚本
# 支持两种模式：
# 1. docker-compose模式：启动 Uvicorn
# 2. 单容器模式：启动supervisor

set -e
cd /app/backend
export WEB_CONCURRENCY="${WEB_CONCURRENCY:-2}"
export NGINX_CLIENT_MAX_BODY_SIZE="${NGINX_CLIENT_MAX_BODY_SIZE:-513M}"
if [[ ! "$NGINX_CLIENT_MAX_BODY_SIZE" =~ ^[0-9]+[kKmMgG]?$ ]]; then
    echo "Invalid NGINX_CLIENT_MAX_BODY_SIZE" >&2
    exit 1
fi
sed "s/\${NGINX_CLIENT_MAX_BODY_SIZE}/$NGINX_CLIENT_MAX_BODY_SIZE/g" \
    /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Normalize configured paths and let the native configuration persist its key.
export SECRET_KEY="${SECRET_KEY:-}"
DATA_DIR=$(python -c "from core.config import Settings; print(Settings().data_dir)")
MEDIA_ROOT=$(python -c "from core.config import Settings; print(Settings().media_root)")
export DATA_DIR MEDIA_ROOT
mkdir -p /app/data/db /app/data/staticfiles "$DATA_DIR" "$MEDIA_ROOT"
chown -R www-data:www-data /app/data "$DATA_DIR" "$MEDIA_ROOT"

echo "等待数据库连接..."
python -m cli check

echo "执行数据库迁移..."
python -m cli migrate

echo "初始化系统..."
python -m cli init

# 初始化完成后确保数据目录权限正确（Uvicorn 以 www-data 运行）
chown -R www-data:www-data /app/data "$DATA_DIR" "$MEDIA_ROOT"

# 根据参数决定启动模式
if [ "$1" = "supervisor" ]; then
    echo "启动 supervisor（单容器模式）..."
    exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
else
    echo "启动 FastAPI 服务（docker-compose模式）..."
    exec uvicorn main:app --host 0.0.0.0 --port 8020 --workers "${WEB_CONCURRENCY:-2}" --no-proxy-headers
fi
