"""
用户自定义 S3 存储后端

支持用户在 Web 端配置自己的 S3 存储，用于文件上传
"""
import logging
from typing import Optional
from storages.backends.s3boto3 import S3Boto3Storage
from django.core.files.storage import default_storage

logger = logging.getLogger(__name__)


class UserS3Storage(S3Boto3Storage):
    """
    用户自定义 S3 存储后端
    
    根据用户的存储设置动态配置 S3 连接参数
    """
    
    def __init__(self, user_settings=None, **kwargs):
        """
        初始化用户 S3 存储
        
        Args:
            user_settings: UserStorageSettings 实例或配置字典
        """
        if user_settings is None:
            super().__init__(**kwargs)
            return
        
        # 如果是 UserStorageSettings 模型实例
        if hasattr(user_settings, 'get_s3_config'):
            config = user_settings.get_s3_config()
        else:
            config = user_settings
        
        # 设置 S3 参数
        kwargs['access_key'] = config.get('access_key_id')
        kwargs['secret_key'] = config.get('secret_access_key')
        kwargs['bucket_name'] = config.get('bucket_name')
        kwargs['region_name'] = config.get('region_name', 'us-east-1')
        
        if config.get('endpoint_url'):
            kwargs['endpoint_url'] = config['endpoint_url']
        
        if config.get('custom_domain'):
            kwargs['custom_domain'] = config['custom_domain']
        
        # 默认设置
        kwargs.setdefault('default_acl', 'private')
        kwargs.setdefault('file_overwrite', False)
        kwargs.setdefault('querystring_auth', True)
        kwargs.setdefault('querystring_expire', 3600)
        
        super().__init__(**kwargs)


def get_user_storage(user) -> Optional[S3Boto3Storage]:
    """
    获取用户的存储后端
    
    如果用户配置了 S3 存储且已启用，返回用户的 S3 存储后端
    否则返回 None（使用默认存储）
    
    Args:
        user: User 实例
        
    Returns:
        S3Boto3Storage 实例或 None
    """
    try:
        # 延迟导入避免循环依赖
        from .models import UserStorageSettings
        
        settings = UserStorageSettings.objects.filter(user=user).first()
        
        if settings and settings.is_active and settings.is_s3_configured():
            logger.info(f"使用用户 {user.username} 的自定义 S3 存储")
            return UserS3Storage(user_settings=settings)
        
    except Exception as e:
        logger.warning(f"获取用户存储设置失败: {e}")
    
    return None


def get_storage_for_user(user):
    """
    获取用户应该使用的存储后端
    
    优先使用用户自定义的 S3 存储，否则使用系统默认存储
    
    Args:
        user: User 实例
        
    Returns:
        存储后端实例
    """
    user_storage = get_user_storage(user)
    if user_storage:
        return user_storage
    return default_storage
