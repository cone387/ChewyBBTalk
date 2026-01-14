from rest_framework.authentication import BaseAuthentication
from rest_framework import exceptions
from django.conf import settings


class AutheliaUser:
    """轻量级用户对象，不存数据库，只满足 DRF 认证要求"""
    
    def __init__(self, user_id: str, username: str, email: str = '', groups: list = None):
        self.id = user_id
        self.pk = user_id
        self.username = username
        self.email = email
        self.groups = groups or []
    
    @property
    def is_authenticated(self):
        return True
    
    @property
    def is_anonymous(self):
        return False
    
    @property
    def is_staff(self):
        # 如果用户在 admin 组中，则认为是 staff
        return 'admin' in self.groups or 'admins' in self.groups
    
    def __str__(self):
        return self.username


class AutheliaAuthentication(BaseAuthentication):
    """
    Authelia 认证：从 HTTP 请求头中获取用户信息
    
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
            # 开发环境下支持直接使用 X-User-Id（用于测试）
            if settings.DEBUG:
                test_user_id = request.META.get('HTTP_X_USER_ID', '').strip()
                test_username = request.META.get('HTTP_X_USERNAME', '').strip()
                if test_user_id and test_username:
                    email = request.META.get('HTTP_X_EMAIL', '')
                    groups_str = request.META.get('HTTP_X_GROUPS', '')
                    groups = [g.strip() for g in groups_str.split(',') if g.strip()] if groups_str else []
                    user = AutheliaUser(
                        user_id=test_user_id,
                        username=test_username,
                        email=email,
                        groups=groups
                    )
                    return (user, None)
            return None
        
        # 获取其他用户信息
        email = request.META.get('HTTP_REMOTE_EMAIL', '').strip()
        groups_str = request.META.get('HTTP_REMOTE_GROUPS', '').strip()
        
        # 解析用户组（逗号或分号分隔）
        groups = []
        if groups_str:
            # Authelia 可能使用逗号或分号分隔
            separator = ',' if ',' in groups_str else ';'
            groups = [g.strip() for g in groups_str.split(separator) if g.strip()]
        
        # 使用 username 作为 user_id（Authelia 不提供独立的 user_id）
        user = AutheliaUser(
            user_id=username,
            username=username,
            email=email,
            groups=groups
        )
        
        return (user, None)
    
    def authenticate_header(self, request):
        return 'Remote-User'
