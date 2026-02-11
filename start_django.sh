#!/bin/bash

# Django 启动脚本
# 支持两种模式：
# 1. docker-compose模式：启动gunicorn
# 2. 单容器模式：启动supervisor

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
python manage.py check --database default

echo "执行数据库迁移..."
python manage.py migrate --noinput

echo "收集静态文件..."
python manage.py collectstatic --noinput

echo "初始化系统..."
python manage.py init_system

# 初始化完成后确保数据目录权限正确（gunicorn 以 www-data 运行）
chown -R www-data:www-data /app/data

# 根据参数决定启动模式
if [ "$1" = "supervisor" ]; then
    echo "启动 supervisor（单容器模式）..."
    exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
else
    echo "启动 Django 服务（docker-compose模式）..."
    exec gunicorn chewy_space.wsgi:application --bind 127.0.0.1:8020 --workers 2 --timeout 120
fi