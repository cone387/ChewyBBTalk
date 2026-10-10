import os

from sqlalchemy import select

from chewy_api.core.errors import fail
from chewy_api.db.models import StorageConfig
from chewy_api.services.security import decrypt_secret
from chewy_api.storage.backends import Store


def config_values(config, settings):
    return {
        'access_key_id': config.s3_access_key_id,
        'secret_access_key': decrypt_secret(config.s3_secret_access_key, settings),
        'bucket_name': config.s3_bucket_name,
        'region_name': config.s3_region_name,
        'endpoint_url': config.s3_endpoint_url,
    }


def store_for(db, settings, config_id=None, owner_id=None):
    if config_id:
        try:
            config = db.get(StorageConfig, int(config_id))
        except (TypeError, ValueError):
            config = None
        if not config or (owner_id is not None and config.user_id != int(owner_id)):
            fail(403, '无权使用此存储配置')
        if config.storage_type == 'local':
            return Store(settings)
        if not config.is_s3_configured:
            fail(400, 'S3 配置不完整')
        return Store(settings, config_values(config, settings))
    if all(
        os.getenv(key)
        for key in ('AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_STORAGE_BUCKET_NAME')
    ):
        return Store(
            settings,
            {
                'access_key_id': os.environ['AWS_ACCESS_KEY_ID'],
                'secret_access_key': os.environ['AWS_SECRET_ACCESS_KEY'],
                'bucket_name': os.environ['AWS_STORAGE_BUCKET_NAME'],
                'region_name': os.getenv('AWS_S3_REGION_NAME', 'us-east-1'),
                'endpoint_url': os.getenv('AWS_S3_ENDPOINT_URL'),
            },
        )
    return Store(settings)


def upload_store(db, settings, user, config_id=None):
    if not config_id:
        active = db.scalar(
            select(StorageConfig).where(
                StorageConfig.user_id == user.id,
                StorageConfig.is_active.is_(True),
                StorageConfig.storage_type == 's3',
            )
        )
        config_id = str(active.id) if active and active.is_s3_configured else None
    return store_for(db, settings, config_id, user.id), config_id or None


def storage_data(config):
    fields = (
        'id',
        'name',
        'storage_type',
        's3_access_key_id',
        's3_bucket_name',
        's3_region_name',
        's3_endpoint_url',
        's3_custom_domain',
        'is_active',
        'create_time',
        'update_time',
    )
    return {
        **{key: getattr(config, key) for key in fields},
        'has_secret_key': bool(config.s3_secret_access_key),
        'is_s3_configured': config.is_s3_configured,
    }


def owned_config(db, user, pk):
    config = db.scalar(
        select(StorageConfig).where(StorageConfig.id == pk, StorageConfig.user_id == user.id)
    )
    if not config:
        fail(404, '配置不存在')
    return config
