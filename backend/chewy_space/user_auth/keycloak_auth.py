import jwt
import requests
from rest_framework.authentication import BaseAuthentication
from rest_framework import exceptions
from django.contrib.auth import get_user_model
from django.conf import settings
from functools import lru_cache

User = get_user_model()


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
            
            # 获取或创建用户
            username = payload.get('preferred_username') or payload.get('sub')
            email = payload.get('email', '')
            
            user, created = User.objects.get_or_create(
                username=username,
                defaults={'email': email}
            )
            
            return (user, None)
            
        except jwt.ExpiredSignatureError:
            raise exceptions.AuthenticationFailed('Token has expired')
        except jwt.InvalidTokenError as e:
            raise exceptions.AuthenticationFailed(f'Invalid token: {str(e)}')
        except Exception as e:
            raise exceptions.AuthenticationFailed(f'Authentication failed: {str(e)}')
    
    def authenticate_header(self, request):
        return 'Bearer'
