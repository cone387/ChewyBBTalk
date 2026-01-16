#!/usr/bin/env python
"""测试 JWT Token 认证"""
import os
import sys
import django

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'chewy_space'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'chewy_space.settings')
django.setup()

from rest_framework_simplejwt.tokens import RefreshToken
from bbtalk.models import User

print("=" * 60)
print("测试 JWT Token 认证")
print("=" * 60)

# 获取测试用户
print("\n1. 获取测试用户...")
try:
    user = User.objects.get(username='testuser')
    print(f"✓ 用户: {user.username} (ID: {user.id})")
except User.DoesNotExist:
    print("✗ 测试用户不存在，请先运行 test_auth.py")
    sys.exit(1)

# 生成 JWT Token
print("\n2. 生成 JWT Token...")
refresh = RefreshToken.for_user(user)
access_token = str(refresh.access_token)
refresh_token = str(refresh)

print(f"✓ Access Token (前50字符): {access_token[:50]}...")
print(f"✓ Refresh Token (前50字符): {refresh_token[:50]}...")

# 解析 Access Token
print("\n3. 解析 Access Token...")
from rest_framework_simplejwt.tokens import AccessToken
try:
    token = AccessToken(access_token)
    print(f"✓ User ID: {token['user_id']}")
    print(f"✓ Token Type: {token['token_type']}")
    print(f"✓ JTI: {token['jti']}")
    print(f"✓ Expires: {token['exp']}")
except Exception as e:
    print(f"✗ 解析失败: {e}")
    sys.exit(1)

# 测试 Token 刷新
print("\n4. 测试 Token 刷新...")
try:
    new_refresh = RefreshToken(refresh_token)
    new_access_token = str(new_refresh.access_token)
    print(f"✓ 新 Access Token (前50字符): {new_access_token[:50]}...")
except Exception as e:
    print(f"✗ 刷新失败: {e}")
    sys.exit(1)

# 测试 Token 黑名单
print("\n5. 测试 Token 黑名单...")
try:
    # 创建一个新的 token 用于测试
    test_refresh = RefreshToken.for_user(user)
    test_refresh_str = str(test_refresh)
    
    # 加入黑名单
    test_refresh.blacklist()
    print("✓ Token 已加入黑名单")
    
    # 尝试使用已加入黑名单的 token
    try:
        blacklisted_refresh = RefreshToken(test_refresh_str)
        print("✗ 黑名单 Token 仍然可用（不应该发生）")
    except Exception as e:
        print(f"✓ 黑名单 Token 已失效: {type(e).__name__}")
except Exception as e:
    print(f"✗ 黑名单测试失败: {e}")

print("\n" + "=" * 60)
print("✓ JWT Token 认证测试完成！")
print("=" * 60)
