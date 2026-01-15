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
