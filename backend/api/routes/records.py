import hashlib
import json
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError, OperationalError

from api.compat import reject_legacy_query_conflicts
from api.dependencies import DB, CurrentUser
from api.filters import filter_records
from api.pagination import paginate
from api.parameters import RecordUID, Revision
from core.errors import APIError, fail
from models import (
    BBTalk,
    Comment,
    RecordTag,
    SubmissionReceipt,
    Tag,
    User,
    now,
    tag_color,
)
from schemas.query import CommentQuery, DateCountsQuery, RecordQuery, TagQuery
from schemas.records import (
    CommentInput,
    RecordInput,
    RecordPatch,
    TagInput,
    TagPatch,
    TagReorderInput,
)
from schemas.responses import (
    CommentOutput,
    CommentPage,
    DateCountOutput,
    MessageOutput,
    RecordOutput,
    RecordPage,
    SuccessOutput,
    TagCountOutput,
    TagDeleteOutput,
    TagOutput,
)
from services.records import (
    attachment_ids,
    comment_data,
    comment_summaries,
    get_tag,
    owned_record,
    record_data,
    remove_record,
    set_tags,
    sync_visibility,
    tag_data,
    validate_attachments,
)

router = APIRouter(prefix='/api/v1/bbtalk', tags=['BBTalk'])


@router.get('', response_model=RecordPage, dependencies=[Depends(reject_legacy_query_conflicts)])
def feed(request: Request, db: DB, user: CurrentUser, params: Annotated[RecordQuery, Query()]):
    ordering = params.ordering
    sort = BBTalk.create_time if ordering.lstrip('-') == 'create_time' else BBTalk.update_time
    query = filter_records(
        select(BBTalk).where(BBTalk.user_id == user.id), params, request.app.state.settings
    ).order_by(
        BBTalk.is_pinned.desc(),
        sort.desc() if ordering.startswith('-') else sort.asc(),
        BBTalk.id.desc(),
    )
    result = paginate(db, query, request, params)
    result['total_count'] = db.scalar(
        select(func.count()).select_from(BBTalk).where(BBTalk.user_id == user.id)
    )
    result['results'] = record_data(db, result['results'])
    return result


@router.get(
    '/public', response_model=RecordPage, dependencies=[Depends(reject_legacy_query_conflicts)]
)
def public_feed(request: Request, db: DB, params: Annotated[RecordQuery, Query()]):
    ordering = params.ordering
    sort = BBTalk.create_time if ordering.lstrip('-') == 'create_time' else BBTalk.update_time
    query = filter_records(
        select(BBTalk).where(BBTalk.visibility == 'public'), params, request.app.state.settings
    ).order_by(sort.desc() if ordering.startswith('-') else sort.asc(), BBTalk.id.desc())
    result = paginate(db, query, request, params)
    result['total_count'] = db.scalar(
        select(func.count()).select_from(BBTalk).where(BBTalk.visibility == 'public')
    )
    result['results'] = record_data(db, result['results'])
    return result


@router.get('/public/{uid}', response_model=RecordOutput)
def public_record(uid: RecordUID, db: DB):
    record = db.scalar(select(BBTalk).where(BBTalk.uid == uid, BBTalk.visibility == 'public'))
    if not record:
        raise APIError(404, {'detail': '未找到。'})
    return record_data(db, [record])[0]


@router.get('/public/{uid}/comments', response_model=list[CommentOutput] | CommentPage)
def public_comments(
    uid: RecordUID, request: Request, db: DB, params: Annotated[CommentQuery, Query()]
):
    record = db.scalar(select(BBTalk).where(BBTalk.uid == uid, BBTalk.visibility == 'public'))
    if not record:
        raise APIError(404, {'detail': '未找到。'})
    return comment_list(db, record.id, request, params)


def replay(db, user, receipt, response, payload_hash=None):
    response.headers['Cache-Control'] = 'no-store'
    if payload_hash and receipt.payload_hash not in payload_hash:
        fail(409, '此提交标识已用于不同内容，请先核对原提交结果', code='submission_conflict')
    record = db.get(BBTalk, receipt.record_id) if receipt.record_id else None
    if not record or record.user_id != user.id:
        fail(410, '该提交曾成功，但记录已被删除，不会重复创建', code='submission_deleted')
    response.status_code = 200
    response.headers['Idempotency-Replayed'] = 'true'
    return record_data(db, [record])[0]


async def raw_json(request: Request):
    try:
        return await request.json()
    except (ValueError, UnicodeError):
        # The typed body produces FastAPI's validation error for non-JSON content.
        return None


def submission_hashes(original):
    """Preserve receipts when a client upgrades only the tags wire representation."""
    variants = [original]
    if 'tags' in original and not any(',' in name for name in original['tags']):
        legacy = {key: value for key, value in original.items() if key != 'tags'}
        if original['tags']:
            legacy['post_tags'] = ','.join(original['tags'])
        variants.append(legacy)
        if not original['tags']:
            variants.extend([{**legacy, 'post_tags': ''}, {**legacy, 'post_tags': None}])
    elif 'post_tags' in original:
        native = {key: value for key, value in original.items() if key != 'post_tags'}
        native['tags'] = [
            name.strip() for name in (original['post_tags'] or '').split(',') if name.strip()
        ]
        variants.append(native)
    return [
        hashlib.sha256(
            json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
        ).hexdigest()
        for value in variants
    ]


@router.post('', status_code=201, response_model=RecordOutput)
def create(
    data: RecordInput,
    request: Request,
    response: Response,
    db: DB,
    user: CurrentUser,
    original: Annotated[dict, Depends(raw_json)],
    key: Annotated[
        str | None, Header(alias='Idempotency-Key', pattern=r'^[A-Za-z0-9_-]{8,128}$')
    ] = None,
):
    payload_hash = submission_hashes(original)
    response.headers['Cache-Control'] = 'no-store'
    try:
        if key is not None:
            receipt = db.scalar(
                select(SubmissionReceipt).where(
                    SubmissionReceipt.user_id == user.id, SubmissionReceipt.key == key
                )
            )
            if receipt:
                return replay(db, user, receipt, response, payload_hash)
            receipt = SubmissionReceipt(user_id=user.id, key=key, payload_hash=payload_hash[0])
            db.add(receipt)
            db.flush()
        validate_attachments(db, user, data.attachments)
        values = data.model_dump(exclude={'tags'})
        values['context']['device'] = {
            'ip': request.client.host if request.client else None,
            'ua': request.headers.get('user-agent'),
        }
        record = BBTalk(user_id=user.id, **values)
        db.add(record)
        db.flush()
        set_tags(db, record, data.tags)
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


@router.get('/submission-status', response_model=RecordOutput)
def submission_status(
    response: Response,
    db: DB,
    user: CurrentUser,
    key: Annotated[str, Query(pattern=r'^[A-Za-z0-9_-]{8,128}$')],
):
    receipt = db.scalar(
        select(SubmissionReceipt).where(
            SubmissionReceipt.user_id == user.id, SubmissionReceipt.key == key
        )
    )
    if not receipt:
        raise APIError(404, {'detail': '未找到。'})
    return replay(db, user, receipt, response)


@router.get('/date-counts', response_model=list[DateCountOutput])
def date_counts(
    request: Request, db: DB, user: CurrentUser, params: Annotated[DateCountsQuery, Query()]
):
    config = request.app.state.settings
    year, month = params.year, params.month
    counts = {}
    for stamp in db.scalars(select(BBTalk.create_time).where(BBTalk.user_id == user.id)):
        date = stamp.astimezone(config.timezone).date()
        if (not year or date.year == year) and (not month or date.month == month):
            counts[date.isoformat()] = counts.get(date.isoformat(), 0) + 1
    return [{'date': key, 'count': value} for key, value in sorted(counts.items())]


@router.get('/tags', response_model=list[TagCountOutput])
def tags(db: DB, user: CurrentUser, params: Annotated[TagQuery, Query()]):
    query = (
        select(Tag, func.count(RecordTag.id))
        .outerjoin(RecordTag, RecordTag.tag_id == Tag.id)
        .where(Tag.user_id == user.id)
        .group_by(Tag.id)
    )
    if name := params.name:
        query = query.where(Tag.name == name)
    if search := params.search:
        query = query.where(Tag.name.contains(search, autoescape=True))
    orders = []
    for key in params.ordering:
        if key.lstrip('-') in {'sort_order', 'create_time', 'update_time'}:
            field = getattr(Tag, key.lstrip('-'))
            orders.append(field.desc() if key.startswith('-') else field.asc())
    return [tag_data(tag, count) for tag, count in db.execute(query.order_by(*orders).limit(2000))]


@router.post('/tags', response_model=TagOutput)
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


@router.post('/tags/reorder', response_model=MessageOutput | SuccessOutput)
def reorder(data: TagReorderInput, db: DB, user: CurrentUser):
    if data.uids is not None:
        return reorder_tags(data, db, user)
    items = data.items
    for item in items:
        db.execute(
            update(Tag)
            .where(Tag.user_id == user.id, Tag.uid == item.uid)
            .values(sort_order=item.sort_order)
        )
    db.commit()
    return {'message': '排序已更新'}


@router.get('/tags/{uid}', response_model=TagOutput)
def tag_detail(uid: RecordUID, db: DB, user: CurrentUser):
    return tag_data(get_tag(db, user, uid))


def reorder_tags(data: TagReorderInput, db: DB, user: CurrentUser):
    uids = data.uids
    tags = list(db.scalars(select(Tag).where(Tag.user_id == user.id)))
    if len(uids) != len(set(uids)) or set(uids) != {tag.uid for tag in tags}:
        fail(409, '标签列表已改变，请刷新后重新排序')
    order = {uid: index * 1000 for index, uid in enumerate(uids)}
    for tag in tags:
        tag.sort_order = order[tag.uid]
    db.commit()
    return {'success': True}


@router.patch('/tags/{uid}', response_model=TagOutput)
def edit_tag(uid: RecordUID, data: TagPatch, db: DB, user: CurrentUser):
    tag = get_tag(db, user, uid)
    if 'name' in data.model_fields_set:
        data.name = data.name.strip()
        if not data.name:
            fail(400, '标签名称不能为空')
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(tag, key, value)
    db.commit()
    return tag_data(tag)


@router.delete('/tags/{uid}', response_model=TagDeleteOutput)
def delete_tag(uid: RecordUID, db: DB, user: CurrentUser, delete_bbtalks: bool = False):
    tag = get_tag(db, user, uid)
    count = 0
    if delete_bbtalks:
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


@router.get('/{uid}', response_model=RecordOutput)
def detail(uid: RecordUID, db: DB, user: CurrentUser):
    return record_data(db, [owned_record(db, user, uid)])[0]


@router.patch('/{uid}', response_model=RecordOutput)
def edit(
    uid: RecordUID,
    data: RecordPatch,
    request: Request,
    response: Response,
    db: DB,
    user: CurrentUser,
    expected: Revision = None,
):
    response.headers['Cache-Control'] = 'no-store'
    record = owned_record(db, user, uid, lock=True)
    values = data.model_dump(exclude_unset=True, exclude={'tags'})
    if 'attachments' in values:
        validate_attachments(db, user, values['attachments'])
    old_ids = attachment_ids(record.attachments)
    if expected:
        stamp = expected
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
    if 'tags' in data.model_fields_set:
        set_tags(db, record, data.tags)
    db.flush()
    sync_visibility(db, user.id, old_ids | attachment_ids(record.attachments))
    db.commit()
    return record_data(db, [record])[0]


@router.put('/{uid}', response_model=RecordOutput)
def replace(
    uid: RecordUID,
    data: RecordInput,
    request: Request,
    response: Response,
    db: DB,
    user: CurrentUser,
    expected: Revision = None,
):
    # Deployed slash-URL clients historically used PUT for partial updates.
    values = data.model_dump(exclude_unset=request.url.path.endswith('/'))
    return edit(uid, RecordPatch.model_validate(values), request, response, db, user, expected)


@router.put('/tags/{uid}', response_model=TagOutput)
def replace_tag(uid: RecordUID, data: TagInput, db: DB, user: CurrentUser):
    return edit_tag(uid, TagPatch.model_validate(data.model_dump()), db, user)


@router.delete('/{uid}', status_code=204)
def delete_record(uid: RecordUID, db: DB, user: CurrentUser):
    remove_record(db, owned_record(db, user, uid))
    db.commit()
    return Response(status_code=204)


@router.post('/{uid}/pin', response_model=RecordOutput)
def pin(uid: RecordUID, db: DB, user: CurrentUser):
    record = owned_record(db, user, uid)
    db.execute(
        update(BBTalk)
        .where(BBTalk.id == record.id)
        .values(is_pinned=~BBTalk.is_pinned, update_time=BBTalk.update_time)
    )
    db.commit()
    db.refresh(record)
    return record_data(db, [record])[0]


def comment_list(db, record_id, request, params):
    query = (
        select(Comment, User)
        .join(User, User.id == Comment.user_id)
        .where(Comment.bbtalk_id == record_id)
        .order_by(Comment.create_time, Comment.id)
    )
    if params.page is None:
        return [comment_data(db, comment, user) for comment, user in db.execute(query)]
    summary = comment_summaries(db, [record_id])[record_id]
    page, size, total = params.page, params.page_size, summary['count']
    if page > 1 and (page - 1) * size >= total:
        raise APIError(404, {'detail': '无效页码。'})
    rows = db.execute(query.offset((page - 1) * size).limit(size))
    return {
        **summary,
        'next': str(request.url.include_query_params(page=page + 1))
        if page * size < total
        else None,
        'previous': str(request.url.include_query_params(page=page - 1)) if page > 1 else None,
        'results': [comment_data(db, comment, user) for comment, user in rows],
    }


@router.get('/{uid}/comments', response_model=list[CommentOutput] | CommentPage)
def comments(
    uid: RecordUID,
    request: Request,
    db: DB,
    user: CurrentUser,
    params: Annotated[CommentQuery, Query()],
):
    record = owned_record(db, user, uid)
    return comment_list(db, record.id, request, params)


@router.post('/{uid}/comments', status_code=201, response_model=CommentOutput)
def add_comment(uid: RecordUID, data: CommentInput, db: DB, user: CurrentUser):
    record = owned_record(db, user, uid)
    if not data.content.strip():
        fail(400, '评论不能为空')
    comment = Comment(user_id=user.id, bbtalk_id=record.id, content=data.content.strip())
    db.add(comment)
    db.commit()
    return comment_data(db, comment)


@router.delete('/{uid}/comments/{comment_uid}', status_code=204)
def delete_comment(uid: RecordUID, comment_uid: RecordUID, db: DB, user: CurrentUser):
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
