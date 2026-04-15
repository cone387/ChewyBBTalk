"""
自定义附件视图，支持用户自定义 S3 配置和 HTTP Range 请求
"""
import logging
import os
from typing import Optional, Tuple
from chewy_attachment.django_app.views import AttachmentViewSet as BaseAttachmentViewSet
from chewy_attachment.django_app.serializers import AttachmentUploadSerializer
from chewy_attachment.core.storage import DjangoStorageEngine, BaseStorageEngine
from django.http import HttpResponse, Http404, HttpResponseRedirect
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

logger = logging.getLogger(__name__)


def parse_range_header(range_header: str, file_size: int):
    """
    解析 HTTP Range 请求头

    Args:
        range_header: 例如 "bytes=0-1023"、"bytes=1000-"、"bytes=-500"
        file_size: 文件总大小（字节）

    Returns:
        (start, end) 元组表示合法范围，None 表示格式不合法

    Raises:
        ValueError: Range 范围超出文件大小
    """
    if not range_header or not range_header.startswith('bytes='):
        return None

    range_spec = range_header[6:]  # 去掉 "bytes="

    # 不支持多段 Range
    if ',' in range_spec:
        return None

    parts = range_spec.split('-', 1)
    if len(parts) != 2:
        return None

    start_str, end_str = parts

    try:
        if start_str == '' and end_str:
            # bytes=-500（最后 500 字节）
            suffix = int(end_str)
            if suffix <= 0:
                return None
            start = max(0, file_size - suffix)
            end = file_size - 1
        elif end_str == '' and start_str:
            # bytes=1000-（从 1000 到末尾）
            start = int(start_str)
            end = file_size - 1
        elif start_str and end_str:
            # bytes=0-1023
            start = int(start_str)
            end = int(end_str)
        else:
            return None
    except ValueError:
        return None

    # 验证范围
    if start < 0 or end < 0 or start > end:
        return None

    if start >= file_size:
        raise ValueError(f"Range start {start} exceeds file size {file_size}")

    # 将 end 限制在 file_size - 1
    end = min(end, file_size - 1)

    return (start, end)


class AttachmentViewSet(BaseAttachmentViewSet):
    """
    扩展的附件视图集，自动使用用户的 S3 配置
    
    重写存储引擎方法，在上传和读取/预览时自动使用用户的 S3 配置
    """
    
    def get_storage_engine(self, storage_config_id=None):
        """根据 config_id 获取存储引擎（用于读取/预览/下载）"""
        if storage_config_id:
            engine = self._create_user_storage_engine(storage_config_id)
            if engine:
                return engine
        
        # 退回到默认存储
        return super().get_storage_engine(storage_config_id)
    
    def get_storage_engine_for_upload(self, storage_config_id: Optional[str] = None) -> Tuple[BaseStorageEngine, Optional[str]]:
        """根据 config_id 创建存储引擎（用于上传）"""
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

    @action(detail=True, methods=["get"], url_path="preview")
    def preview(self, request, pk=None):
        """
        预览文件，支持 HTTP Range 请求

        - 无 Range 头: 返回 200 + 完整文件（原有行为）+ Accept-Ranges: bytes
        - 有 Range 头 (本地存储): 返回 206 + 部分内容
        - 有 Range 头 (S3 存储): 302 重定向到签名 URL（S3 原生支持 Range）
        - Range 格式错误或超出范围: 返回 416 Range Not Satisfiable
        """
        range_header = request.META.get('HTTP_RANGE')

        if not range_header:
            # 无 Range 头：使用原有行为，添加 Accept-Ranges 头
            response = super().preview(request, pk)
            response['Accept-Ranges'] = 'bytes'
            return response

        # 有 Range 头 — 需要处理
        instance = self.get_object()

        # 权限检查（与父类一致）
        from chewy_attachment.django_app.views import get_attachment_model
        from chewy_attachment.core.permissions import PermissionChecker

        user_context = get_attachment_model().get_user_context(request)
        file_metadata = instance.to_file_metadata()
        if not PermissionChecker.can_download(file_metadata, user_context):
            return Response(
                {"detail": "You do not have permission to preview this file"},
                status=status.HTTP_403_FORBIDDEN,
            )

        storage = self.get_storage_engine(instance.storage_config_id)

        # S3/云存储：重定向（S3 原生支持 Range）
        if hasattr(storage, 'get_file_url') and hasattr(storage, 'storage') and hasattr(storage.storage, 'url'):
            file_url = storage.get_file_url(instance.storage_path)
            return HttpResponseRedirect(file_url)
        elif hasattr(storage, 's3_client'):
            file_url = storage.get_file_url(instance.storage_path)
            return HttpResponseRedirect(file_url)

        # 本地存储：处理 Range 请求
        try:
            file_path = storage.get_file_path(instance.storage_path)
        except Exception:
            raise Http404("File not found on storage")

        file_size = os.path.getsize(file_path)

        try:
            parsed = parse_range_header(range_header, file_size)
        except ValueError:
            # Range 超出文件大小
            resp = HttpResponse(status=416)
            resp['Content-Range'] = f'bytes */{file_size}'
            resp['Accept-Ranges'] = 'bytes'
            return resp

        if parsed is None:
            # 格式不合法
            resp = HttpResponse(status=416)
            resp['Content-Range'] = f'bytes */{file_size}'
            resp['Accept-Ranges'] = 'bytes'
            return resp

        start, end = parsed
        content_length = end - start + 1

        with open(file_path, 'rb') as f:
            f.seek(start)
            data = f.read(content_length)

        resp = HttpResponse(data, status=206, content_type=instance.mime_type)
        resp['Content-Range'] = f'bytes {start}-{end}/{file_size}'
        resp['Content-Length'] = content_length
        resp['Accept-Ranges'] = 'bytes'
        resp['Content-Disposition'] = f'inline; filename="{instance.original_name}"'
        return resp
