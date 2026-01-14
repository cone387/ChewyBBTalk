from rest_framework.authentication import BaseAuthentication
from rest_framework import exceptions
from django.conf import settings
from django.utils import timezone
from django.contrib.auth.backends import BaseBackend
from drf_spectacular.extensions import OpenApiAuthenticationExtension
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


class AutheliaAuthBackend(BaseBackend):
    """
    Django 认证后端：支持 Authelia 头部认证
    用于 Django admin 等需要 Django 原生认证的场景
    """
    
    def authenticate(self, request, **kwargs):
        """从请求头获取 Authelia 用户信息"""
        if request is None:
            return None
        
        # 获取 Authelia 注入的请求头
        username = request.META.get('HTTP_REMOTE_USER', '').strip()
        
        if not username:
            # 开发环境下支持直接使用测试请求头
            if settings.DEBUG:
                test_authelia_id = request.META.get('HTTP_X_AUTHELIA_USER_ID', '').strip()
                test_username = request.META.get('HTTP_X_USERNAME', '').strip()
                if test_authelia_id and test_username:
                    return self._get_or_create_user(
                        authelia_user_id=test_authelia_id,
                        username=test_username,
                        email=request.META.get('HTTP_X_EMAIL', ''),
                        display_name='',
                        groups_str=request.META.get('HTTP_X_GROUPS', '')
                    )
            return None
        
        # 获取其他用户信息
        email = request.META.get('HTTP_REMOTE_EMAIL', '').strip()
        display_name = request.META.get('HTTP_REMOTE_NAME', '').strip()
        groups_str = request.META.get('HTTP_REMOTE_GROUPS', '').strip()
        
        return self._get_or_create_user(
            authelia_user_id=username,
            username=username,
            email=email,
            display_name=display_name,
            groups_str=groups_str
        )
    
    def _get_or_create_user(self, authelia_user_id, username, email, display_name, groups_str):
        """获取或创建用户"""
        # 解析用户组
        groups = []
        if groups_str:
            separator = ',' if ',' in groups_str else ';'
            groups = [g.strip() for g in groups_str.split(separator) if g.strip()]
        
        user, created = User.objects.get_or_create(
            authelia_user_id=authelia_user_id,
            defaults={
                'username': username,
                'email': email,
                'display_name': display_name,
                'groups': groups,
            }
        )
        
        # 更新用户信息
        if not created:
            user.username = username
            user.email = email
            if display_name:
                user.display_name = display_name
            user.groups = groups
        user.last_login = timezone.now()
        user.save(update_fields=['username', 'email', 'display_name', 'groups', 'last_login'])
        
        return user
    
    def get_user(self, user_id):
        """通过 ID 获取用户"""
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None


class AutheliaAdminMiddleware:
    """
    中间件：自动为 admin 页面进行 Authelia 认证
    当访问 admin 时，自动从请求头登录用户
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        # 只处理 admin 路径
        if request.path.startswith('/admin/'):
            # 如果用户未登录，尝试从 Authelia 头部认证
            if not request.user.is_authenticated:
                from django.contrib.auth import authenticate, login
                user = authenticate(request)
                if user:
                    login(request, user)
        
        return self.get_response(request)


class AutheliaAuthenticationScheme(OpenApiAuthenticationExtension):
    """
    DRF Spectacular 的 Authelia 认证扩展
    用于生成正确的 OpenAPI 文档
    """
    target_class = 'bbtalk.authentication.AutheliaAuthentication'
    name = 'AutheliaAuth'
    
    def get_security_definition(self, auto_schema):
        """
        定义 OpenAPI 安全方案
        """
        return {
            'type': 'apiKey',
            'in': 'header',
            'name': 'Remote-User',
            'description': (
                'Authelia 认证通过反向代理注入的用户信息。'
                '开发环境可使用以下测试请求头：\n'
                '- X-Authelia-User-Id: 用户ID\n'
                '- X-Username: 用户名\n'
                '- X-Email: 邮箱\n'
                '- X-Groups: 用户组（逗号分隔）'
            )
        }
