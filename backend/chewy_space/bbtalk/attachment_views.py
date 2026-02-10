"""
自定义附件视图，支持用户自定义 S3 配置
"""
import logging
from typing import Optional, Tuple
from chewy_attachment.django_app.views import AttachmentViewSet as BaseAttachmentViewSet
from chewy_attachment.django_app.serializers import AttachmentUploadSerializer
from chewy_attachment.core.storage import DjangoStorageEngine, BaseStorageEngine
from rest_framework import status
from rest_framework.response import Response

logger = logging.getLogger(__name__)


class AttachmentViewSet(BaseAttachmentViewSet):
    """
    扩展的附件视图集，自动使用用户的 S3 配置
    
    重写 create 和 get_storage_engine_for_upload 方法，在上传前自动获取用户的 S3 配置
    """
    
    def get_storage_engine_for_upload(self, storage_config_id: Optional[str] = None) -> Tuple[BaseStorageEngine, Optional[str]]:
        """根据 config_id 创建存储引擎"""
        if storage_config_id:
            # 创建用户特定的 S3 Storage Backend
            engine = self._create_user_storage_engine(storage_config_id)
            if engine:
                return engine, storage_config_id
        
        # 退回到默认存储
        return super().get_storage_engine_for_upload(storage_config_id)
    
    def _create_user_storage_engine(self, config_id: str) -> Optional[DjangoStorageEngine]:
        """根据用户配置创建 Storage Engine"""
        try:
            from .models import UserStorageSettings
            from storages.backends.s3boto3 import S3Boto3Storage
            
            settings_obj = UserStorageSettings.objects.filter(
                id=config_id,
                is_active=True
            ).first()
            
            if not settings_obj or not settings_obj.is_s3_configured():
                logger.warning(f"配置 ID {config_id} 不存在或未配置完整")
                return None
            
            config = settings_obj.get_s3_config()
            
            # 创建 S3 Storage Backend
            storage_kwargs = {
                'access_key': config['access_key_id'],
                'secret_key': config['secret_access_key'],
                'bucket_name': config['bucket_name'],
                'region_name': config.get('region_name', 'us-east-1'),
                'default_acl': 'private',
                'file_overwrite': False,
                'querystring_auth': True,
                'querystring_expire': 3600,
            }
            
            if config.get('endpoint_url'):
                storage_kwargs['endpoint_url'] = config['endpoint_url']
            
            if config.get('custom_domain'):
                storage_kwargs['custom_domain'] = config['custom_domain']
            
            s3_storage = S3Boto3Storage(**storage_kwargs)
            logger.info(f"为配置 ID {config_id} 创建 S3 Storage Engine")
            
            return DjangoStorageEngine(s3_storage)
        
        except Exception as e:
            logger.error(f"创建存储引擎失败: {e}", exc_info=True)
            return None
    
    def create(self, request, *args, **kwargs):
        """处理文件上传，自动使用用户的 S3 配置"""
        serializer = AttachmentUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uploaded_file = serializer.validated_data["file"]
        is_public = serializer.validated_data.get("is_public", False)
        storage_config_id = serializer.validated_data.get("storage_config_id")
        
        # 如果用户没有指定 storage_config_id，尝试自动获取用户的配置
        if not storage_config_id and request.user.is_authenticated:
            storage_config_id = self._get_user_storage_config_id(request.user)
            logger.info(f"自动为用户 {request.user.username} 使用配置 ID: {storage_config_id}")
        
        content = uploaded_file.read()
        original_name = uploaded_file.name

        # 使用获取到的 config_id 调用父类方法
        storage, actual_config_id = self.get_storage_engine_for_upload(storage_config_id)
        result = storage.save_file(content, original_name)

        from .models import Attachment
        from chewy_attachment.core.utils import generate_uuid
        
        attachment = Attachment.objects.create(
            id=generate_uuid(),
            original_name=original_name,
            storage_path=result.storage_path,
            mime_type=result.mime_type,
            size=result.size,
            owner_id=str(request.user.id),
            is_public=is_public,
            storage_config_id=actual_config_id,
        )

        from chewy_attachment.django_app.serializers import AttachmentSerializer
        output_serializer = AttachmentSerializer(attachment, context={'request': request})
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)
    
    def _get_user_storage_config_id(self, user):
        """获取用户的存储配置 ID"""
        try:
            from .models import UserStorageSettings
            
            settings_obj = UserStorageSettings.objects.filter(
                user=user,
                is_active=True,
                storage_type='s3'
            ).first()
            
            if settings_obj and settings_obj.is_s3_configured():
                return str(settings_obj.id)
        
        except Exception as e:
            logger.warning(f"获取用户存储配置失败: {e}")
        
        return None
