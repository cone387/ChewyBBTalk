from sqlalchemy import func, select


def paginate(db, query, request, params):
    page, size = params.page, params.page_size
    total = db.scalar(select(func.count()).select_from(query.order_by(None).subquery()))
    records = list(db.scalars(query.offset((page - 1) * size).limit(size)))
    return {
        'total': total,
        'page': page,
        'page_size': size,
        'has_more': page * size < total,
        'items': records,
    }
