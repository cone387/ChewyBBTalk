import re
from uuid import UUID

from sqlalchemy import delete, func, select, update

from core.errors import APIError, fail
from models import (
    Attachment,
    BBTalk,
    Comment,
    SubmissionReceipt,
    Tag,
    User,
)


def attachment_ids(items):
    values = set()
    for item in items or []:
        if isinstance(item, dict):
            try:
                values.add(str(UUID(str(item.get('uid') or item.get('id')))))
            except (ValueError, TypeError, AttributeError):
                pass
    return values


def sync_visibility(db, user_id, affected):
    if not affected:
        return
    public = set()
    for items in db.scalars(
        select(BBTalk.attachments).where(BBTalk.user_id == user_id, BBTalk.visibility == 'public')
    ):
        public.update(attachment_ids(items))
    for file in db.scalars(
        select(Attachment).where(Attachment.id.in_(affected), Attachment.owner_id == str(user_id))
    ):
        file.is_public = file.id in public


def tag_data(tag, count=None):
    result = {
        key: getattr(tag, key)
        for key in ('uid', 'name', 'color', 'sort_order', 'create_time', 'update_time')
    }
    if count is not None:
        result['bbtalk_count'] = count
    return result


def record_data(db, records):
    if not records:
        return []
    ids = set().union(*(attachment_ids(record.attachments) for record in records))
    files = (
        {file.id: file for file in db.scalars(select(Attachment).where(Attachment.id.in_(ids)))}
        if ids
        else {}
    )
    counts = dict(
        db.execute(
            select(Comment.bbtalk_id, func.count())
            .where(Comment.bbtalk_id.in_([r.id for r in records]))
            .group_by(Comment.bbtalk_id)
        ).all()
    )
    result = []
    for record in records:
        data = {
            key: getattr(record, key)
            for key in (
                'uid',
                'content',
                'visibility',
                'context',
                'is_pinned',
                'create_time',
                'update_time',
            )
        }
        data.update(
            user=record.user_id,
            tags=[tag_data(tag) for tag in record.tags],
            comment_count=counts.get(record.id, 0),
        )
        attachments = []
        for item in record.attachments or []:
            refs = attachment_ids([item])
            file = files.get(next(iter(refs))) if refs else None
            if file and file.owner_id == str(record.user_id):
                kind = file.mime_type.split('/')[0]
                attachments.append(
                    {
                        'uid': file.id,
                        'url': f'/api/v1/attachments/files/{file.id}/preview/',
                        'type': kind if kind in ('image', 'audio', 'video') else 'file',
                        'filename': file.original_name,
                        'mime_type': file.mime_type,
                        'file_size': file.size,
                        'is_public': file.is_public,
                    }
                )
            else:
                attachments.append(item)
        data['attachments'] = attachments
        result.append(data)
    return result


def owned_record(db, user, uid, lock=False):
    query = select(BBTalk).where(BBTalk.uid == uid, BBTalk.user_id == user.id)
    record = db.scalar(query.with_for_update() if lock else query)
    if not record:
        raise APIError(404, {'detail': '未找到。'})
    return record


def set_tags(db, record, names):
    tags = []
    for name in dict.fromkeys(name.strip() for name in (names or '').split(',')):
        if not name:
            continue
        if len(name) > 50:
            fail(400, '标签名称不能超过 50 个字符')
        tag = db.scalar(select(Tag).where(Tag.user_id == record.user_id, Tag.name == name))
        if not tag:
            tag = Tag(user_id=record.user_id, name=name)
            db.add(tag)
            db.flush()
        tags.append(tag)
    record.tags = tags


def validate_attachments(db, user, items):
    ids = attachment_ids(items)
    if ids and db.scalar(
        select(Attachment.id)
        .where(Attachment.id.in_(ids), Attachment.owner_id != str(user.id))
        .limit(1)
    ):
        raise APIError(400, {'attachments': ['不能引用其他用户的附件']})


def validate_key(key):
    if not isinstance(key, str) or not re.fullmatch(r'[A-Za-z0-9_-]{8,128}', key):
        fail(400, '提交标识必须是 8–128 位字母、数字、下划线或短横线')
    return key


def get_tag(db, user, uid):
    tag = db.scalar(select(Tag).where(Tag.user_id == user.id, Tag.uid == uid))
    if not tag:
        raise APIError(404, {'detail': '未找到。'})
    return tag


def remove_record(db, record):
    affected = attachment_ids(record.attachments)
    db.execute(
        update(SubmissionReceipt)
        .where(SubmissionReceipt.record_id == record.id)
        .values(record_id=None)
    )
    db.execute(delete(Comment).where(Comment.bbtalk_id == record.id))
    record.tags = []
    db.delete(record)
    db.flush()
    sync_visibility(db, record.user_id, affected)


def comment_data(db, comment):
    user = db.get(User, comment.user_id)
    return {
        **{key: getattr(comment, key) for key in ('uid', 'content', 'create_time', 'update_time')},
        'user': user.id,
        'bbtalk': comment.bbtalk_id,
        'user_display_name': user.display_name,
        'user_avatar': user.avatar,
        'user_username': user.username,
    }
