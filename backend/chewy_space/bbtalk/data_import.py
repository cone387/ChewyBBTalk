"""
数据导入功能

支持导入从其他 ChewyBBTalk 实例导出的数据
"""
import json
import logging
import zipfile
from io import BytesIO
from typing import Dict, List, Any, Optional
from datetime import datetime
from pathlib import PurePosixPath
from uuid import uuid4
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .models import User, BBTalk, Tag, UserStorageSettings, Attachment, Comment, generate_uid
from .backup_integrity import verify_archive

logger = logging.getLogger(__name__)


def restore_timestamps(instance, payload, fields=('create_time', 'update_time')):
    values = {}
    for field in fields:
        raw = payload.get(field)
        if raw:
            parsed = parse_datetime(raw)
            if parsed is None:
                raise ValueError(f'无效的时间字段：{field}')
            values[field] = timezone.make_aware(parsed) if timezone.is_naive(parsed) else parsed
    if values:
        type(instance).objects.filter(pk=instance.pk).update(**values)


class ImportError(Exception):
    """导入错误"""
    pass


class DataImporter:
    """数据导入器"""
    
    def __init__(self, user: User, options: Optional[Dict[str, bool]] = None):
        """
        初始化数据导入器
        
        Args:
            user: 目标用户
            options: 导入选项
                - overwrite_tags: 是否覆盖同名标签
                - skip_duplicates: 是否跳过重复内容
                - import_storage_settings: 是否导入存储配置
        """
        self.user = user
        self.options = options or {}
        self.stats = {
            'tags_created': 0,
            'tags_skipped': 0,
            'bbtalks_created': 0,
            'bbtalks_skipped': 0,
            'storage_settings_created': 0,
            'attachments_created': 0,
            'attachments_skipped': 0,
            'comments_created': 0,
            'comments_skipped': 0,
            'errors': [],
        }
        self.uid_mapping = {}  # 旧UID -> 新对象的映射
        self.tag_mapping = {}  # 旧标签UID -> 新标签对象的映射
        self.attachment_mapping = {}  # 旧附件ID -> 新附件元信息
        self.saved_files = []
    
    def import_from_json(self, json_str: str) -> Dict[str, Any]:
        """
        从 JSON 字符串导入数据
        
        Args:
            json_str: JSON 格式的导出数据
        
        Returns:
            导入统计信息
        """
        try:
            data = json.loads(json_str)
        except json.JSONDecodeError as e:
            raise ImportError(f"无效的 JSON 格式: {e}")
        
        return self.import_from_dict(data)
    
    def import_from_file(self, file_obj) -> Dict[str, Any]:
        """
        从文件对象导入
        
        Args:
            file_obj: 文件对象（支持 JSON 或 ZIP）
        """
        # 读取文件内容
        content = file_obj.read()
        
        # 尝试作为 ZIP 解压
        try:
            return self._import_from_zip(BytesIO(content))
        except zipfile.BadZipFile:
            pass
        
        # 尝试作为 JSON 解析
        try:
            json_str = content.decode('utf-8')
            return self.import_from_json(json_str)
        except UnicodeDecodeError as e:
            raise ImportError(f"无法读取文件: {e}")
    
    def _import_from_zip(self, zip_buffer: BytesIO) -> Dict[str, Any]:
        """从 ZIP 文件导入"""
        with zipfile.ZipFile(zip_buffer, 'r') as zf:
            try:
                verify_archive(zf)
            except ValueError as exc:
                raise ImportError(str(exc)) from exc
            # 读取 data.json
            if 'data.json' not in zf.namelist():
                raise ImportError("ZIP 文件中缺少 data.json")
            
            json_str = zf.read('data.json').decode('utf-8')
            try:
                data = json.loads(json_str)
            except json.JSONDecodeError as e:
                raise ImportError(f"ZIP 中的 data.json 格式无效: {e}") from e

            return self.import_from_dict(data, zip_file=zf)

    def import_from_dict(self, data: Dict[str, Any], zip_file=None) -> Dict[str, Any]:
        """
        从字典导入数据
        
        Args:
            data: 导出的数据字典
        
        Returns:
            导入统计信息
        """
        # 验证数据格式
        self._validate_data(data)
        
        # 在事务中执行导入
        try:
            with transaction.atomic():
                # 1. 导入标签
                if 'tags' in data:
                    self._import_tags(data['tags'])

                # 2. 导入 ZIP 中的附件，建立旧 ID 到新元数据的映射
                if zip_file is not None and 'attachments' in data:
                    self._import_attachments(data['attachments'], zip_file)
                
                # 3. 导入 BBTalk 内容
                if 'bbtalks' in data:
                    self._import_bbtalks(data['bbtalks'])

                # 4. 导入评论，使用旧 BBTalk uid 映射到新记录
                if 'comments' in data:
                    self._import_comments(data['comments'])
                
                # 5. 导入存储配置（可选）
                if self.options.get('import_storage_settings') and 'storage_settings' in data:
                    self._import_storage_settings(data['storage_settings'])
                
                logger.info(f"数据导入成功: {self.stats}")
        
        except Exception as e:
            self._cleanup_files(self.saved_files)
            logger.error(f"数据导入失败: {e}", exc_info=True)
            self.stats['errors'].append(str(e))
            raise ImportError(f"导入失败: {e}")
        finally:
            self.saved_files.clear()
        
        return self.stats

    @staticmethod
    def _cleanup_files(files):
        for storage, path in files:
            try:
                storage.delete_file(path)
            except Exception:
                logger.exception('导入回滚文件清理失败，需要检查存储')

    @staticmethod
    def _validate_attachment_path(storage_path: str) -> str:
        """校验附件路径只能指向 ZIP 的 attachments 目录。"""
        normalized = str(storage_path or '').replace('\\', '/')
        path = PurePosixPath(normalized)
        if not normalized or path.is_absolute() or '..' in path.parts:
            raise ImportError(f"附件路径不安全: {storage_path}")
        return '/'.join(path.parts)

    def _get_import_storage(self):
        """将导入文件写入当前用户激活的存储，否则写入默认本地存储。"""
        from chewy_attachment.django_app.storage import get_storage_engine_for_upload

        active = UserStorageSettings.objects.filter(
            user=self.user,
            is_active=True,
            storage_type='s3',
        ).first()
        return get_storage_engine_for_upload(str(active.id) if active and active.is_s3_configured() else None)

    def _import_attachments(self, attachments_data: List[Dict[str, Any]], zip_file) -> None:
        """从 ZIP 恢复附件文件和数据库记录。"""
        storage, target_config_id = self._get_import_storage()
        names = set(zip_file.namelist())

        for attachment_data in attachments_data:
            old_id = str(attachment_data.get('id') or attachment_data.get('uid') or '')
            stored = None
            try:
                with transaction.atomic():
                    storage_path = self._validate_attachment_path(attachment_data.get('storage_path', ''))
                    zip_path = f'attachments/{storage_path}'
                    if not old_id or zip_path not in names:
                        self.stats['attachments_skipped'] += 1
                        continue

                    content = zip_file.read(zip_path)
                    result = storage.save_file(
                        content=content,
                        original_name=attachment_data.get('original_name') or '附件',
                    )
                    stored = (storage, result.storage_path)
                    self.saved_files.append(stored)
                    new_attachment = Attachment.objects.create(
                        id=uuid4(),
                        original_name=attachment_data.get('original_name') or '附件',
                        storage_path=result.storage_path,
                        mime_type=attachment_data.get('mime_type') or result.mime_type,
                        size=result.size,
                        owner_id=str(self.user.id),
                        is_public=bool(attachment_data.get('is_public', False)),
                        storage_config_id=target_config_id or None,
                    )
                    restore_timestamps(new_attachment, attachment_data, ('created_at',))
                    mime_type = new_attachment.mime_type or ''
                    if mime_type.startswith('image/'):
                        attachment_type = 'image'
                    elif mime_type.startswith('video/'):
                        attachment_type = 'video'
                    elif mime_type.startswith('audio/'):
                        attachment_type = 'audio'
                    else:
                        attachment_type = 'file'
                    self.attachment_mapping[old_id] = {
                        'uid': str(new_attachment.id),
                        'url': f'/api/v1/attachments/files/{new_attachment.id}/preview/',
                        'type': attachment_type,
                        'filename': new_attachment.original_name,
                        'originalFilename': new_attachment.original_name,
                        'fileSize': new_attachment.size,
                        'mimeType': new_attachment.mime_type,
                    }
                    self.stats['attachments_created'] += 1
            except ImportError:
                raise
            except Exception as e:
                if stored is not None:
                    self._cleanup_files([stored])
                    self.saved_files.remove(stored)
                error_msg = f"导入附件失败 ({attachment_data.get('original_name', 'unknown')}): {e}"
                logger.error(error_msg)
                self.stats['errors'].append(error_msg)

    def _rewrite_attachment_refs(self, attachments: List[Any]) -> List[Any]:
        """将 BBTalk 中的旧附件引用替换为新附件元信息。"""
        rewritten = []
        for reference in attachments or []:
            old_id = ''
            if isinstance(reference, dict):
                old_id = str(reference.get('uid') or reference.get('id') or '')
            elif reference is not None:
                old_id = str(reference)
            rewritten.append(self.attachment_mapping.get(old_id, reference))
        return rewritten

    def _import_comments(self, comments_data: List[Dict[str, Any]]) -> None:
        """导入评论并关联到本次导入的 BBTalk。"""
        for comment_data in comments_data:
            try:
                bbtalk_uid = str(comment_data.get('bbtalk_uid') or '')
                bbtalk = self.uid_mapping.get(bbtalk_uid)
                content = str(comment_data.get('content') or '').strip()
                if not bbtalk or not content:
                    self.stats['comments_skipped'] += 1
                    continue
                comment = Comment.objects.create(user=self.user, bbtalk=bbtalk, content=content)
                restore_timestamps(comment, comment_data)
                self.stats['comments_created'] += 1
            except Exception as e:
                error_msg = f"导入评论失败: {e}"
                logger.error(error_msg)
                self.stats['errors'].append(error_msg)
    
    def _validate_data(self, data: Dict[str, Any]):
        """验证数据格式"""
        if not isinstance(data, dict):
            raise ImportError("数据格式错误：应为字典")
        
        if 'version' not in data:
            raise ImportError("数据缺少版本信息")
        
        # TODO: 检查版本兼容性
        version = data['version']
        if version != '1.0':
            logger.warning(f"数据版本 {version} 可能不兼容当前版本")
    
    def _import_tags(self, tags_data: List[Dict[str, Any]]):
        """导入标签"""
        for tag_data in tags_data:
            try:
                old_uid = tag_data['uid']
                name = tag_data['name']
                
                # 检查是否已存在同名标签
                existing_tag = Tag.objects.filter(user=self.user, name=name).first()
                
                if existing_tag:
                    if self.options.get('overwrite_tags'):
                        # 更新已有标签
                        existing_tag.color = tag_data.get('color', existing_tag.color)
                        existing_tag.sort_order = tag_data.get('sort_order', existing_tag.sort_order)
                        existing_tag.save()
                        self.tag_mapping[old_uid] = existing_tag
                        self.stats['tags_skipped'] += 1
                    else:
                        # 复用已有标签
                        self.tag_mapping[old_uid] = existing_tag
                        self.stats['tags_skipped'] += 1
                else:
                    # 创建新标签
                    new_tag = Tag.objects.create(
                        user=self.user,
                        name=name,
                        color=tag_data.get('color', ''),
                        sort_order=tag_data.get('sort_order', 0),
                    )
                    self.tag_mapping[old_uid] = new_tag
                    restore_timestamps(new_tag, tag_data)
                    self.stats['tags_created'] += 1
                
            except Exception as e:
                error_msg = f"导入标签失败 ({tag_data.get('name', 'unknown')}): {e}"
                logger.error(error_msg)
                self.stats['errors'].append(error_msg)
    
    def _import_bbtalks(self, bbtalks_data: List[Dict[str, Any]]):
        """导入 BBTalk 内容"""
        for bbtalk_data in bbtalks_data:
            try:
                old_uid = bbtalk_data['uid']
                content = bbtalk_data['content']
                
                # 检查是否跳过重复内容
                if self.options.get('skip_duplicates'):
                    # 检查是否有相同内容
                    if BBTalk.objects.filter(user=self.user, content=content).exists():
                        existing = BBTalk.objects.filter(user=self.user, content=content).first()
                        if existing:
                            self.uid_mapping[old_uid] = existing
                        self.stats['bbtalks_skipped'] += 1
                        continue
                
                # 检查 UID 是否冲突
                new_uid = old_uid
                if BBTalk.objects.filter(uid=new_uid).exists():
                    new_uid = generate_uid()
                    logger.info(f"UID 冲突，生成新 UID: {old_uid} -> {new_uid}")
                
                # 创建 BBTalk
                new_bbtalk = BBTalk.objects.create(
                    uid=new_uid,
                    user=self.user,
                    content=content,
                    visibility=bbtalk_data.get('visibility', 'private'),
                    is_pinned=bbtalk_data.get('is_pinned', False),
                    attachments=self._rewrite_attachment_refs(bbtalk_data.get('attachments', [])),
                    context=bbtalk_data.get('context', {}),
                )
                
                # 关联标签
                tag_uids = bbtalk_data.get('tags', [])
                tags = [self.tag_mapping[uid] for uid in tag_uids if uid in self.tag_mapping]
                new_bbtalk.tags.set(tags)
                restore_timestamps(new_bbtalk, bbtalk_data)
                
                self.uid_mapping[old_uid] = new_bbtalk
                self.stats['bbtalks_created'] += 1
                
            except Exception as e:
                error_msg = f"导入 BBTalk 失败 (UID: {bbtalk_data.get('uid', 'unknown')}): {e}"
                logger.error(error_msg)
                self.stats['errors'].append(error_msg)
    
    def _import_storage_settings(self, settings_data: List[Dict[str, Any]]):
        """导入存储配置"""
        for setting_data in settings_data:
            try:
                name = setting_data['name']
                
                # 检查是否已存在同名配置
                if UserStorageSettings.objects.filter(user=self.user, name=name).exists():
                    logger.info(f"存储配置 '{name}' 已存在，跳过")
                    continue
                
                # 创建新配置（不包含密钥）
                UserStorageSettings.objects.create(
                    user=self.user,
                    name=name,
                    storage_type=setting_data.get('storage_type', 's3'),
                    s3_access_key_id=setting_data.get('s3_access_key_id', ''),
                    # 注意：密钥需要用户手动配置
                    s3_bucket_name=setting_data.get('s3_bucket_name', ''),
                    s3_region_name=setting_data.get('s3_region_name', 'us-east-1'),
                    s3_endpoint_url=setting_data.get('s3_endpoint_url', ''),
                    s3_custom_domain=setting_data.get('s3_custom_domain', ''),
                    is_active=False,  # 默认不激活
                )
                self.stats['storage_settings_created'] += 1
                
            except Exception as e:
                error_msg = f"导入存储配置失败 ({setting_data.get('name', 'unknown')}): {e}"
                logger.error(error_msg)
                self.stats['errors'].append(error_msg)


def validate_import_file(file_obj):
    """Validate format and integrity before opening the import confirmation."""
    content = file_obj.read()
    file_obj.seek(0)
    result = {'valid': False, 'file_type': None, 'version': None, 'export_time': None,
              'preview': {}, 'error': None, 'complete_backup': False}
    try:
        if zipfile.is_zipfile(BytesIO(content)):
            result['file_type'] = 'zip'
            with zipfile.ZipFile(BytesIO(content)) as archive:
                result['complete_backup'] = verify_archive(archive)
                data = json.loads(archive.read('data.json'))
        else:
            result['file_type'] = 'json'
            data = json.loads(content.decode('utf-8'))
        if not isinstance(data, dict) or data.get('version') != '1.0':
            raise ValueError('不支持的数据格式或版本')
        fields = ('tags', 'bbtalks', 'comments', 'attachments', 'storage_settings')
        for field in fields:
            if not isinstance(data.get(field, []), list):
                raise ValueError(f'字段 {field} 必须为列表')
        result.update(valid=True, version=data['version'], export_time=data.get('export_time'),
                      preview={field + '_count': len(data.get(field, [])) for field in fields})
    except (ValueError, KeyError, UnicodeError, zipfile.BadZipFile) as exc:
        result['error'] = str(exc)
    return result
