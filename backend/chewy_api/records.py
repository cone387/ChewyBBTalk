import hashlib
import json
import re
import shlex
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Request, Response, Depends
from sqlalchemy import select, func, delete, update, or_, exists
from sqlalchemy.exc import IntegrityError, OperationalError

from .dependencies import DB, CurrentUser
from .errors import APIError, fail
from .models import BBTalk, Tag, Comment, User, Attachment, SubmissionReceipt, RecordTag, now, tag_color
from .schemas import RecordInput, RecordPatch, TagInput, CommentInput

router = APIRouter(prefix='/api/v1/bbtalk', tags=['BBTalk'])


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
    for items in db.scalars(select(BBTalk.attachments).where(BBTalk.user_id == user_id, BBTalk.visibility == 'public')):
        public.update(attachment_ids(items))
    for file in db.scalars(select(Attachment).where(Attachment.id.in_(affected), Attachment.owner_id == str(user_id))):
        file.is_public = file.id in public


def tag_data(tag, count=None):
    result = {key: getattr(tag, key) for key in ('uid', 'name', 'color', 'sort_order', 'create_time', 'update_time')}
    if count is not None:
        result['bbtalk_count'] = count
    return result


def record_data(db, records):
    if not records:
        return []
    ids = set().union(*(attachment_ids(record.attachments) for record in records))
    files = {file.id: file for file in db.scalars(select(Attachment).where(Attachment.id.in_(ids)))} if ids else {}
    counts = dict(db.execute(select(Comment.bbtalk_id, func.count()).where(Comment.bbtalk_id.in_([r.id for r in records])).group_by(Comment.bbtalk_id)).all())
    result = []
    for record in records:
        data = {key: getattr(record, key) for key in ('uid', 'content', 'visibility', 'context', 'is_pinned', 'create_time', 'update_time')}
        data.update(user=record.user_id, tags=[tag_data(tag) for tag in record.tags], comment_count=counts.get(record.id, 0))
        attachments = []
        for item in record.attachments or []:
            refs = attachment_ids([item])
            file = files.get(next(iter(refs))) if refs else None
            if file and file.owner_id == str(record.user_id):
                kind = file.mime_type.split('/')[0]
                attachments.append({'uid': file.id, 'url': f'/api/v1/attachments/files/{file.id}/preview/', 'type': kind if kind in ('image', 'audio', 'video') else 'file', 'filename': file.original_name, 'mime_type': file.mime_type, 'file_size': file.size, 'is_public': file.is_public})
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


def parse_date(value, settings):
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed.replace(tzinfo=settings.timezone) if parsed.tzinfo is None else parsed
    except (ValueError, TypeError):
        fail(400, '日期格式无效')


def filter_records(query, request):
    params, settings = request.query_params, request.app.state.settings
    if name := params.get('tags__name'):
        query = query.where(BBTalk.tags.any(Tag.name == name))
    if visibility := params.get('visibility'):
        query = query.where(BBTalk.visibility == visibility)
    if search := params.get('search'):
        try:
            terms = shlex.split(search.replace(',', ' '))
        except ValueError:
            terms = search.split()
        for term in terms:
            query = query.where(or_(BBTalk.content.contains(term, autoescape=True), BBTalk.tags.any(Tag.name.contains(term, autoescape=True))))
    for key, operation in [('create_time__gte', 'gte'), ('create_time__lte', 'lte'), ('create_date__gte', 'gte'), ('create_date__lte', 'date_lte'), ('create_time__date', 'day')]:
        if raw := params.get(key):
            stamp = parse_date(raw, settings)
            if operation in ('gte', 'day'):
                query = query.where(BBTalk.create_time >= stamp)
            if operation == 'lte':
                query = query.where(BBTalk.create_time <= stamp)
            if operation in ('date_lte', 'day'):
                query = query.where(BBTalk.create_time < stamp + timedelta(days=1))
    if params.get('has_attachments', '').lower() in ('true', 'false'):
        from sqlalchemy import JSON
        empty = or_(BBTalk.attachments == [], BBTalk.attachments == JSON.NULL, BBTalk.attachments.is_(None))
        query = query.where(~empty if params['has_attachments'].lower() == 'true' else empty)
    return query


def paginate(db, query, request, size=100):
    try:
        page = int(request.query_params.get('page', '1'))
        if page < 1:
            raise ValueError
    except ValueError:
        raise APIError(404, {'detail': '无效页码。'})
    total = db.scalar(select(func.count()).select_from(query.order_by(None).subquery()))
    if page > 1 and (page - 1) * size >= total:
        raise APIError(404, {'detail': '无效页码。'})
    records = list(db.scalars(query.offset((page - 1) * size).limit(size)))
    return {'count': total, 'next': str(request.url.include_query_params(page=page + 1)) if page * size < total else None, 'previous': str(request.url.include_query_params(page=page - 1)) if page > 1 else None, 'results': records}


@router.get('/')
def feed(request: Request, db: DB, user: CurrentUser):
    query = filter_records(select(BBTalk).where(BBTalk.user_id == user.id), request).order_by(BBTalk.is_pinned.desc(), BBTalk.update_time.desc(), BBTalk.id.desc())
    result = paginate(db, query, request)
    result['results'] = record_data(db, result['results'])
    return result


@router.get('/public/')
def public_feed(request: Request, db: DB):
    query = filter_records(select(BBTalk).where(BBTalk.visibility == 'public'), request).order_by(BBTalk.update_time.desc(), BBTalk.id.desc())
    result = paginate(db, query, request)
    result['results'] = record_data(db, result['results'])
    return result


@router.get('/public/{uid}/')
def public_record(uid: str, db: DB):
    record = db.scalar(select(BBTalk).where(BBTalk.uid == uid, BBTalk.visibility == 'public'))
    if not record:
        raise APIError(404, {'detail': '未找到。'})
    return record_data(db, [record])[0]


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
    if ids and db.scalar(select(Attachment.id).where(Attachment.id.in_(ids), Attachment.owner_id != str(user.id)).limit(1)):
        raise APIError(400, {'attachments': ['不能引用其他用户的附件']})


def validate_key(key):
    if not isinstance(key, str) or not re.fullmatch(r'[A-Za-z0-9_-]{8,128}', key):
        fail(400, '提交标识必须是 8–128 位字母、数字、下划线或短横线')
    return key


def replay(db, user, receipt, response, payload_hash=None):
    response.headers['Cache-Control'] = 'no-store'
    if payload_hash and receipt.payload_hash != payload_hash:
        fail(409, '此提交标识已用于不同内容，请先核对原提交结果', code='submission_conflict')
    record = db.get(BBTalk, receipt.record_id) if receipt.record_id else None
    if not record or record.user_id != user.id:
        fail(410, '该提交曾成功，但记录已被删除，不会重复创建', code='submission_deleted')
    response.status_code = 200
    response.headers['Idempotency-Replayed'] = 'true'
    return record_data(db, [record])[0]


async def raw_json(request: Request):
    return await request.json()


@router.post('/', status_code=201)
def create(data: RecordInput, request: Request, response: Response, db: DB, user: CurrentUser, original: dict = Depends(raw_json)):
    key = request.headers.get('idempotency-key')
    payload_hash = hashlib.sha256(json.dumps(original, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
    response.headers['Cache-Control'] = 'no-store'
    try:
        if key is not None:
            validate_key(key)
            receipt = db.scalar(select(SubmissionReceipt).where(SubmissionReceipt.user_id == user.id, SubmissionReceipt.key == key))
            if receipt:
                return replay(db, user, receipt, response, payload_hash)
            receipt = SubmissionReceipt(user_id=user.id, key=key, payload_hash=payload_hash)
            db.add(receipt)
            db.flush()
        validate_attachments(db, user, data.attachments)
        values = data.model_dump(exclude={'post_tags'})
        if not values['content'].strip():
            fail(400, '内容不能为空')
        values['context']['device'] = {'ip': request.client.host if request.client else None, 'ua': request.headers.get('user-agent')}
        record = BBTalk(user_id=user.id, **values)
        db.add(record)
        db.flush()
        set_tags(db, record, data.post_tags)
        if key is not None:
            receipt.record_id = record.id
        sync_visibility(db, user.id, attachment_ids(record.attachments))
        db.commit()
        return record_data(db, [record])[0]
    except IntegrityError:
        db.rollback()
        receipt = db.scalar(select(SubmissionReceipt).where(SubmissionReceipt.user_id == user.id, SubmissionReceipt.key == key)) if key else None
        if receipt:
            return replay(db, user, receipt, response, payload_hash)
        raise
    except OperationalError:
        db.rollback()
        raise APIError(503, {'error': '服务器暂时无法确认提交，请保留原提交标识并稍后重试', 'code': 'submission_retry'}, {'Retry-After': '1'})


@router.get('/submission-status/')
def submission_status(request: Request, response: Response, db: DB, user: CurrentUser):
    key = validate_key(request.query_params.get('key'))
    receipt = db.scalar(select(SubmissionReceipt).where(SubmissionReceipt.user_id == user.id, SubmissionReceipt.key == key))
    if not receipt:
        raise APIError(404, {'detail': '未找到。'})
    return replay(db, user, receipt, response)


@router.get('/date-counts/')
def date_counts(request: Request, db: DB, user: CurrentUser):
    config = request.app.state.settings
    try:
        year = int(request.query_params['year']) if request.query_params.get('year') else None
        month = int(request.query_params['month']) if request.query_params.get('month') else None
        if month and not 1 <= month <= 12:
            raise ValueError
    except ValueError:
        fail(400, '年月参数无效')
    counts = {}
    for stamp in db.scalars(select(BBTalk.create_time).where(BBTalk.user_id == user.id)):
        date = stamp.astimezone(config.timezone).date()
        if (not year or date.year == year) and (not month or date.month == month):
            counts[date.isoformat()] = counts.get(date.isoformat(), 0) + 1
    return [{'date': key, 'count': value} for key, value in sorted(counts.items())]


@router.get('/tags/')
def tags(request: Request, db: DB, user: CurrentUser):
    query = select(Tag, func.count(RecordTag.id)).join(RecordTag, RecordTag.tag_id == Tag.id).where(Tag.user_id == user.id).group_by(Tag.id)
    if name := request.query_params.get('name'):
        query = query.where(Tag.name == name)
    if search := request.query_params.get('search'):
        query = query.where(Tag.name.contains(search, autoescape=True))
    orders = []
    for key in request.query_params.get('ordering', 'sort_order,-update_time').split(','):
        if key.lstrip('-') in {'sort_order', 'create_time', 'update_time'}:
            field = getattr(Tag, key.lstrip('-'))
            orders.append(field.desc() if key.startswith('-') else field.asc())
    return [tag_data(tag, count) for tag, count in db.execute(query.order_by(*orders).limit(2000))]


@router.post('/tags/')
def create_tag(data: TagInput, response: Response, db: DB, user: CurrentUser):
    name = data.name.strip()
    if not name:
        fail(400, '标签名称不能为空')
    tag = db.scalar(select(Tag).where(Tag.user_id == user.id, Tag.name == name))
    response.status_code = 200 if tag else 201
    if not tag:
        tag = Tag(user_id=user.id, name=name)
        db.add(tag)
    tag.color, tag.sort_order = data.color or tag_color(), data.sort_order
    db.commit()
    return tag_data(tag)


@router.post('/tags/reorder/')
def reorder(data: dict, db: DB, user: CurrentUser):
    items = data.get('items', [])
    if not isinstance(items, list) or not items:
        fail(400, '请提供排序数据')
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get('sort_order'), (float, int)):
            fail(400, '排序数据无效')
        db.execute(update(Tag).where(Tag.user_id == user.id, Tag.uid == item.get('uid')).values(sort_order=item['sort_order']))
    db.commit()
    return {'message': '排序已更新'}


def get_tag(db, user, uid):
    tag = db.scalar(select(Tag).where(Tag.user_id == user.id, Tag.uid == uid))
    if not tag:
        raise APIError(404, {'detail': '未找到。'})
    return tag


@router.get('/tags/{uid}/')
def tag_detail(uid: str, db: DB, user: CurrentUser):
    return tag_data(get_tag(db, user, uid))


@router.patch('/tags/{uid}/')
@router.put('/tags/{uid}/')
def edit_tag(uid: str, data: TagInput, db: DB, user: CurrentUser):
    tag = get_tag(db, user, uid)
    if 'name' in data.model_fields_set:
        data.name = data.name.strip()
        if not data.name:
            fail(400, '标签名称不能为空')
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(tag, key, value)
    db.commit()
    return tag_data(tag)


def remove_record(db, record):
    affected = attachment_ids(record.attachments)
    db.execute(update(SubmissionReceipt).where(SubmissionReceipt.record_id == record.id).values(record_id=None))
    db.execute(delete(Comment).where(Comment.bbtalk_id == record.id))
    record.tags = []
    db.delete(record)
    db.flush()
    sync_visibility(db, record.user_id, affected)


@router.delete('/tags/{uid}/')
def delete_tag(uid: str, request: Request, db: DB, user: CurrentUser):
    tag = get_tag(db, user, uid)
    count = 0
    if request.query_params.get('delete_bbtalks', '').lower() == 'true':
        for record in db.scalars(select(BBTalk).where(BBTalk.user_id == user.id, BBTalk.tags.any(Tag.id == tag.id))):
            if len(record.tags) == 1:
                remove_record(db, record)
                count += 1
    db.execute(delete(RecordTag).where(RecordTag.tag_id == tag.id))
    db.delete(tag)
    db.commit()
    return {'deleted_bbtalks': count}


@router.get('/{uid}/')
def detail(uid: str, db: DB, user: CurrentUser):
    return record_data(db, [owned_record(db, user, uid)])[0]


@router.put('/{uid}/')
@router.patch('/{uid}/')
def edit(uid: str, data: RecordPatch, request: Request, response: Response, db: DB, user: CurrentUser):
    response.headers['Cache-Control'] = 'no-store'
    record = owned_record(db, user, uid, lock=True)
    values = data.model_dump(exclude_unset=True, exclude={'post_tags'})
    if request.method == 'PUT' and 'content' not in values:
        fail(400, '内容不能为空')
    if 'content' in values and not values['content'].strip():
        fail(400, '内容不能为空')
    if 'attachments' in values:
        validate_attachments(db, user, values['attachments'])
    old_ids = attachment_ids(record.attachments)
    expected = request.headers.get('if-match')
    if expected:
        try:
            stamp = datetime.fromisoformat(expected.strip('"').replace('Z', '+00:00'))
            if stamp.tzinfo is None:
                raise ValueError
        except ValueError:
            fail(400, 'If-Match 必须为记录的完整更新时间')
        if record.update_time != stamp:
            fail(409, '记录已在其他地方修改，请核对最新内容后再保存', code='edit_conflict', current=record_data(db, [record])[0])
        changed = db.execute(update(BBTalk).where(BBTalk.id == record.id, BBTalk.update_time == stamp).values(**values, update_time=now())).rowcount
        if changed != 1:
            db.rollback()
            db.refresh(record)
            fail(409, '记录已在其他地方修改', code='edit_conflict', current=record_data(db, [record])[0])
        db.refresh(record)
    else:
        for key, value in values.items():
            setattr(record, key, value)
        record.update_time = now()
    if 'post_tags' in data.model_fields_set:
        set_tags(db, record, data.post_tags)
    db.flush()
    sync_visibility(db, user.id, old_ids | attachment_ids(record.attachments))
    db.commit()
    return record_data(db, [record])[0]


@router.delete('/{uid}/', status_code=204)
def delete_record(uid: str, db: DB, user: CurrentUser):
    remove_record(db, owned_record(db, user, uid))
    db.commit()
    return Response(status_code=204)


@router.post('/{uid}/pin/')
def pin(uid: str, db: DB, user: CurrentUser):
    record = owned_record(db, user, uid)
    db.execute(update(BBTalk).where(BBTalk.id == record.id).values(is_pinned=~BBTalk.is_pinned, update_time=BBTalk.update_time))
    db.commit()
    db.refresh(record)
    return record_data(db, [record])[0]


def comment_data(db, comment):
    user = db.get(User, comment.user_id)
    return {**{key: getattr(comment, key) for key in ('uid', 'content', 'create_time', 'update_time')}, 'user': user.id, 'bbtalk': comment.bbtalk_id, 'user_display_name': user.display_name, 'user_avatar': user.avatar, 'user_username': user.username}


@router.get('/{uid}/comments/')
def comments(uid: str, db: DB, user: CurrentUser):
    record = owned_record(db, user, uid)
    return [comment_data(db, item) for item in db.scalars(select(Comment).where(Comment.bbtalk_id == record.id).order_by(Comment.create_time))]


@router.post('/{uid}/comments/', status_code=201)
def add_comment(uid: str, data: CommentInput, db: DB, user: CurrentUser):
    record = owned_record(db, user, uid)
    if not data.content.strip():
        fail(400, '评论不能为空')
    comment = Comment(user_id=user.id, bbtalk_id=record.id, content=data.content.strip())
    db.add(comment)
    db.commit()
    return comment_data(db, comment)


@router.delete('/{uid}/comments/{comment_uid}/', status_code=204)
def delete_comment(uid: str, comment_uid: str, db: DB, user: CurrentUser):
    record = owned_record(db, user, uid)
    comment = db.scalar(select(Comment).where(Comment.uid == comment_uid, Comment.bbtalk_id == record.id, Comment.user_id == user.id))
    if not comment:
        raise APIError(404, {'detail': '未找到。'})
    db.delete(comment)
    db.commit()
    return Response(status_code=204)
