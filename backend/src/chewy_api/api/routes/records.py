import hashlib
import json
from datetime import datetime

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError, OperationalError

from chewy_api.api.dependencies import DB, CurrentUser
from chewy_api.api.filters import filter_records
from chewy_api.api.pagination import paginate
from chewy_api.core.errors import APIError, fail
from chewy_api.db.models import (
    BBTalk,
    Comment,
    RecordTag,
    SubmissionReceipt,
    Tag,
    now,
    tag_color,
)
from chewy_api.schemas.records import CommentInput, RecordInput, RecordPatch, TagInput
from chewy_api.services.records import (
    attachment_ids,
    comment_data,
    get_tag,
    owned_record,
    record_data,
    remove_record,
    set_tags,
    sync_visibility,
    tag_data,
    validate_attachments,
    validate_key,
)

router = APIRouter(prefix='/api/v1/bbtalk', tags=['BBTalk'])


@router.get('/')
def feed(request: Request, db: DB, user: CurrentUser):
    query = filter_records(select(BBTalk).where(BBTalk.user_id == user.id), request).order_by(
        BBTalk.is_pinned.desc(), BBTalk.update_time.desc(), BBTalk.id.desc()
    )
    result = paginate(db, query, request)
    result['results'] = record_data(db, result['results'])
    return result


@router.get('/public/')
def public_feed(request: Request, db: DB):
    query = filter_records(select(BBTalk).where(BBTalk.visibility == 'public'), request).order_by(
        BBTalk.update_time.desc(), BBTalk.id.desc()
    )
    result = paginate(db, query, request)
    result['results'] = record_data(db, result['results'])
    return result


@router.get('/public/{uid}/')
def public_record(uid: str, db: DB):
    record = db.scalar(select(BBTalk).where(BBTalk.uid == uid, BBTalk.visibility == 'public'))
    if not record:
        raise APIError(404, {'detail': '未找到。'})
    return record_data(db, [record])[0]


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
def create(
    data: RecordInput,
    request: Request,
    response: Response,
    db: DB,
    user: CurrentUser,
    original: dict = Depends(raw_json),
):
    key = request.headers.get('idempotency-key')
    payload_hash = hashlib.sha256(
        json.dumps(original, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
    ).hexdigest()
    response.headers['Cache-Control'] = 'no-store'
    try:
        if key is not None:
            validate_key(key)
            receipt = db.scalar(
                select(SubmissionReceipt).where(
                    SubmissionReceipt.user_id == user.id, SubmissionReceipt.key == key
                )
            )
            if receipt:
                return replay(db, user, receipt, response, payload_hash)
            receipt = SubmissionReceipt(user_id=user.id, key=key, payload_hash=payload_hash)
            db.add(receipt)
            db.flush()
        validate_attachments(db, user, data.attachments)
        values = data.model_dump(exclude={'post_tags'})
        if not values['content'].strip():
            fail(400, '内容不能为空')
        values['context']['device'] = {
            'ip': request.client.host if request.client else None,
            'ua': request.headers.get('user-agent'),
        }
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
        receipt = (
            db.scalar(
                select(SubmissionReceipt).where(
                    SubmissionReceipt.user_id == user.id, SubmissionReceipt.key == key
                )
            )
            if key
            else None
        )
        if receipt:
            return replay(db, user, receipt, response, payload_hash)
        raise
    except OperationalError:
        db.rollback()
        raise APIError(
            503,
            {
                'error': '服务器暂时无法确认提交，请保留原提交标识并稍后重试',
                'code': 'submission_retry',
            },
            {'Retry-After': '1'},
        )


@router.get('/submission-status/')
def submission_status(request: Request, response: Response, db: DB, user: CurrentUser):
    key = validate_key(request.query_params.get('key'))
    receipt = db.scalar(
        select(SubmissionReceipt).where(
            SubmissionReceipt.user_id == user.id, SubmissionReceipt.key == key
        )
    )
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
    query = (
        select(Tag, func.count(RecordTag.id))
        .join(RecordTag, RecordTag.tag_id == Tag.id)
        .where(Tag.user_id == user.id)
        .group_by(Tag.id)
    )
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
        db.execute(
            update(Tag)
            .where(Tag.user_id == user.id, Tag.uid == item.get('uid'))
            .values(sort_order=item['sort_order'])
        )
    db.commit()
    return {'message': '排序已更新'}


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


@router.delete('/tags/{uid}/')
def delete_tag(uid: str, request: Request, db: DB, user: CurrentUser):
    tag = get_tag(db, user, uid)
    count = 0
    if request.query_params.get('delete_bbtalks', '').lower() == 'true':
        for record in db.scalars(
            select(BBTalk).where(BBTalk.user_id == user.id, BBTalk.tags.any(Tag.id == tag.id))
        ):
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
def edit(
    uid: str, data: RecordPatch, request: Request, response: Response, db: DB, user: CurrentUser
):
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
            fail(
                409,
                '记录已在其他地方修改，请核对最新内容后再保存',
                code='edit_conflict',
                current=record_data(db, [record])[0],
            )
        changed = db.execute(
            update(BBTalk)
            .where(BBTalk.id == record.id, BBTalk.update_time == stamp)
            .values(**values, update_time=now())
        ).rowcount
        if changed != 1:
            db.rollback()
            db.refresh(record)
            fail(
                409,
                '记录已在其他地方修改',
                code='edit_conflict',
                current=record_data(db, [record])[0],
            )
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
    db.execute(
        update(BBTalk)
        .where(BBTalk.id == record.id)
        .values(is_pinned=~BBTalk.is_pinned, update_time=BBTalk.update_time)
    )
    db.commit()
    db.refresh(record)
    return record_data(db, [record])[0]


@router.get('/{uid}/comments/')
def comments(uid: str, db: DB, user: CurrentUser):
    record = owned_record(db, user, uid)
    return [
        comment_data(db, item)
        for item in db.scalars(
            select(Comment).where(Comment.bbtalk_id == record.id).order_by(Comment.create_time)
        )
    ]


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
    comment = db.scalar(
        select(Comment).where(
            Comment.uid == comment_uid, Comment.bbtalk_id == record.id, Comment.user_id == user.id
        )
    )
    if not comment:
        raise APIError(404, {'detail': '未找到。'})
    db.delete(comment)
    db.commit()
    return Response(status_code=204)
