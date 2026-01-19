#!/bin/bash

# Django 启动脚本
# 执行数据库迁移和系统初始化

cd /app/backend

# 确保数据目录存在并设置权限
mkdir -p /app/data
chown -R www-data:www-data /app/data

echo "执行数据库迁移..."
python manage.py migrate

echo "初始化系统..."
python manage.py init_system

echo "启动 Django 服务..."
exec gunicorn chewy_space.wsgi:application --bind 127.0.0.1:8020 --workers 2 --timeout 120