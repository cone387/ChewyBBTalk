from rest_framework.authentication import BaseAuthentication
from rest_framework import exceptions
from django.conf import settings
from django.utils import timezone
from .models import User


class AutheliaAuthentication(BaseAuthentication):
    """
    Authelia 认证：从 HTTP 请求头中获取用户信息，自动创建或更新用户记录
    
    Authelia 通过反向代理认证后，会在请求头中注入：
    - Remote-User: 用户名
    - Remote-Email: 邮箱
    - Remote-Name: 全名
    - Remote-Groups: 用户组（逗号分隔）
    """
    
    def authenticate(self, request):
        # 获取 Authelia 注入的请求头
        username = request.META.get('HTTP_REMOTE_USER', '').strip()
        
        if not username:
            # 开发环境下支持直接使用测试请求头（用于本地开发）
            if settings.DEBUG:
                test_authelia_id = request.META.get('HTTP_X_AUTHELIA_USER_ID', '').strip()
                test_username = request.META.get('HTTP_X_USERNAME', '').strip()
                if test_authelia_id and test_username:
                    email = request.META.get('HTTP_X_EMAIL', '')
                    groups_str = request.META.get('HTTP_X_GROUPS', '')
                    groups = [g.strip() for g in groups_str.split(',') if g.strip()] if groups_str else []
                    
                    # 开发模式：获取或创建用户
                    user, created = User.objects.get_or_create(
                        authelia_user_id=test_authelia_id,
                        defaults={
                            'username': test_username,
                            'email': email,
                            'groups': groups,
                        }
                    )
                    
                    # 更新用户信息和最后登录时间
                    if not created:
                        user.username = test_username
                        user.email = email
                        user.groups = groups
                    user.last_login = timezone.now()
                    user.save(update_fields=['username', 'email', 'groups', 'last_login'])
                    
                    return (user, None)
            return None
        
        # 获取其他用户信息
        email = request.META.get('HTTP_REMOTE_EMAIL', '').strip()
        display_name = request.META.get('HTTP_REMOTE_NAME', '').strip()
        groups_str = request.META.get('HTTP_REMOTE_GROUPS', '').strip()
        
        # 解析用户组（逗号或分号分隔）
        groups = []
        if groups_str:
            separator = ',' if ',' in groups_str else ';'
            groups = [g.strip() for g in groups_str.split(separator) if g.strip()]
        
        # 使用 username 作为 authelia_user_id（Authelia 的用户名是唯一的）
        user, created = User.objects.get_or_create(
            authelia_user_id=username,
            defaults={
                'username': username,
                'email': email,
                'display_name': display_name,
                'groups': groups,
            }
        )
        
        # 更新用户信息和最后登录时间
        if not created:
            user.username = username
            user.email = email
            user.display_name = display_name
            user.groups = groups
        user.last_login = timezone.now()
        user.save(update_fields=['username', 'email', 'display_name', 'groups', 'last_login'])
        
        return (user, None)
    
    def authenticate_header(self, request):
        return 'Remote-User'
