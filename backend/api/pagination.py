from sqlalchemy import func, select

from core.errors import APIError


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
    return {
        'count': total,
        'next': str(request.url.include_query_params(page=page + 1))
        if page * size < total
        else None,
        'previous': str(request.url.include_query_params(page=page - 1)) if page > 1 else None,
        'results': records,
    }
