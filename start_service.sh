#!/bin/bash

# FastAPI 启动脚本
# 支持两种模式：
# 1. docker-compose模式：启动 Uvicorn
# 2. 单容器模式：启动supervisor

set -e
cd /app/backend

# 确保数据目录存在并设置权限
mkdir -p /app/data/db /app/data/media /app/data/staticfiles
chown -R www-data:www-data /app/data

# 如果没有设置 SECRET_KEY，自动生成并持久化
if [ -z "$SECRET_KEY" ]; then
    KEY_FILE="/app/data/.secret_key"
    if [ -f "$KEY_FILE" ] && [ -s "$KEY_FILE" ]; then
        export SECRET_KEY=$(cat "$KEY_FILE")
    else
        export SECRET_KEY=$(python -c "import secrets,string; print(''.join(secrets.choice(string.ascii_letters+string.digits+'!@#\$%^&*(-_=+)') for _ in range(50)))")
        echo -n "$SECRET_KEY" > "$KEY_FILE"
    fi
    echo "SECRET_KEY 已自动生成"
fi

echo "等待数据库连接..."
python -m chewy_api.cli check

echo "执行数据库迁移..."
python -m chewy_api.cli migrate

echo "初始化系统..."
python -m chewy_api.cli init

# 初始化完成后确保数据目录权限正确（Uvicorn 以 www-data 运行）
chown -R www-data:www-data /app/data

# 根据参数决定启动模式
if [ "$1" = "supervisor" ]; then
    echo "启动 supervisor（单容器模式）..."
    exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
else
    echo "启动 FastAPI 服务（docker-compose模式）..."
    exec uvicorn chewy_api.app:app --host 0.0.0.0 --port 8020 --workers "${WEB_CONCURRENCY:-2}" --no-proxy-headers
fi
