"""Account-scoped local/S3 storage; all paths and reads stay behind authorization."""
import mimetypes
import os
from pathlib import Path, PurePosixPath
from urllib.parse import quote
from uuid import UUID, uuid4

import boto3
from botocore.config import Config
from fastapi import APIRouter, Request, Response, UploadFile, File, Form
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import select, update

from .dependencies import DB, CurrentUser
from .errors import APIError, fail
from .models import Attachment, StorageConfig, now
from .schemas import StorageInput
from .security import decrypt_secret, encrypt_secret, request_user
from .records import paginate

router = APIRouter(tags=['Storage'])
BASE = '/api/v1/bbtalk'
FILES = '/api/v1/attachments/files'
EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.pdf', '.doc', '.docx', '.txt', '.zip', '.mp3', '.mp4', '.mov', '.avi', '.m4a', '.aac', '.wav', '.ogg', '.webm', '.3gp', '.caf', '.flac'}
mimetypes.add_type('audio/mp4', '.m4a')
mimetypes.add_type('audio/aac', '.aac')


def safe_key(value):
    value = str(value).replace('\\', '/')
    path = PurePosixPath(value)
    if not value or path.is_absolute() or '..' in path.parts or ':' in value or '\x00' in value:
        raise ValueError('附件路径不安全')
    return '/'.join(path.parts)


class Store:
    def __init__(self, settings, config=None):
        self.root = settings.storage_root.resolve()
        self.settings = settings
        self.config = config

    @property
    def cloud(self):
        return self.config is not None

    def local_path(self, key):
        path = self.root / safe_key(key)
        if not path.resolve().is_relative_to(self.root):
            raise ValueError('附件路径不安全')
        return path

    def client(self):
        config = self.config
        return boto3.client('s3', aws_access_key_id=config['access_key_id'], aws_secret_access_key=config['secret_access_key'], region_name=config.get('region_name') or 'us-east-1', endpoint_url=config.get('endpoint_url') or None, config=Config(connect_timeout=3, read_timeout=30, retries={'total_max_attempts': 2}))

    def read(self, key):
        key = safe_key(key)
        if not self.cloud:
            return self.local_path(key).read_bytes()
        with self.client() as client:
            response = client.get_object(Bucket=self.config['bucket_name'], Key=key)
            try:
                return response['Body'].read()
            finally:
                response['Body'].close()

    def save(self, content, filename, key=None):
        key = safe_key(key or f'{now():%Y/%m/%d}/{uuid4().hex}{Path(filename).suffix.lower()}')
        mime = mimetypes.guess_type(filename)[0] or 'application/octet-stream'
        if self.cloud:
            with self.client() as client:
                client.put_object(Bucket=self.config['bucket_name'], Key=key, Body=content, ContentType=mime)
        else:
            path = self.local_path(key)
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open('xb') as output:
                output.write(content)
        return key, mime

    def delete(self, key):
        key = safe_key(key)
        if self.cloud:
            with self.client() as client:
                client.delete_object(Bucket=self.config['bucket_name'], Key=key)
        else:
            self.local_path(key).unlink(missing_ok=True)

    def url(self, key):
        with self.client() as client:
            return client.generate_presigned_url('get_object', Params={'Bucket': self.config['bucket_name'], 'Key': safe_key(key)}, ExpiresIn=int(os.getenv('AWS_QUERYSTRING_EXPIRE', '3600')))


def config_values(config, settings):
    return {'access_key_id': config.s3_access_key_id, 'secret_access_key': decrypt_secret(config.s3_secret_access_key, settings), 'bucket_name': config.s3_bucket_name, 'region_name': config.s3_region_name, 'endpoint_url': config.s3_endpoint_url}


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
    if all(os.getenv(key) for key in ('AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_STORAGE_BUCKET_NAME')):
        return Store(settings, {'access_key_id': os.environ['AWS_ACCESS_KEY_ID'], 'secret_access_key': os.environ['AWS_SECRET_ACCESS_KEY'], 'bucket_name': os.environ['AWS_STORAGE_BUCKET_NAME'], 'region_name': os.getenv('AWS_S3_REGION_NAME', 'us-east-1'), 'endpoint_url': os.getenv('AWS_S3_ENDPOINT_URL')})
    return Store(settings)


def upload_store(db, settings, user, config_id=None):
    if not config_id:
        active = db.scalar(select(StorageConfig).where(StorageConfig.user_id == user.id, StorageConfig.is_active.is_(True), StorageConfig.storage_type == 's3'))
        config_id = str(active.id) if active and active.is_s3_configured else None
    return store_for(db, settings, config_id, user.id), config_id or None


def storage_data(config):
    fields = ('id', 'name', 'storage_type', 's3_access_key_id', 's3_bucket_name', 's3_region_name', 's3_endpoint_url', 's3_custom_domain', 'is_active', 'create_time', 'update_time')
    return {**{key: getattr(config, key) for key in fields}, 'has_secret_key': bool(config.s3_secret_access_key), 'is_s3_configured': config.is_s3_configured}


def owned_config(db, user, pk):
    config = db.scalar(select(StorageConfig).where(StorageConfig.id == pk, StorageConfig.user_id == user.id))
    if not config:
        fail(404, '配置不存在')
    return config


@router.get(BASE + '/settings/storage/')
def storage_list(db: DB, user: CurrentUser):
    return [storage_data(config) for config in db.scalars(select(StorageConfig).where(StorageConfig.user_id == user.id).order_by(StorageConfig.is_active.desc(), StorageConfig.update_time.desc()))]


@router.get(BASE + '/settings/storage/active/')
def active_storage(db: DB, user: CurrentUser):
    config = db.scalar(select(StorageConfig).where(StorageConfig.user_id == user.id).order_by(StorageConfig.is_active.desc(), StorageConfig.id))
    return storage_data(config) if config else {'storage_type': 'local', 'is_active': False}


@router.post(BASE + '/settings/storage/create/', status_code=201)
def create_storage(data: StorageInput, request: Request, db: DB, user: CurrentUser):
    values = data.model_dump()
    values['s3_secret_access_key'] = encrypt_secret(values['s3_secret_access_key'], request.app.state.settings)
    if values['is_active']:
        db.execute(update(StorageConfig).where(StorageConfig.user_id == user.id).values(is_active=False))
    config = StorageConfig(user_id=user.id, **values)
    db.add(config)
    db.commit()
    return storage_data(config)


@router.patch(BASE + '/settings/storage/{pk:int}/')
@router.put(BASE + '/settings/storage/{pk:int}/')
def edit_storage(pk: int, data: StorageInput, request: Request, db: DB, user: CurrentUser):
    config = owned_config(db, user, pk)
    values = data.model_dump(exclude_unset=True)
    if not values.get('s3_secret_access_key'):
        values.pop('s3_secret_access_key', None)
    else:
        values['s3_secret_access_key'] = encrypt_secret(values['s3_secret_access_key'], request.app.state.settings)
    if values.get('is_active'):
        db.execute(update(StorageConfig).where(StorageConfig.user_id == user.id).values(is_active=False))
    for key, value in values.items():
        setattr(config, key, value)
    db.commit()
    return storage_data(config)


@router.delete(BASE + '/settings/storage/{pk:int}/delete/', status_code=204)
def delete_storage(pk: int, db: DB, user: CurrentUser):
    config = owned_config(db, user, pk)
    if db.scalar(select(Attachment.id).where(Attachment.storage_config_id == str(pk)).limit(1)):
        fail(409, '此配置仍有附件，请先迁移附件再删除')
    db.delete(config)
    db.commit()
    return Response(status_code=204)


@router.post(BASE + '/settings/storage/{pk:int}/activate/')
def activate(pk: int, db: DB, user: CurrentUser):
    config = owned_config(db, user, pk)
    db.execute(update(StorageConfig).where(StorageConfig.user_id == user.id).values(is_active=False))
    config.is_active = True
    db.commit()
    return storage_data(config)


@router.post(BASE + '/settings/storage/deactivate-all/')
def deactivate(db: DB, user: CurrentUser):
    db.execute(update(StorageConfig).where(StorageConfig.user_id == user.id).values(is_active=False))
    db.commit()
    return {'message': '已切换为服务器存储'}


def test_config(config, request):
    if not config or not config.is_s3_configured:
        raise APIError(400, {'success': False, 'message': 'S3 配置不完整，请先完成配置'})
    try:
        store = Store(request.app.state.settings, config_values(config, request.app.state.settings))
        with store.client() as client:
            client.list_objects_v2(Bucket=store.config['bucket_name'], MaxKeys=1)
        return {'success': True, 'message': f"连接成功！存储桶 '{config.s3_bucket_name}' 可访问"}
    except Exception:
        raise APIError(400, {'success': False, 'message': '连接失败，请检查存储配置、凭证和网络'})


@router.post(BASE + '/settings/storage/test/')
def test_active(request: Request, db: DB, user: CurrentUser):
    return test_config(db.scalar(select(StorageConfig).where(StorageConfig.user_id == user.id, StorageConfig.is_active.is_(True))), request)


@router.post(BASE + '/settings/storage/{pk:int}/test/')
def test_by_id(pk: int, request: Request, db: DB, user: CurrentUser):
    return test_config(owned_config(db, user, pk), request)


def attachment_data(file, request):
    path = f'{FILES}/{file.id}'
    base = str(request.base_url).rstrip('/')
    return {**{key: getattr(file, key) for key in ('id', 'original_name', 'mime_type', 'size', 'owner_id', 'is_public', 'storage_config_id')}, 'created_at': file.created_at.strftime('%Y-%m-%d %H:%M:%S'), 'preview_url': base + path + '/preview/', 'download_url': base + path + '/content/', 'file_url': base + path + '/content/'}


@router.post(FILES + '/', status_code=201)
def upload(request: Request, db: DB, user: CurrentUser, file: UploadFile = File(...), is_public: bool = Form(False), storage_config_id: str | None = Form(None)):
    config = request.app.state.settings
    filename = Path((file.filename or '').replace('\\', '/')).name
    if not filename or len(filename) > 255 or Path(filename).suffix.lower() not in EXTENSIONS:
        fail(400, '不支持的文件类型或文件名')
    content = file.file.read(config.max_file_size + 1)
    if not content or len(content) > config.max_file_size:
        fail(400, '文件为空或超过大小限制')
    store, config_id = upload_store(db, config, user, storage_config_id)
    key, mime = store.save(content, filename)
    try:
        attachment = Attachment(original_name=filename, storage_path=key, mime_type=mime, size=len(content), owner_id=str(user.id), is_public=is_public, storage_config_id=config_id)
        db.add(attachment)
        db.commit()
    except Exception:
        db.rollback()
        store.delete(key)
        raise
    return attachment_data(attachment, request)


def accessible_file(db, request, pk, write=False):
    try:
        pk = str(UUID(pk))
    except ValueError:
        raise APIError(404, {'detail': '未找到。'})
    user = request_user(request, db, required=False)
    file = db.get(Attachment, pk)
    owner = file and user and file.owner_id == str(user.id)
    if not file or not (owner or (file.is_public and not write)):
        raise APIError(404, {'detail': '未找到。'})
    return file


@router.get(FILES + '/')
def attachment_list(request: Request, db: DB):
    user = request_user(request, db, required=False)
    query = select(Attachment).where(Attachment.is_public.is_(True) | (Attachment.owner_id == str(user.id) if user else False)).order_by(Attachment.created_at.desc())
    try:
        size = min(100, max(1, int(request.query_params.get('page_size', 20))))
    except ValueError:
        size = 20
    result = paginate(db, query, request, size)
    result['results'] = [attachment_data(file, request) for file in result['results']]
    return result


@router.get(FILES + '/{pk}/')
def attachment_detail(pk: str, request: Request, db: DB):
    return attachment_data(accessible_file(db, request, pk), request)


@router.delete(FILES + '/{pk}/', status_code=204)
def delete_attachment(pk: str, request: Request, db: DB):
    file = accessible_file(db, request, pk, write=True)
    store_for(db, request.app.state.settings, file.storage_config_id, file.owner_id).delete(file.storage_path)
    db.delete(file)
    db.commit()
    return Response(status_code=204)


def serve_file(pk, request, db, disposition):
    file = accessible_file(db, request, pk)
    store = store_for(db, request.app.state.settings, file.storage_config_id, file.owner_id)
    if store.cloud:
        return RedirectResponse(store.url(file.storage_path), status_code=302)
    path = store.local_path(file.storage_path)
    if not path.is_file():
        raise APIError(404, {'detail': '文件不存在'})
    return FileResponse(path, media_type=file.mime_type, filename=file.original_name, content_disposition_type=disposition)


@router.get(FILES + '/{pk}/preview/')
def preview(pk: str, request: Request, db: DB):
    return serve_file(pk, request, db, 'inline')


@router.get(FILES + '/{pk}/content/')
def download(pk: str, request: Request, db: DB):
    return serve_file(pk, request, db, 'attachment')


def migration_target(data, db, user, settings):
    target = data.get('target_config_id')
    if target is not None:
        owned_config(db, user, target)
    return store_for(db, settings, target, user.id), str(target) if target else None


@router.post(BASE + '/storage/migration/preview/')
def migration_preview(data: dict, request: Request, db: DB, user: CurrentUser):
    _, target = migration_target(data, db, user, request.app.state.settings)
    files = list(db.scalars(select(Attachment).where(Attachment.owner_id == str(user.id))))
    already = sum((file.storage_config_id or None) == target for file in files)
    return {'total': len(files), 'need_migrate': len(files) - already, 'already_on_target': already}


@router.post(BASE + '/storage/migration/execute/')
def migrate_storage(data: dict, request: Request, db: DB, user: CurrentUser):
    store, target = migration_target(data, db, user, request.app.state.settings)
    files = list(db.scalars(select(Attachment).where(Attachment.owner_id == str(user.id))))
    stats = {'total': len(files), 'migrated': 0, 'skipped': 0, 'failed': 0, 'errors': []}
    for file in files:
        if (file.storage_config_id or None) == target:
            stats['skipped'] += 1
            continue
        key = None
        try:
            source = store_for(db, request.app.state.settings, file.storage_config_id, user.id)
            key, _ = store.save(source.read(file.storage_path), file.original_name)
            file.storage_path, file.storage_config_id = key, target
            db.commit()
            stats['migrated'] += 1
        except Exception:
            db.rollback()
            if key:
                store.delete(key)
            stats['failed'] += 1
            stats['errors'].append(f'{file.original_name}: 迁移失败，请检查存储连接')
    return {'success': stats['failed'] == 0, 'stats': stats}
