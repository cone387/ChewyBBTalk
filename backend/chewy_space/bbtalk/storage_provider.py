"""
用户自定义存储配置提供者

实现 ChewyAttachment 的 StorageConfigProvider 接口，
为不同用户提供各自的 S3 存储配置
"""
import logging
from typing import Optional, Dict, Any
from dataclasses import dataclass

from chewy_attachment.core.storage import StorageConfigProvider

logger = logging.getLogger(__name__)


@dataclass
class S3ConfigSchema:
    """S3 配置 schema"""
    config_id: str
    bucket_name: str
    access_key: str
    secret_key: str
    region: str = 'us-east-1'
    endpoint_url: Optional[str] = None
    prefix: str = 'attachments'
    public_read: bool = False


class UserStorageConfigProvider(StorageConfigProvider):
    """
    用户存储配置提供者
    
    根据用户的存储设置返回对应的存储引擎和配置
    """
    
    def get_config(self, config_id: Optional[str] = None) -> Optional[S3ConfigSchema]:
        """
        获取指定配置 ID 的存储配置
        
        Args:
            config_id: 配置 ID（用户的 storage settings 记录 ID）
        
        Returns:
            S3ConfigSchema 对象，如果不存在返回 None
        """
        if not config_id:
            return None
        
        try:
            from .models import UserStorageSettings
            
            settings_obj = UserStorageSettings.objects.filter(
                id=config_id,
                is_active=True
            ).first()
            
            if settings_obj and settings_obj.is_s3_configured():
                config_dict = settings_obj.get_s3_config()
                return S3ConfigSchema(
                    config_id=str(settings_obj.id),
                    bucket_name=config_dict['bucket_name'],
                    access_key=config_dict['access_key_id'],
                    secret_key=config_dict['secret_access_key'],
                    region=config_dict.get('region_name', 'us-east-1'),
                    endpoint_url=config_dict.get('endpoint_url'),
                    prefix='attachments',
                    public_read=False,
                )
        
        except Exception as e:
            logger.warning(f"获取存储配置失败 (config_id={config_id}): {e}")
        
        return None
    
    def get_default_config(self, user_context: Optional[Dict[str, Any]] = None) -> Optional[S3ConfigSchema]:
        """
        获取默认的配置
        
        Args:
            user_context: 用户上下文，包含 user_id 等信息
        
        Returns:
            S3ConfigSchema 对象，如果没有返回 None（使用本地存储）
        """
        if not user_context or 'user_id' not in user_context:
            return None
        
        user_id = user_context['user_id']
        
        try:
            from .models import UserStorageSettings
            
            settings_obj = UserStorageSettings.objects.filter(
                user_id=user_id,
                is_active=True,
                storage_type='s3'
            ).first()
            
            if settings_obj and settings_obj.is_s3_configured():
                logger.info(f"使用用户 {user_id} 的 S3 配置 (ID: {settings_obj.id})")
                return self.get_config(str(settings_obj.id))
        
        except Exception as e:
            logger.warning(f"获取用户默认配置失败 (user_id={user_id}): {e}")
        
        return None

