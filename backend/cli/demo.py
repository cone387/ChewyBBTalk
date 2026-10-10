"""Append stable demo scenarios without overwriting existing account content."""

import base64
from datetime import timedelta
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select

from cli.demo_media import assets
from cli.demo_scenarios import EXTRA_TAGS, scenarios
from models import Attachment, BBTalk, Comment, StorageConfig, Tag, now
from services.records import sync_visibility
from storage.backends import Store


def scenario_uid(user_id, key):
    value = uuid5(NAMESPACE_URL, f'bbtalk/demo/v2/{user_id}/{key}')
    return base64.urlsafe_b64encode(value.bytes).decode().rstrip('=')


def expand_demo(db, settings, user):
    rows = scenarios()
    missing = [
        row
        for row in rows
        if not db.scalar(select(BBTalk.id).where(BBTalk.uid == scenario_uid(user.id, row['key'])))
    ]
    if not missing:
        return 0
    tags = {tag.name: tag for tag in db.scalars(select(Tag).where(Tag.user_id == user.id))}
    names = list(dict.fromkeys(EXTRA_TAGS + [name for row in rows for name in row['tags']]))
    for index, name in enumerate(names):
        if name not in tags:
            tags[name] = Tag(
                user_id=user.id,
                name=name,
                color=['#2563EB', '#059669', '#D97706', '#7C3AED'][index % 4],
                sort_order=index + 10,
            )
            db.add(tags[name])
    config = db.scalar(
        select(StorageConfig).where(
            StorageConfig.user_id == user.id, StorageConfig.name == '演示素材（本地）'
        )
    )
    if config and config.storage_type != 'local':
        raise ValueError('演示素材配置已被修改，请保留其 local 存储类型后再补充数据')
    if not config:
        config = StorageConfig(user_id=user.id, name='演示素材（本地）', storage_type='local')
        db.add(config)
        db.flush()
    media = assets()
    store = Store(settings)
    anchor = now()
    affected = set()
    for row in missing:
        stamp = anchor - timedelta(hours=row['hours_ago'])
        refs = []
        for key in row.get('media', []):
            # Public and private samples never share an attachment identity.
            identity = str(
                uuid5(NAMESPACE_URL, f'bbtalk/demo/v2/{user.id}/{row["visibility"]}/{key}')
            )
            file = db.get(Attachment, identity)
            if not file:
                filename, mime, content = media[key]
                path = f'demo/{user.id}/{identity}/{filename}'
                target = store.local_path(path)
                target.parent.mkdir(parents=True, exist_ok=True)
                # Retry after a rolled-back transaction can reuse its fixture file.
                if not target.exists():
                    with target.open('xb') as output:
                        output.write(content)
                file = Attachment(
                    id=identity,
                    original_name=filename,
                    storage_path=path,
                    mime_type=mime,
                    size=len(content),
                    owner_id=str(user.id),
                    is_public=row['visibility'] == 'public',
                    storage_config_id=str(config.id),
                    created_at=stamp,
                )
                db.add(file)
                db.flush()
            refs.append({'uid': file.id})
            affected.add(file.id)
        record = BBTalk(
            uid=scenario_uid(user.id, row['key']),
            user_id=user.id,
            content=row['content'],
            visibility=row['visibility'],
            attachments=refs,
            is_pinned=row.get('is_pinned', False),
            context=row.get('context', {}),
            create_time=stamp,
            update_time=anchor - timedelta(hours=row.get('updated_hours_ago', row['hours_ago'])),
        )
        record.tags = [tags[name] for name in row['tags']]
        db.add(record)
        db.flush()
        for index in range(row['comments']):
            uid = scenario_uid(user.id, f'{row["key"]}/comment/{index}')
            if not db.scalar(select(Comment.id).where(Comment.uid == uid)):
                db.add(
                    Comment(
                        uid=uid,
                        user_id=user.id,
                        bbtalk_id=record.id,
                        content=f'演示评论 {index + 1:02}：'
                        + [
                            '这个想法值得记录，稍后继续补充。',
                            '补充一点细节：今天又有了新的发现。\n换行后继续讨论。',
                            '收到，谢谢分享！☕',
                            '这是一条较长的讨论。' * 35,
                        ][index % 4],
                        create_time=stamp + timedelta(seconds=index + 1),
                    )
                )
    db.flush()
    sync_visibility(db, user.id, affected)
    return len(missing)
