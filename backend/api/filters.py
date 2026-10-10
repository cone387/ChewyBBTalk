import shlex
from datetime import datetime, time, timedelta

from sqlalchemy import or_

from models import BBTalk, Tag


def filter_records(query, params, settings):
    for tag_name in params.tags:
        query = query.where(BBTalk.tags.any(Tag.name == tag_name))
    if visibility := params.visibility:
        query = query.where(BBTalk.visibility == visibility)
    if search := params.search:
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
        ('created_from', 'gte'),
        ('created_to', 'lte'),
        ('created_date_from', 'gte'),
        ('created_date_to', 'date_lte'),
        ('created_on', 'day'),
    ]:
        if raw := getattr(params, key):
            stamp = raw if isinstance(raw, datetime) else datetime.combine(raw, time.min)
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=settings.timezone)
            if operation in ('gte', 'day'):
                query = query.where(BBTalk.create_time >= stamp)
            if operation == 'lte':
                query = query.where(BBTalk.create_time <= stamp)
            if operation in ('date_lte', 'day'):
                query = query.where(BBTalk.create_time < stamp + timedelta(days=1))
    if params.has_attachments is not None:
        from sqlalchemy import JSON

        empty = or_(
            BBTalk.attachments == [], BBTalk.attachments == JSON.NULL, BBTalk.attachments.is_(None)
        )
        query = query.where(~empty if params.has_attachments else empty)
    return query
