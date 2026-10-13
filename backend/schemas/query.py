"""Typed query parameters for the current API."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

TagName = Annotated[str, Field(min_length=1, max_length=50)]
RecordOrder = Literal['create_time', '-create_time', 'update_time', '-update_time']
TagOrder = Literal[
    'sort_order', '-sort_order', 'create_time', '-create_time', 'update_time', '-update_time'
]


class QueryInput(BaseModel):
    model_config = ConfigDict(extra='forbid')


class PaginationQuery(QueryInput):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=100, ge=1, le=100)


class AttachmentQuery(PaginationQuery):
    page_size: int = Field(default=20, ge=1, le=100)


class CommentQuery(QueryInput):
    page: int = Field(default=1, ge=1)
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


class TagQuery(QueryInput):
    name: str | None = None
    search: str | None = None
    ordering: list[TagOrder] = Field(default_factory=lambda: ['sort_order', '-update_time'])

    @field_validator('ordering', mode='before')
    @classmethod
    def comma_separated_ordering(cls, value):
        values = [value] if isinstance(value, str) else value
        return [part for item in values for part in item.split(',')]


class DateCountsQuery(QueryInput):
    year: int | None = Field(default=None, ge=1, le=9999)
    month: int | None = Field(default=None, ge=1, le=12)


class ExportQuery(QueryInput):
    format: Literal['json', 'zip'] = 'json'
    include_attachments: bool = False
