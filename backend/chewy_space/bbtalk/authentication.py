import jwt
import requests
from rest_framework.authentication import BaseAuthentication
from rest_framework import exceptions
from django.conf import settings
from functools import lru_cache


class KeycloakUser:
    """轻量级用户对象，不存数据库，只满足 DRF 认证要求"""
    
    def __init__(self, user_id: str, username: str, email: str = ''):
        self.id = user_id
        self.pk = user_id
        self.username = username
        self.email = email
    
    @property
    def is_authenticated(self):
        return True
    
    @property
    def is_anonymous(self):
        return False
    
    def __str__(self):
        return self.username


class KeycloakAuthentication(BaseAuthentication):
    """
    Keycloak JWT Token 认证
    """
    
    @lru_cache(maxsize=1)
    def get_keycloak_public_key(self):
        """获取 Keycloak 公钥"""
        keycloak_url = getattr(settings, 'KEYCLOAK_URL', None)
        realm = getattr(settings, 'KEYCLOAK_REALM', None)
        
        if not keycloak_url or not realm:
            return None
            
        try:
            url = f"{keycloak_url}/realms/{realm}"
            response = requests.get(url, timeout=5)
            response.raise_for_status()
            realm_info = response.json()
            public_key = f"-----BEGIN PUBLIC KEY-----\n{realm_info['public_key']}\n-----END PUBLIC KEY-----"
            return public_key
        except Exception as e:
            print(f"Failed to get Keycloak public key: {e}")
            return None
    
    def authenticate(self, request):
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        
        if not auth_header.startswith('Bearer '):
            return None
        
        token = auth_header.split(' ')[1]
        
        try:
            public_key = self.get_keycloak_public_key()
            if not public_key:
                return None
            
            # 验证 JWT token
            payload = jwt.decode(
                token,
                public_key,
                algorithms=['RS256'],
                audience='account',
                options={'verify_aud': False}
            )
            
            # 构建轻量级用户对象
            user_id = payload.get('sub')
            username = payload.get('preferred_username') or user_id
            email = payload.get('email', '')
            
            user = KeycloakUser(user_id=user_id, username=username, email=email)
            
            return (user, None)
            
        except jwt.ExpiredSignatureError:
            raise exceptions.AuthenticationFailed('Token has expired')
        except jwt.InvalidTokenError as e:
            raise exceptions.AuthenticationFailed(f'Invalid token: {str(e)}')
        except Exception as e:
            raise exceptions.AuthenticationFailed(f'Authentication failed: {str(e)}')
    
    def authenticate_header(self, request):
        return 'Bearer'
