#!/usr/bin/env python
"""检查数据库表结构"""
import os
import sys
import django

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'chewy_space'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'chewy_space.settings')
django.setup()

from django.db import connection

print("=" * 60)
print("数据库表列表")
print("=" * 60)

with connection.cursor() as cursor:
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
    tables = cursor.fetchall()
    
    cb_tables = [t[0] for t in tables if t[0].startswith('cb_')]
    other_tables = [t[0] for t in tables if not t[0].startswith('cb_') and not t[0].startswith('sqlite_')]
    
    print("\n✓ CB 相关表:")
    for table in cb_tables:
        print(f"  - {table}")
    
    print("\n✓ Django 系统表:")
    for table in other_tables:
        print(f"  - {table}")

print("\n" + "=" * 60)
print("✓ 表名检查完成")
print("=" * 60)
