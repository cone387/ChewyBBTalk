#!/usr/bin/env python
"""测试认证系统"""
import os
import sys
import django

# 设置 Django 环境
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'chewy_space'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'chewy_space.settings')
django.setup()

from bbtalk.authentication import create_user_with_password, authenticate_with_password
from bbtalk.models import User, Identity

print("=" * 60)
print("测试 User + Identity 认证系统")
print("=" * 60)

# 创建测试用户
print("\n1. 创建测试用户...")
try:
    user = create_user_with_password(
        username='testuser',
        password='testpass123',
        email='test@example.com',
        display_name='测试用户'
    )
    print(f"✓ 创建用户成功:")
except Exception as e:
    if 'UNIQUE constraint' in str(e):
        print(f"用户已存在，使用现有用户")
        user = User.objects.get(username='testuser')
    else:
        raise
print(f"  - ID: {user.id}")
print(f"  - Username: {user.username}")
print(f"  - Email: {user.email}")
print(f"  - Display Name: {user.display_name}")
print(f"  - Table: {User._meta.db_table}")

# 检查身份
print("\n2. 检查用户身份...")
identities = user.identities.all()
print(f"✓ 身份数量: {identities.count()}")
for identity in identities:
    print(f"  - 类型: {identity.get_identity_type_display()}")
    print(f"  - 标识符: {identity.identifier}")
    print(f"  - 已验证: {identity.is_verified}")
    print(f"  - 主身份: {identity.is_primary}")
    print(f"  - Table: {Identity._meta.db_table}")

# 测试正确密码认证
print("\n3. 测试正确密码认证...")
auth_user = authenticate_with_password('testuser', 'testpass123')
if auth_user:
    print(f"✓ 认证成功: {auth_user.username}")
else:
    print("✗ 认证失败")
    sys.exit(1)

# 测试错误密码
print("\n4. 测试错误密码...")
wrong_auth = authenticate_with_password('testuser', 'wrongpass')
if not wrong_auth:
    print("✓ 正确拒绝了错误密码")
else:
    print("✗ 意外通过了错误密码")
    sys.exit(1)

# 测试不存在的用户
print("\n5. 测试不存在的用户...")
no_user = authenticate_with_password('nouser', 'testpass123')
if not no_user:
    print("✓ 正确拒绝了不存在的用户")
else:
    print("✗ 意外通过了不存在的用户")
    sys.exit(1)

print("\n" + "=" * 60)
print("✓ 所有测试通过！")
print("=" * 60)
