from rest_framework.authentication import BaseAuthentication
from rest_framework import exceptions
from django.conf import settings
from django.utils import timezone
from django.contrib.auth.backends import BaseBackend
from drf_spectacular.extensions import OpenApiAuthenticationExtension
import jwt
import requests
import logging
from .models import User

logger = logging.getLogger(__name__)

# JWKS 缓存
_jwks_cache = None
_jwks_cache_time = None
JWKS_CACHE_TTL = 3600  # 1小时


def get_jwks():
    """获取 Authelia 的 JWKS（带缓存）"""
    global _jwks_cache, _jwks_cache_time
    import time
    
    now = time.time()
    if _jwks_cache and _jwks_cache_time and (now - _jwks_cache_time) < JWKS_CACHE_TTL:
        return _jwks_cache
    
    authelia_url = getattr(settings, 'AUTHELIA_ISSUER_URL', 'http://authelia:9091/authelia')
    # Authelia 的 JWKS 端点是 /jwks.json，不是 /.well-known/jwks.json
    jwks_url = f"{authelia_url}/jwks.json"
    
    try:
        response = requests.get(jwks_url, timeout=10)
        response.raise_for_status()
        _jwks_cache = response.json()
        _jwks_cache_time = now
        return _jwks_cache
    except Exception as e:
        logger.error(f"Failed to fetch JWKS from {jwks_url}: {e}")
        if _jwks_cache:
            return _jwks_cache
        raise exceptions.AuthenticationFailed(f"Unable to fetch JWKS: {e}")


class OIDCAuthentication(BaseAuthentication):
    """
    OIDC JWT 认证：验证 Authelia 签发的 JWT Token
    
    前端通过 OIDC 流程获取 access_token，通过 Authorization: Bearer <token> 头传递
    """
    
    def authenticate(self, request):
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        
        if not auth_header.startswith('Bearer '):
            return None
        
        token = auth_header[7:].strip()
        if not token:
            return None
        
        try:
            # 获取 JWKS 并解码 token
            jwks = get_jwks()
            
            # 获取 token 头部以确定使用哪个 key
            unverified_header = jwt.get_unverified_header(token)
            kid = unverified_header.get('kid')
            
            # 查找匹配的 key
            rsa_key = None
            for key in jwks.get('keys', []):
                if key.get('kid') == kid:
                    rsa_key = jwt.algorithms.RSAAlgorithm.from_jwk(key)
                    break
            
            if not rsa_key:
                # 如果没有找到匹配的 kid，尝试使用第一个 key
                if jwks.get('keys'):
                    rsa_key = jwt.algorithms.RSAAlgorithm.from_jwk(jwks['keys'][0])
                else:
                    raise exceptions.AuthenticationFailed('No valid key found in JWKS')
            
            # 验证并解码 token
            # 注意：跳过 issuer 验证，因为 Authelia 返回的 issuer 可能与容器内部地址不同
            payload = jwt.decode(
                token,
                rsa_key,
                algorithms=['RS256'],
                audience='bbtalk',
                options={
                    'verify_exp': True,
                    'verify_iss': False,  # 跳过 issuer 验证
                }
            )
            
            # 从 payload 提取用户信息
            subject = payload.get('sub', '')
            email = payload.get('email', '')
            name = payload.get('name', '') or payload.get('preferred_username', '')
            groups = payload.get('groups', [])
            
            if not subject:
                raise exceptions.AuthenticationFailed('Token missing subject')
            
            # 获取或创建用户
            user, created = User.objects.get_or_create(
                authelia_user_id=subject,
                defaults={
                    'username': subject,
                    'email': email,
                    'display_name': name,
                    'groups': groups if isinstance(groups, list) else [],
                }
            )
            
            # 更新用户信息
            if not created:
                user.email = email
                if name:
                    user.display_name = name
                user.groups = groups if isinstance(groups, list) else []
            user.last_login = timezone.now()
            user.save(update_fields=['email', 'display_name', 'groups', 'last_login'])
            
            return (user, token)
            
        except jwt.ExpiredSignatureError:
            raise exceptions.AuthenticationFailed('Token has expired')
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid token: {e}")
            raise exceptions.AuthenticationFailed(f'Invalid token: {e}')
        except Exception as e:
            logger.error(f"Authentication error: {e}")
            raise exceptions.AuthenticationFailed(f'Authentication failed: {e}')
    
    def authenticate_header(self, request):
        return 'Bearer'


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
            from django.contrib.auth import authenticate, login
            
            # 检查当前用户是否是我们的 User 模型
            is_valid_user = (
                request.user.is_authenticated and 
                isinstance(request.user, User)
            )
            
            if not is_valid_user:
                # 尝试从 Authelia 头部认证
                user = authenticate(request)
                if user:
                    login(request, user)
                    request.user = user
        
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


class OIDCAuthenticationScheme(OpenApiAuthenticationExtension):
    """
    DRF Spectacular 的 OIDC 认证扩展
    """
    target_class = 'bbtalk.authentication.OIDCAuthentication'
    name = 'OIDCAuth'
    
    def get_security_definition(self, auto_schema):
        return {
            'type': 'oauth2',
            'flows': {
                'authorizationCode': {
                    'authorizationUrl': '/authelia/api/oidc/authorization',
                    'tokenUrl': '/authelia/api/oidc/token',
                    'scopes': {
                        'openid': 'OpenID Connect',
                        'profile': '用户信息',
                        'email': '邮箱',
                        'groups': '用户组',
                    }
                }
            },
            'description': 'OIDC Bearer Token 认证，通过 Authelia 获取 access_token'
        }
