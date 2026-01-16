"""
认证系统：基于 Session/Token 的用户认证

支持：
1. Session 认证（Cookie-based）
2. Token 认证（Bearer Token）
"""

from rest_framework import authentication, exceptions
from rest_framework.authentication import SessionAuthentication as DRFSessionAuthentication
from django.contrib.auth.backends import BaseBackend
from django.utils import timezone
from .models import User, Identity


class UserBackend(BaseBackend):
    """
    Django 认证后端：用于 Django Admin 和 Session 认证
    
    支持使用用户名+密码登录
    """
    
    def authenticate(self, request, username=None, password=None, **kwargs):
        """
        使用用户名和密码进行认证
        """
        if username is None or password is None:
            return None
        
        try:
            # 查找用户
            user = User.objects.get(username=username, is_active=True)
            
            # 查找密码身份
            identity = Identity.objects.filter(
                user=user,
                identity_type='password',
                identifier=username
            ).first()
            
            if identity and identity.check_password(password):
                # 更新最后登录时间
                user.last_login = timezone.now()
                user.save(update_fields=['last_login'])
                
                identity.last_used = timezone.now()
                identity.save(update_fields=['last_used'])
                
                return user
                
        except User.DoesNotExist:
            return None
        
        return None
    
    def get_user(self, user_id):
        """
        根据用户ID获取用户
        """
        try:
            return User.objects.get(pk=user_id, is_active=True)
        except User.DoesNotExist:
            return None


class SessionAuthentication(DRFSessionAuthentication):
    """
    DRF Session 认证：用于 API 请求
    
    使用 Django Session 进行认证
    """
    
    def authenticate(self, request):
        """
        使用 Django Session 进行认证
        """
        user = getattr(request._request, 'user', None)
        
        if not user or not user.is_authenticated:
            return None
        
        # CSRF 验证
        self.enforce_csrf(request)
        
        return (user, None)


class TokenAuthentication(authentication.BaseAuthentication):
    """
    简单的 Token 认证：用于 API 请求
    
    请求头格式：Authorization: Bearer <token>
    
    注意：这是一个简化实现，生产环境建议使用 JWT 或 DRF Token
    """
    
    keyword = 'Bearer'
    
    def authenticate(self, request):
        """
        从 Authorization header 中提取 token 并验证
        """
        auth = authentication.get_authorization_header(request).split()
        
        if not auth or auth[0].lower() != self.keyword.lower().encode():
            return None
        
        if len(auth) == 1:
            raise exceptions.AuthenticationFailed('Invalid token header. No credentials provided.')
        elif len(auth) > 2:
            raise exceptions.AuthenticationFailed('Invalid token header. Token string should not contain spaces.')
        
        try:
            token = auth[1].decode()
        except UnicodeError:
            raise exceptions.AuthenticationFailed('Invalid token header. Token string should not contain invalid characters.')
        
        return self.authenticate_credentials(token)
    
    def authenticate_credentials(self, key):
        """
        验证 token 并返回账户
        
        TODO: 这里需要实现真正的 token 验证逻辑
        目前是简化实现，将来可以：
        1. 使用 DRF Token
        2. 使用 JWT
        3. 使用 Redis 存储 token
        """
        # 简化实现：暂时不支持 token 认证
        # 生产环境需要实现真正的 token 验证
        raise exceptions.AuthenticationFailed('Token authentication not implemented yet.')
    
    def authenticate_header(self, request):
        """
        返回 WWW-Authenticate header 的值
        """
        return self.keyword


def create_user_with_password(username, password, email='', display_name='', **kwargs):
    """
    创建用户和密码身份
    
    Args:
        username: 用户名
        password: 密码（明文）
        email: 邮箱
        display_name: 显示名称
        **kwargs: 其他用户字段
    
    Returns:
        User 实例
    """
    # 创建用户
    user = User.objects.create(
        username=username,
        email=email,
        display_name=display_name or username,
        **kwargs
    )
    
    # 创建密码身份
    identity = Identity.objects.create(
        user=user,
        identity_type='password',
        identifier=username,
        is_verified=True,
        is_primary=True
    )
    identity.set_password(password)
    identity.save()
    
    return user


def authenticate_with_password(username, password):
    """
    使用用户名和密码进行认证
    
    Args:
        username: 用户名
        password: 密码（明文）
    
    Returns:
        User 实例或 None
    """
    try:
        # 查找用户
        user = User.objects.get(username=username, is_active=True)
        
        # 查找密码身份
        identity = Identity.objects.filter(
            user=user,
            identity_type='password',
            identifier=username
        ).first()
        
        if identity and identity.check_password(password):
            # 更新最后登录时间
            user.last_login = timezone.now()
            user.save(update_fields=['last_login'])
            
            identity.last_used = timezone.now()
            identity.save(update_fields=['last_used'])
            
            return user
            
    except User.DoesNotExist:
        pass
    
    return None
