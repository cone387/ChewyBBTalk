"""
数据导出功能

支持导出用户的所有数据为 JSON 格式，便于备份和迁移
"""
import json
import logging
import zipfile
from io import BytesIO
from datetime import datetime
from typing import Dict, List, Any
from django.core.files.base import ContentFile
from django.utils import timezone

from .models import User, BBTalk, Tag, UserStorageSettings, Attachment

logger = logging.getLogger(__name__)


class DataExporter:
    """数据导出器"""
    
    def __init__(self, user: User):
        self.user = user
        self.export_time = timezone.now()
    
    def export_all(self) -> Dict[str, Any]:
        """
        导出用户的所有数据
        
        Returns:
            包含所有数据的字典
        """
        return {
            'version': '1.0',
            'export_time': self.export_time.isoformat(),
            'user': self._export_user(),
            'tags': self._export_tags(),
            'bbtalks': self._export_bbtalks(),
            'storage_settings': self._export_storage_settings(),
            'attachments': self._export_attachments(),
        }
    
    def _export_user(self) -> Dict[str, Any]:
        """导出用户基本信息（不包含密码等敏感信息）"""
        return {
            'username': self.user.username,
            'email': self.user.email,
            'display_name': self.user.display_name,
            'avatar': self.user.avatar,
            'bio': self.user.bio,
            'create_time': self.user.create_time.isoformat(),
        }
    
    def _export_tags(self) -> List[Dict[str, Any]]:
        """导出标签"""
        tags = Tag.objects.filter(user=self.user).order_by('create_time')
        return [
            {
                'uid': tag.uid,
                'name': tag.name,
                'color': tag.color,
                'sort_order': tag.sort_order,
                'create_time': tag.create_time.isoformat(),
                'update_time': tag.update_time.isoformat(),
            }
            for tag in tags
        ]
    
    def _export_bbtalks(self) -> List[Dict[str, Any]]:
        """导出BBTalk内容"""
        bbtalks = BBTalk.objects.filter(user=self.user).prefetch_related('tags').order_by('create_time')
        return [
            {
                'uid': bbtalk.uid,
                'content': bbtalk.content,
                'visibility': bbtalk.visibility,
                'tags': [tag.uid for tag in bbtalk.tags.all()],
                'attachments': bbtalk.attachments,
                'context': bbtalk.context,
                'create_time': bbtalk.create_time.isoformat(),
                'update_time': bbtalk.update_time.isoformat(),
            }
            for bbtalk in bbtalks
        ]
    
    def _export_storage_settings(self) -> List[Dict[str, Any]]:
        """导出存储配置（不包含密钥）"""
        settings = UserStorageSettings.objects.filter(user=self.user).order_by('create_time')
        return [
            {
                'name': s.name,
                'storage_type': s.storage_type,
                's3_access_key_id': s.s3_access_key_id,
                # 注意：不导出 secret_access_key，需要用户手动配置
                's3_bucket_name': s.s3_bucket_name,
                's3_region_name': s.s3_region_name,
                's3_endpoint_url': s.s3_endpoint_url,
                's3_custom_domain': s.s3_custom_domain,
                'is_active': s.is_active,
                'create_time': s.create_time.isoformat(),
            }
            for s in settings
        ]
    
    def _export_attachments(self) -> List[Dict[str, Any]]:
        """导出附件元信息"""
        attachments = Attachment.objects.filter(owner_id=self.user.id).order_by('created_at')
        return [
            {
                'id': str(att.id),
                'original_name': att.original_name,
                'size': att.size,
                'mime_type': att.mime_type,
                'storage_config_id': att.storage_config_id,
                'storage_path': att.storage_path,
                'is_public': att.is_public,
                'created_at': att.created_at.isoformat(),
            }
            for att in attachments
        ]
    
    def export_to_json(self) -> str:
        """导出为 JSON 字符串"""
        data = self.export_all()
        return json.dumps(data, ensure_ascii=False, indent=2)
    
    def export_to_file(self) -> BytesIO:
        """
        导出为 JSON 文件（字节流）
        
        Returns:
            BytesIO 对象，可直接用于下载
        """
        json_str = self.export_to_json()
        buffer = BytesIO()
        buffer.write(json_str.encode('utf-8'))
        buffer.seek(0)
        return buffer
    
    def export_to_zip(self, include_attachments: bool = False) -> BytesIO:
        """
        导出为 ZIP 压缩包
        
        Args:
            include_attachments: 是否包含附件文件（默认只导出元信息）
        
        Returns:
            BytesIO 对象，包含压缩包数据
        """
        buffer = BytesIO()
        
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            # 添加数据 JSON
            json_data = self.export_to_json()
            zf.writestr('data.json', json_data)
            
            # 添加 README
            readme = self._generate_readme()
            zf.writestr('README.txt', readme)
            
            # 如果需要，导出附件文件
            if include_attachments:
                self._add_attachments_to_zip(zf)
        
        buffer.seek(0)
        return buffer
    
    def _generate_readme(self) -> str:
        """生成 README 说明文件"""
        return f"""ChewyBBTalk 数据导出包

导出时间: {self.export_time.strftime('%Y-%m-%d %H:%M:%S')}
用户: {self.user.username}

文件说明:
- data.json: 包含所有数据的 JSON 文件
  - user: 用户基本信息
  - tags: 标签列表
  - bbtalks: BBTalk 内容列表
  - storage_settings: 存储配置（不包含密钥，需手动配置）
  - attachments: 附件元信息

- attachments/ (如果包含): 附件文件目录
  - 按照原始路径组织

导入说明:
1. 登录目标服务器的 ChewyBBTalk 账号
2. 进入设置 > 数据管理
3. 选择"导入数据"
4. 上传此压缩包
5. 如有 S3 存储配置，需手动填写密钥

注意事项:
- 导入会创建新内容，不会覆盖已有数据
- UID 冲突时会生成新的 UID
- 标签名称冲突时会复用已有标签
- 附件需要手动处理或确保目标服务器可访问原存储
"""
    
    def _add_attachments_to_zip(self, zf: zipfile.ZipFile):
        """将附件文件添加到 ZIP（如果可访问）"""
        attachments = Attachment.objects.filter(owner_id=self.user.id)
        
        for att in attachments:
            try:
                # 尝试读取附件内容
                if hasattr(att, 'file') and att.file:
                    file_content = att.file.read()
                    zf.writestr(f'attachments/{att.storage_path}', file_content)
                    logger.info(f"已添加附件: {att.storage_path}")
            except Exception as e:
                logger.warning(f"无法导出附件 {att.file_id}: {e}")
                continue
