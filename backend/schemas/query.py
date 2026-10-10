"""Typed HTTP query contracts, including narrowly scoped legacy input aliases."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

TagName = Annotated[str, Field(min_length=1, max_length=50)]
RecordOrder = Literal['create_time', '-create_time', 'update_time', '-update_time']
TagOrder = Literal[
    'sort_order', '-sort_order', 'create_time', '-create_time', 'update_time', '-update_time'
]


def rename_legacy(values, aliases):
    values = dict(values)
    for old, new in aliases.items():
        if old not in values:
            continue
        value = values.pop(old)
        if values.get(new) not in (None, '', [], 'json'):
            raise ValueError(f'不能同时提供 {old} 和 {new}')
        values[new] = value
    return values


class PaginationQuery(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=100, ge=1, le=100)


class AttachmentQuery(PaginationQuery):
    page_size: int = Field(default=20, ge=1, le=100)


class CommentQuery(BaseModel):
    page: int | None = Field(default=None, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class RecordQuery(PaginationQuery):
    search: str | None = None
    tags: list[TagName] = Field(default_factory=list)
    visibility: Literal['public', 'private'] | None = None
    ordering: RecordOrder = '-update_time'
    has_attachments: bool | None = None
    created_from: datetime | None = None
    created_to: datetime | None = None
    created_date_from: date | None = None
    created_date_to: date | None = Field(default=None, lt=date.max)
    created_on: date | None = Field(default=None, lt=date.max)

    @model_validator(mode='before')
    @classmethod
    def legacy_names(cls, values):
        values = rename_legacy(
            values,
            {
                'tags__name': 'tags',
                'create_time__gte': 'created_from',
                'create_time__lte': 'created_to',
                'create_date__gte': 'created_date_from',
                'create_date__lte': 'created_date_to',
                'create_time__date': 'created_on',
            },
        )
        if isinstance(values.get('tags'), str):
            values['tags'] = [name.strip() for name in values['tags'].split(',') if name.strip()]
        return values


class TagQuery(BaseModel):
    name: str | None = None
    search: str | None = None
    ordering: list[TagOrder] = Field(default_factory=lambda: ['sort_order', '-update_time'])

    @field_validator('ordering', mode='before')
    @classmethod
    def comma_separated_ordering(cls, value):
        values = [value] if isinstance(value, str) else value
        return [part for item in values for part in item.split(',')]


class DateCountsQuery(BaseModel):
    year: int | None = Field(default=None, ge=1, le=9999)
    month: int | None = Field(default=None, ge=1, le=12)


class ExportQuery(BaseModel):
    format: Literal['json', 'zip'] = 'json'
    include_attachments: bool = False

    @model_validator(mode='before')
    @classmethod
    def legacy_format(cls, values):
        return rename_legacy(values, {'export_format': 'format'})
