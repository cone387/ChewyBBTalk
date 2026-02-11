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
from django.db import transaction
from django.utils import timezone

from .models import User, BBTalk, Tag, UserStorageSettings, Attachment, generate_uid

logger = logging.getLogger(__name__)


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
            'errors': [],
        }
        self.uid_mapping = {}  # 旧UID -> 新对象的映射
        self.tag_mapping = {}  # 旧标签UID -> 新标签对象的映射
    
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
            # 读取 data.json
            if 'data.json' not in zf.namelist():
                raise ImportError("ZIP 文件中缺少 data.json")
            
            json_str = zf.read('data.json').decode('utf-8')
            
            # TODO: 处理附件文件（如果有）
            # self._import_attachments_from_zip(zf)
            
            return self.import_from_json(json_str)
    
    def import_from_dict(self, data: Dict[str, Any]) -> Dict[str, Any]:
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
                
                # 2. 导入 BBTalk 内容
                if 'bbtalks' in data:
                    self._import_bbtalks(data['bbtalks'])
                
                # 3. 导入存储配置（可选）
                if self.options.get('import_storage_settings') and 'storage_settings' in data:
                    self._import_storage_settings(data['storage_settings'])
                
                logger.info(f"数据导入成功: {self.stats}")
        
        except Exception as e:
            logger.error(f"数据导入失败: {e}", exc_info=True)
            self.stats['errors'].append(str(e))
            raise ImportError(f"导入失败: {e}")
        
        return self.stats
    
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
                    attachments=bbtalk_data.get('attachments', []),
                    context=bbtalk_data.get('context', {}),
                )
                
                # 关联标签
                tag_uids = bbtalk_data.get('tags', [])
                tags = [self.tag_mapping[uid] for uid in tag_uids if uid in self.tag_mapping]
                new_bbtalk.tags.set(tags)
                
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


def validate_import_file(file_obj) -> Dict[str, Any]:
    """
    验证导入文件格式
    
    Args:
        file_obj: 文件对象
    
    Returns:
        文件信息和预览数据
    """
    content = file_obj.read()
    file_obj.seek(0)  # 重置文件指针
    
    result = {
        'valid': False,
        'file_type': None,
        'version': None,
        'export_time': None,
        'preview': {},
        'error': None,
    }
    
    # 尝试作为 ZIP 解析
    try:
        with zipfile.ZipFile(BytesIO(content), 'r') as zf:
            if 'data.json' in zf.namelist():
                json_str = zf.read('data.json').decode('utf-8')
                data = json.loads(json_str)
                result['file_type'] = 'zip'
                result['valid'] = True
                result['version'] = data.get('version')
                result['export_time'] = data.get('export_time')
                result['preview'] = {
                    'tags_count': len(data.get('tags', [])),
                    'bbtalks_count': len(data.get('bbtalks', [])),
                    'storage_settings_count': len(data.get('storage_settings', [])),
                }
                return result
    except Exception:
        pass
    
    # 尝试作为 JSON 解析
    try:
        json_str = content.decode('utf-8')
        data = json.loads(json_str)
        result['file_type'] = 'json'
        result['valid'] = True
        result['version'] = data.get('version')
        result['export_time'] = data.get('export_time')
        result['preview'] = {
            'tags_count': len(data.get('tags', [])),
            'bbtalks_count': len(data.get('bbtalks', [])),
            'storage_settings_count': len(data.get('storage_settings', [])),
        }
        return result
    except Exception as e:
        result['error'] = str(e)
    
    return result
