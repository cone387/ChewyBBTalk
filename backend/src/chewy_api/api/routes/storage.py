"""Account-scoped local/S3 storage; all paths and reads stay behind authorization."""

from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, File, Form, Request, Response, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import select, update

from chewy_api.api.dependencies import DB, CurrentUser
from chewy_api.api.pagination import paginate
from chewy_api.core.errors import APIError, fail
from chewy_api.db.models import Attachment, StorageConfig
from chewy_api.schemas.storage import StorageInput
from chewy_api.services.security import encrypt_secret, request_user
from chewy_api.storage.backends import Store
from chewy_api.storage.service import (
    config_values,
    owned_config,
    storage_data,
    store_for,
    upload_store,
)

router = APIRouter(tags=['Storage'])
BASE = '/api/v1/bbtalk'
FILES = '/api/v1/attachments/files'
EXTENSIONS = {
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.svg',
    '.pdf',
    '.doc',
    '.docx',
    '.txt',
    '.zip',
    '.mp3',
    '.mp4',
    '.mov',
    '.avi',
    '.m4a',
    '.aac',
    '.wav',
    '.ogg',
    '.webm',
    '.3gp',
    '.caf',
    '.flac',
}


@router.get(BASE + '/settings/storage/')
def storage_list(db: DB, user: CurrentUser):
    return [
        storage_data(config)
        for config in db.scalars(
            select(StorageConfig)
            .where(StorageConfig.user_id == user.id)
            .order_by(StorageConfig.is_active.desc(), StorageConfig.update_time.desc())
        )
    ]


@router.get(BASE + '/settings/storage/active/')
def active_storage(db: DB, user: CurrentUser):
    config = db.scalar(
        select(StorageConfig)
        .where(StorageConfig.user_id == user.id)
        .order_by(StorageConfig.is_active.desc(), StorageConfig.id)
    )
    return storage_data(config) if config else {'storage_type': 'local', 'is_active': False}


@router.post(BASE + '/settings/storage/create/', status_code=201)
def create_storage(data: StorageInput, request: Request, db: DB, user: CurrentUser):
    values = data.model_dump()
    values['s3_secret_access_key'] = encrypt_secret(
        values['s3_secret_access_key'], request.app.state.settings
    )
    if values['is_active']:
        db.execute(
            update(StorageConfig).where(StorageConfig.user_id == user.id).values(is_active=False)
        )
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
        values['s3_secret_access_key'] = encrypt_secret(
            values['s3_secret_access_key'], request.app.state.settings
        )
    if values.get('is_active'):
        db.execute(
            update(StorageConfig).where(StorageConfig.user_id == user.id).values(is_active=False)
        )
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
    db.execute(
        update(StorageConfig).where(StorageConfig.user_id == user.id).values(is_active=False)
    )
    config.is_active = True
    db.commit()
    return storage_data(config)


@router.post(BASE + '/settings/storage/deactivate-all/')
def deactivate(db: DB, user: CurrentUser):
    db.execute(
        update(StorageConfig).where(StorageConfig.user_id == user.id).values(is_active=False)
    )
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
    return test_config(
        db.scalar(
            select(StorageConfig).where(
                StorageConfig.user_id == user.id, StorageConfig.is_active.is_(True)
            )
        ),
        request,
    )


@router.post(BASE + '/settings/storage/{pk:int}/test/')
def test_by_id(pk: int, request: Request, db: DB, user: CurrentUser):
    return test_config(owned_config(db, user, pk), request)


def attachment_data(file, request):
    path = f'{FILES}/{file.id}'
    base = str(request.base_url).rstrip('/')
    return {
        **{
            key: getattr(file, key)
            for key in (
                'id',
                'original_name',
                'mime_type',
                'size',
                'owner_id',
                'is_public',
                'storage_config_id',
            )
        },
        'created_at': file.created_at.strftime('%Y-%m-%d %H:%M:%S'),
        'preview_url': base + path + '/preview/',
        'download_url': base + path + '/content/',
        'file_url': base + path + '/content/',
    }


@router.post(FILES + '/', status_code=201)
def upload(
    request: Request,
    db: DB,
    user: CurrentUser,
    file: UploadFile = File(...),
    is_public: bool = Form(False),
    storage_config_id: str | None = Form(None),
):
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
        attachment = Attachment(
            original_name=filename,
            storage_path=key,
            mime_type=mime,
            size=len(content),
            owner_id=str(user.id),
            is_public=is_public,
            storage_config_id=config_id,
        )
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
    query = (
        select(Attachment)
        .where(
            Attachment.is_public.is_(True)
            | (Attachment.owner_id == str(user.id) if user else False)
        )
        .order_by(Attachment.created_at.desc())
    )
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
    store_for(db, request.app.state.settings, file.storage_config_id, file.owner_id).delete(
        file.storage_path
    )
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
    return FileResponse(
        path,
        media_type=file.mime_type,
        filename=file.original_name,
        content_disposition_type=disposition,
    )


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
