from sqlalchemy import func, select

from core.errors import APIError


def paginate(db, query, request, params):
    page, size = params.page, params.page_size
    total = db.scalar(select(func.count()).select_from(query.order_by(None).subquery()))
    if page > 1 and (page - 1) * size >= total:
        raise APIError(404, {'detail': '无效页码。'})
    records = list(db.scalars(query.offset((page - 1) * size).limit(size)))
    return {
        'count': total,
        'next': str(request.url.include_query_params(page=page + 1))
        if page * size < total
        else None,
        'previous': str(request.url.include_query_params(page=page - 1)) if page > 1 else None,
        'results': records,
    }
