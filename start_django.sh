#!/bin/bash

# Django 启动脚本
# 支持两种模式：
# 1. docker-compose模式：启动gunicorn
# 2. 单容器模式：启动supervisor

cd /app/backend

# 确保数据目录存在并设置权限
mkdir -p /app/data/db /app/data/media /app/data/staticfiles
chown -R www-data:www-data /app/data

echo "等待数据库连接..."
python manage.py check --database default

echo "执行数据库迁移..."
python manage.py migrate --noinput

echo "收集静态文件..."
python manage.py collectstatic --noinput

echo "初始化系统..."
python manage.py init_system

# 根据参数决定启动模式
if [ "$1" = "supervisor" ]; then
    echo "启动 supervisor（单容器模式）..."
    exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
else
    echo "启动 Django 服务（docker-compose模式）..."
    exec gunicorn chewy_space.wsgi:application --bind 127.0.0.1:8020 --workers 2 --timeout 120
fi