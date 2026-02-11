"""
存储迁移服务

支持将附件从一个存储后端迁移到另一个存储后端
场景：本地存储 → S3、S3 → 本地、S3(A) → S3(B)
"""
import logging
from typing import Optional, Dict, Any

from django.core.files.storage import default_storage
from chewy_attachment.core.storage import DjangoStorageEngine

from .models import User, Attachment, UserStorageSettings

logger = logging.getLogger(__name__)


class StorageMigrationService:
    """存储迁移服务"""

    def __init__(self, user: User):
        self.user = user
        self.stats = {
            'total': 0,
            'migrated': 0,
            'skipped': 0,
            'failed': 0,
            'errors': [],
        }

    def _build_s3_storage(self, settings_obj: UserStorageSettings):
        """根据配置构建 S3 storage backend"""
        from storages.backends.s3boto3 import S3Boto3Storage

        config = settings_obj.get_s3_config()
        kwargs = {
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
            kwargs['endpoint_url'] = config['endpoint_url']
        if config.get('custom_domain'):
            kwargs['custom_domain'] = config['custom_domain']
        return S3Boto3Storage(**kwargs)

    def _get_engine(self, config_id: Optional[str]) -> DjangoStorageEngine:
        """
        获取存储引擎

        config_id=None → 本地默认存储
        config_id=str  → 对应的 S3 配置
        """
        if config_id:
            settings_obj = UserStorageSettings.objects.filter(
                id=config_id,
            ).first()
            if settings_obj and settings_obj.is_s3_configured():
                return DjangoStorageEngine(self._build_s3_storage(settings_obj))
            raise ValueError(f"存储配置 {config_id} 不存在或未配置完整")
        return DjangoStorageEngine(default_storage)

    def get_migration_preview(self, target_config_id: Optional[str]) -> Dict[str, Any]:
        """
        预览迁移信息：统计需要迁移的附件数量

        Args:
            target_config_id: 目标存储配置 ID，None 表示本地存储
        """
        attachments = Attachment.objects.filter(owner_id=self.user.id)
        total = attachments.count()

        # 找出 storage_config_id 不等于目标的附件（即需要迁移的）
        target_str = str(target_config_id) if target_config_id else ''
        need_migrate = 0
        already_on_target = 0

        for att in attachments:
            att_cfg = att.storage_config_id or ''
            if str(att_cfg) == target_str:
                already_on_target += 1
            else:
                need_migrate += 1

        return {
            'total': total,
            'need_migrate': need_migrate,
            'already_on_target': already_on_target,
        }

    def migrate(self, target_config_id: Optional[str]) -> Dict[str, Any]:
        """
        执行迁移

        Args:
            target_config_id: 目标存储配置 ID，None 表示迁移到本地存储
        """
        target_str = str(target_config_id) if target_config_id else ''
        target_engine = self._get_engine(target_config_id)

        attachments = Attachment.objects.filter(owner_id=self.user.id)
        self.stats['total'] = attachments.count()

        for att in attachments:
            att_cfg = att.storage_config_id or ''
            if str(att_cfg) == target_str:
                self.stats['skipped'] += 1
                continue

            try:
                self._migrate_one(att, target_engine, target_config_id)
                self.stats['migrated'] += 1
            except Exception as e:
                err_msg = f"{att.original_name} ({att.id}): {e}"
                logger.error(f"迁移附件失败: {err_msg}")
                self.stats['failed'] += 1
                self.stats['errors'].append(err_msg)

        return self.stats

    def _migrate_one(
        self,
        att: Attachment,
        target_engine: DjangoStorageEngine,
        target_config_id: Optional[str],
    ):
        """迁移单个附件"""
        # 1. 从源存储读取文件
        source_engine = self._get_engine(att.storage_config_id or None)
        content = source_engine.get_file(att.storage_path)
        logger.info(f"读取附件: {att.storage_path} ({len(content)} bytes)")

        # 2. 写入目标存储（保持原路径）
        result = target_engine.save_file(
            content=content,
            original_name=att.original_name,
            storage_path=att.storage_path,
        )
        logger.info(f"写入附件: {result.storage_path}")

        # 3. 更新数据库记录
        att.storage_config_id = str(target_config_id) if target_config_id else ''
        att.storage_path = result.storage_path
        att.save(update_fields=['storage_config_id', 'storage_path'])
