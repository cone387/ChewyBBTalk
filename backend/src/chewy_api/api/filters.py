import shlex
from datetime import datetime, timedelta

from sqlalchemy import or_

from chewy_api.core.errors import fail
from chewy_api.db.models import BBTalk, Tag


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
            query = query.where(
                or_(
                    BBTalk.content.contains(term, autoescape=True),
                    BBTalk.tags.any(Tag.name.contains(term, autoescape=True)),
                )
            )
    for key, operation in [
        ('create_time__gte', 'gte'),
        ('create_time__lte', 'lte'),
        ('create_date__gte', 'gte'),
        ('create_date__lte', 'date_lte'),
        ('create_time__date', 'day'),
    ]:
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

        empty = or_(
            BBTalk.attachments == [], BBTalk.attachments == JSON.NULL, BBTalk.attachments.is_(None)
        )
        query = query.where(~empty if params['has_attachments'].lower() == 'true' else empty)
    return query
