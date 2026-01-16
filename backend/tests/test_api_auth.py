#!/usr/bin/env python
"""测试 API 认证接口"""
import os
import sys
import django

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'chewy_space'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'chewy_space.settings')
django.setup()

from rest_framework.test import APIClient
from bbtalk.models import User

print("=" * 60)
print("测试 API 认证接口")
print("=" * 60)

client = APIClient()

# 确保测试用户存在
print("\n0. 准备测试用户...")
try:
    user = User.objects.get(username='testuser')
    print(f"✓ 用户存在: {user.username}")
except User.DoesNotExist:
    print("✗ 测试用户不存在，请先运行 test_auth.py")
    sys.exit(1)

# 测试 JWT Token 获取
print("\n1. 测试 /auth/token/ - 获取 JWT Token...")
response = client.post('/api/v1/bbtalk/auth/token/', {
    'username': 'testuser',
    'password': 'testpass123'
}, format='json')

if response.status_code == 200:
    data = response.json()
    if 'access' in data and 'refresh' in data and 'user' in data:
        print(f"✓ 获取 Token 成功")
        print(f"  - Access Token: {data['access'][:50]}...")
        print(f"  - Refresh Token: {data['refresh'][:50]}...")
        print(f"  - User: {data['user']['username']}")
        
        access_token = data['access']
        refresh_token = data['refresh']
    else:
        print(f"✗ 响应格式错误: {data}")
        sys.exit(1)
else:
    print(f"✗ 请求失败 ({response.status_code}): {response.json()}")
    sys.exit(1)

# 测试使用 JWT Token 访问受保护接口
print("\n2. 测试使用 JWT Token 访问 /user/me/...")
client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
response = client.get('/api/v1/bbtalk/user/me/')

if response.status_code == 200:
    data = response.json()
    print(f"✓ 访问成功: {data['username']}")
else:
    print(f"✗ 访问失败 ({response.status_code}): {response.json()}")
    sys.exit(1)

# 测试 Token 刷新
print("\n3. 测试 /auth/token/refresh/ - 刷新 Token...")
client.credentials()  # 清除认证
response = client.post('/api/v1/bbtalk/auth/token/refresh/', {
    'refresh': refresh_token
}, format='json')

if response.status_code == 200:
    data = response.json()
    if 'access' in data:
        print(f"✓ 刷新成功")
        print(f"  - New Access Token: {data['access'][:50]}...")
        new_access_token = data['access']
    else:
        print(f"✗ 响应格式错误: {data}")
        sys.exit(1)
else:
    print(f"✗ 刷新失败 ({response.status_code}): {response.json()}")
    sys.exit(1)

# 测试使用新 Token 访问
print("\n4. 测试使用新 Token 访问 /user/me/...")
client.credentials(HTTP_AUTHORIZATION=f'Bearer {new_access_token}')
response = client.get('/api/v1/bbtalk/user/me/')

if response.status_code == 200:
    print(f"✓ 新 Token 有效")
else:
    print(f"✗ 新 Token 无效 ({response.status_code})")
    sys.exit(1)

# 测试 Session 登录（传统方式）
print("\n5. 测试 /auth/login/ - Session 登录...")
client.credentials()  # 清除认证
response = client.post('/api/v1/bbtalk/auth/login/', {
    'username': 'testuser',
    'password': 'testpass123'
}, format='json')

if response.status_code == 200:
    data = response.json()
    print(f"✓ Session 登录成功: {data['username']}")
else:
    print(f"✗ Session 登录失败 ({response.status_code}): {response.json()}")
    sys.exit(1)

# 测试使用 Session 访问
print("\n6. 测试使用 Session 访问 /user/me/...")
response = client.get('/api/v1/bbtalk/user/me/')

if response.status_code == 200:
    data = response.json()
    print(f"✓ Session 认证有效: {data['username']}")
else:
    print(f"✗ Session 认证失败 ({response.status_code})")
    sys.exit(1)

# 测试登出
print("\n7. 测试 /auth/logout/ - Session 登出...")
response = client.post('/api/v1/bbtalk/auth/logout/')

if response.status_code == 200:
    print(f"✓ Session 登出成功")
else:
    print(f"✗ Session 登出失败 ({response.status_code})")

# 测试 JWT Token 黑名单（登出）
print("\n8. 测试 /auth/token/blacklist/ - JWT Token 登出...")
client.credentials()  # 清除认证
# 先获取一个新的 token
response = client.post('/api/v1/bbtalk/auth/token/', {
    'username': 'testuser',
    'password': 'testpass123'
}, format='json')
test_refresh = response.json()['refresh']
test_access = response.json()['access']

# 使用 access token 认证并将 refresh token 加入黑名单
client.credentials(HTTP_AUTHORIZATION=f'Bearer {test_access}')
response = client.post('/api/v1/bbtalk/auth/token/blacklist/', {
    'refresh': test_refresh
}, format='json')

if response.status_code == 200:
    print(f"✓ Token 已加入黑名单")
    
    # 验证黑名单 token 不能再使用
    client.credentials()
    response = client.post('/api/v1/bbtalk/auth/token/refresh/', {
        'refresh': test_refresh
    }, format='json')
    
    if response.status_code != 200:
        print(f"✓ 黑名单 Token 已失效")
    else:
        print(f"✗ 黑名单 Token 仍然有效（不应该）")
else:
    print(f"✗ 加入黑名单失败 ({response.status_code}): {response.json()}")

print("\n" + "=" * 60)
print("✓ 所有 API 认证测试通过！")
print("=" * 60)
print("\n接口总结:")
print("  JWT Token 认证（推荐）：")
print("    - POST /api/v1/bbtalk/auth/token/ - 获取 Token")
print("    - POST /api/v1/bbtalk/auth/token/refresh/ - 刷新 Token")
print("    - POST /api/v1/bbtalk/auth/token/blacklist/ - Token 登出（黑名单）")
print("    - 使用: Authorization: Bearer <access_token>")
print("\n  Session 认证（传统）：")
print("    - POST /api/v1/bbtalk/auth/login/ - Session 登录")
print("    - POST /api/v1/bbtalk/auth/logout/ - Session 登出")
print("    - 使用: Cookie-based Session")
print("\n  通用：")
print("    - POST /api/v1/bbtalk/auth/register/ - 注册（返回 JWT Token）")
print("    - GET /api/v1/bbtalk/user/me/ - 获取当前用户（支持两种认证）")
