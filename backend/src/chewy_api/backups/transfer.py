import json
import zipfile
from datetime import datetime
from io import BytesIO

from sqlalchemy import select

from chewy_api.backups.integrity import (
    attachment_member,
    fingerprint,
    verify_archive,
    verify_attachment_references,
)
from chewy_api.db.models import (
    Attachment,
    BBTalk,
    Comment,
    StorageConfig,
    Tag,
    now,
    uid,
)
from chewy_api.services.records import attachment_ids, sync_visibility
from chewy_api.storage.service import storage_data, store_for, upload_store

FIELDS = ('tags', 'bbtalks', 'comments', 'attachments', 'storage_settings')


def timestamps(obj, names=('create_time', 'update_time')):
    return {name: getattr(obj, name).isoformat() for name in names}


class DataExporter:
    def __init__(self, user, db, settings):
        self.user, self.db, self.settings = user, db, settings
        self.export_time = now()

    def export_all(self):
        db, user = self.db, self.user
        tags = list(db.scalars(select(Tag).where(Tag.user_id == user.id)))
        records = list(
            db.scalars(select(BBTalk).where(BBTalk.user_id == user.id).order_by(BBTalk.create_time))
        )
        record_map = {record.id: record.uid for record in records}
        configs = list(db.scalars(select(StorageConfig).where(StorageConfig.user_id == user.id)))
        return {
            'version': '1.0',
            'export_time': self.export_time.isoformat(),
            'user': {
                **{
                    key: getattr(user, key)
                    for key in ('username', 'email', 'display_name', 'avatar', 'bio')
                },
                **timestamps(user, ('create_time',)),
            },
            'tags': [
                {
                    **{key: getattr(tag, key) for key in ('uid', 'name', 'color', 'sort_order')},
                    **timestamps(tag),
                }
                for tag in tags
            ],
            'bbtalks': [
                {
                    **{
                        key: getattr(record, key)
                        for key in (
                            'uid',
                            'content',
                            'visibility',
                            'is_pinned',
                            'attachments',
                            'context',
                        )
                    },
                    'tags': [tag.uid for tag in record.tags],
                    **timestamps(record),
                }
                for record in records
            ],
            'comments': [
                {
                    **{key: getattr(comment, key) for key in ('uid', 'content')},
                    'bbtalk_uid': record_map[comment.bbtalk_id],
                    **timestamps(comment),
                }
                for comment in db.scalars(
                    select(Comment).where(
                        Comment.user_id == user.id, Comment.bbtalk_id.in_(record_map)
                    )
                )
            ],
            'storage_settings': [
                {
                    key: value.isoformat() if isinstance(value, datetime) else value
                    for key, value in storage_data(config).items()
                    if key not in {'id', 'has_secret_key', 'is_s3_configured', 'update_time'}
                }
                for config in configs
            ],
            'attachments': [
                {
                    **{
                        key: getattr(file, key)
                        for key in (
                            'id',
                            'original_name',
                            'size',
                            'mime_type',
                            'storage_config_id',
                            'storage_path',
                            'is_public',
                        )
                    },
                    **timestamps(file, ('created_at',)),
                }
                for file in db.scalars(
                    select(Attachment).where(Attachment.owner_id == str(user.id))
                )
            ],
        }

    def export_to_zip(self, include_attachments=False):
        data = self.export_all()
        if include_attachments:
            verify_attachment_references(data)
        payload = json.dumps(data, ensure_ascii=False, indent=2).encode()
        buffer = BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('data.json', payload)
            archive.writestr(
                'README.txt',
                'ChewyBBTalk 数据备份。data.json 包含记录、标签、评论和附件元信息；存储密钥不导出。完整备份含附件文件及 manifest.json 校验清单。',
            )
            if include_attachments:
                members = {'data.json': fingerprint(payload)}
                for file in data['attachments']:
                    member = attachment_member(file['storage_path'])
                    if member in members:
                        raise ValueError('多个附件使用同一备份路径')
                    store = store_for(
                        self.db, self.settings, file['storage_config_id'], self.user.id
                    )
                    content = store.read(file['storage_path'])
                    archive.writestr(member, content)
                    members[member] = fingerprint(content)
                archive.writestr(
                    'manifest.json',
                    json.dumps({'version': 1, 'complete': True, 'members': members}),
                )
        buffer.seek(0)
        return buffer


def read_import(content, max_size):
    archive = None
    complete = False
    try:
        if zipfile.is_zipfile(BytesIO(content)):
            archive = zipfile.ZipFile(BytesIO(content))
            members = archive.infolist()
            if len(members) > 100_000 or sum(item.file_size for item in members) > max_size:
                raise ValueError('解压后数据超过导入大小限制')
            if len(archive.namelist()) != len(set(archive.namelist())):
                raise ValueError('备份含有重复文件名')
            complete = verify_archive(archive)
            data = json.loads(archive.read('data.json'))
        else:
            data = json.loads(content.decode('utf8'))
        if not isinstance(data, dict) or data.get('version') != '1.0':
            raise ValueError('不支持的数据格式或版本')
        for name in FIELDS:
            if not isinstance(data.get(name, []), list) or any(
                not isinstance(row, dict) for row in data.get(name, [])
            ):
                raise ValueError(f'字段 {name} 必须为对象列表')
        return data, archive, complete
    except Exception:
        if archive:
            archive.close()
        raise


def restore_times(obj, values, settings, names=('create_time', 'update_time')):
    for name in names:
        if value := values.get(name):
            stamp = datetime.fromisoformat(value.replace('Z', '+00:00'))
            setattr(
                obj,
                name,
                stamp.replace(tzinfo=settings.timezone) if stamp.tzinfo is None else stamp,
            )


def import_data(db, settings, user, data, archive=None, complete=False, **options):
    stats = {
        name + suffix: 0
        for name in ('tags', 'bbtalks', 'attachments', 'comments')
        for suffix in ('_created', '_skipped')
    }
    stats.update(storage_settings_created=0, errors=[])
    tag_map, record_map, file_map, saved = {}, {}, {}, []
    store, config_id = upload_store(db, settings, user)
    try:
        for row in data.get('tags', []):
            try:
                with db.begin_nested():
                    name = row['name']
                    if not isinstance(name, str) or not name or len(name) > 50:
                        raise ValueError('标签名称无效')
                    tag = db.scalar(select(Tag).where(Tag.user_id == user.id, Tag.name == name))
                    if tag:
                        stats['tags_skipped'] += 1
                        if options.get('overwrite_tags'):
                            tag.color, tag.sort_order = (
                                row.get('color', tag.color),
                                row.get('sort_order', tag.sort_order),
                            )
                    else:
                        tag_uid = row.get('uid') or uid()
                        if db.scalar(select(Tag.id).where(Tag.uid == tag_uid)):
                            tag_uid = uid()
                        tag = Tag(
                            user_id=user.id,
                            uid=tag_uid,
                            name=name,
                            color=row.get('color', '#3B82F6'),
                            sort_order=row.get('sort_order', 0),
                        )
                        db.add(tag)
                        db.flush()
                        restore_times(tag, row, settings)
                        stats['tags_created'] += 1
                    tag_map[row.get('uid', '')] = tag
            except Exception as error:
                stats['errors'].append(f'导入标签失败: {error}')
        for row in data.get('attachments', []):
            old_id, key = str(row.get('id', '')), None
            try:
                member = attachment_member(row.get('storage_path'))
                if archive is None or not old_id or member not in archive.namelist():
                    stats['attachments_skipped'] += 1
                    continue
                with db.begin_nested():
                    content = archive.read(member)
                    key, mime = store.save(content, row.get('original_name') or 'attachment')
                    saved.append((store, key))
                    file = Attachment(
                        original_name=row.get('original_name') or 'attachment',
                        storage_path=key,
                        mime_type=row.get('mime_type') or mime,
                        size=len(content),
                        owner_id=str(user.id),
                        is_public=bool(row.get('is_public', False)),
                        storage_config_id=config_id,
                    )
                    db.add(file)
                    db.flush()
                    restore_times(file, row, settings, ('created_at',))
                    file_map[old_id] = {
                        'uid': file.id,
                        'url': f'/api/v1/attachments/files/{file.id}/preview/',
                        'type': file.mime_type.split('/')[0],
                        'filename': file.original_name,
                        'mime_type': file.mime_type,
                        'file_size': file.size,
                    }
                    stats['attachments_created'] += 1
            except Exception as error:
                if key:
                    store.delete(key)
                    saved.remove((store, key))
                if complete:
                    raise ValueError('完整备份附件恢复失败，已回滚') from error
                stats['attachments_skipped'] += 1
                stats['errors'].append(f'导入附件失败: {error}')
        for row in data.get('bbtalks', []):
            try:
                with db.begin_nested():
                    old_uid = row.get('uid') or uid()
                    content = row['content']
                    if not isinstance(content, str) or row.get('visibility', 'private') not in (
                        'private',
                        'public',
                    ):
                        raise ValueError('记录内容或可见性无效')
                    duplicate = (
                        db.scalar(
                            select(BBTalk).where(
                                BBTalk.user_id == user.id, BBTalk.content == content
                            )
                        )
                        if options.get('skip_duplicates', True)
                        else None
                    )
                    if duplicate:
                        record_map[old_uid] = duplicate
                        stats['bbtalks_skipped'] += 1
                        continue
                    record_uid = (
                        uid()
                        if db.scalar(select(BBTalk.id).where(BBTalk.uid == old_uid))
                        else old_uid
                    )
                    refs = []
                    for reference in row.get('attachments') or []:
                        value = (
                            str(reference.get('uid') or reference.get('id') or '')
                            if isinstance(reference, dict)
                            else str(reference)
                        )
                        if value in file_map:
                            refs.append(file_map[value])
                        else:
                            stats['errors'].append('记录引用的附件未恢复，已跳过该引用')
                    record = BBTalk(
                        uid=record_uid,
                        user_id=user.id,
                        content=content,
                        visibility=row.get('visibility', 'private'),
                        is_pinned=bool(row.get('is_pinned', False)),
                        attachments=refs,
                        context=row.get('context') or {},
                    )
                    record.tags = [
                        tag_map[value]
                        for value in dict.fromkeys(row.get('tags', []))
                        if value in tag_map
                    ]
                    db.add(record)
                    db.flush()
                    restore_times(record, row, settings)
                    record_map[old_uid] = record
                    stats['bbtalks_created'] += 1
            except Exception as error:
                stats['errors'].append(f'导入记录失败: {error}')
        for row in data.get('comments', []):
            try:
                with db.begin_nested():
                    record = record_map.get(row.get('bbtalk_uid'))
                    if not record:
                        stats['comments_skipped'] += 1
                        continue
                    value = row['content']
                    if not isinstance(value, str) or not value.strip():
                        raise ValueError('评论内容无效')
                    if options.get('skip_duplicates', True) and db.scalar(
                        select(Comment.id).where(
                            Comment.user_id == user.id,
                            Comment.bbtalk_id == record.id,
                            Comment.content == value,
                        )
                    ):
                        stats['comments_skipped'] += 1
                        continue
                    comment_uid = row.get('uid') or uid()
                    if db.scalar(select(Comment.id).where(Comment.uid == comment_uid)):
                        comment_uid = uid()
                    comment = Comment(
                        uid=comment_uid, user_id=user.id, bbtalk_id=record.id, content=value
                    )
                    db.add(comment)
                    db.flush()
                    restore_times(comment, row, settings)
                    stats['comments_created'] += 1
            except Exception as error:
                stats['comments_skipped'] += 1
                stats['errors'].append(f'导入评论失败: {error}')
        if options.get('import_storage_settings'):
            from chewy_api.schemas.storage import StorageInput

            for row in data.get('storage_settings', []):
                try:
                    with db.begin_nested():
                        values = StorageInput.model_validate(row).model_dump()
                        values.update(s3_secret_access_key='', is_active=False)
                        if not db.scalar(
                            select(StorageConfig.id).where(
                                StorageConfig.user_id == user.id,
                                StorageConfig.name == values['name'],
                            )
                        ):
                            db.add(StorageConfig(user_id=user.id, **values))
                            db.flush()
                            stats['storage_settings_created'] += 1
                except Exception as error:
                    stats['errors'].append(f'导入存储配置失败: {error}')
        db.flush()
        affected = (
            set().union(*(attachment_ids(record.attachments) for record in record_map.values()))
            if record_map
            else set()
        )
        sync_visibility(db, user.id, affected)
        db.commit()
        return stats
    except Exception:
        db.rollback()
        for saved_store, path in saved:
            saved_store.delete(path)
        raise
