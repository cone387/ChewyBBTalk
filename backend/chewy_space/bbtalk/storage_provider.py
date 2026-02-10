"""
用户自定义存储配置提供者

实现 ChewyAttachment 的 StorageConfigProvider 接口，
为不同用户提供各自的 S3 存储配置
"""
import logging
from typing import Optional, Dict, Any

from chewy_attachment.core.storage import StorageConfigProvider
from chewy_attachment.core.schemas import S3ConfigSchema
from chewy_attachment.core.exceptions import StorageException

logger = logging.getLogger(__name__)


class UserStorageConfigProvider(StorageConfigProvider):
    """
    用户存储配置提供者
    
    根据用户的存储设置返回对应的存储引擎和配置
    """
    
    def get_config(self, config_id: str) -> S3ConfigSchema:
        """
        获取指定配置 ID 的存储配置
        
        Args:
            config_id: 配置 ID（用户的 storage settings 记录 ID）
        
        Returns:
            S3ConfigSchema 对象
        
        Raises:
            StorageException: 如果配置不存在或无效
        """
        if not config_id:
            raise StorageException("配置 ID 不能为空")
        
        try:
            from .models import UserStorageSettings
            
            settings_obj = UserStorageSettings.objects.filter(
                id=config_id,
                is_active=True
            ).first()
            
            if not settings_obj or not settings_obj.is_s3_configured():
                raise StorageException(f"存储配置不存在或未配置完整 (config_id={config_id})")
            
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
        
        except StorageException:
            raise
        except Exception as e:
            logger.warning(f"获取存储配置失败 (config_id={config_id}): {e}")
            raise StorageException(f"获取存储配置失败: {e}")
    
    def get_default_config(self) -> Optional[S3ConfigSchema]:
        """
        获取默认的配置
        
        用户级别的配置不支持全局默认，返回 None 使用本地存储
        
        Returns:
            None（回退到本地存储）
        """
        return None

