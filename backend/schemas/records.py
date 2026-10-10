from typing import Annotated, Any, Literal

from pydantic import Field, StrictFloat, StrictInt, field_validator, model_validator

from schemas.base import Input
from schemas.query import TagName


class RecordFields(Input):
    tags: list[TagName] = Field(default_factory=list)

    @field_validator('tags')
    @classmethod
    def nonblank_tags(cls, values):
        if any(not value.strip() for value in values):
            raise ValueError('标签名称不能为空')
        return list(dict.fromkeys(value.strip() for value in values))

    @field_validator('content', check_fields=False)
    @classmethod
    def nonblank_content(cls, value):
        if not value.strip():
            raise ValueError('内容不能为空')
        return value

    @model_validator(mode='before')
    @classmethod
    def legacy_tags(cls, values):
        if not isinstance(values, dict) or 'post_tags' not in values:
            return values
        values = dict(values)
        if 'tags' in values:
            raise ValueError('不能同时提供 tags 和 post_tags')
        names = values.pop('post_tags')
        if names is not None and not isinstance(names, str):
            raise ValueError('post_tags 必须是字符串')
        values['tags'] = [name.strip() for name in (names or '').split(',') if name.strip()]
        return values


class RecordInput(RecordFields):
    content: str = Field(min_length=1)
    visibility: Literal['public', 'private'] = 'private'
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    context: dict[str, Any] = Field(default_factory=dict)
    is_pinned: bool = False


class RecordPatch(RecordFields):
    content: str = Field(default='', min_length=1)
    visibility: Literal['public', 'private'] = 'private'
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    context: dict[str, Any] = Field(default_factory=dict)
    is_pinned: bool = False


class TagInput(Input):
    name: str = Field(min_length=1, max_length=50)
    color: str = Field(default='', pattern=r'^$|^#[0-9a-fA-F]{6}$')
    sort_order: float = Field(default=0, allow_inf_nan=False)

    @field_validator('name')
    @classmethod
    def nonblank_name(cls, value):
        if not value.strip():
            raise ValueError('标签名称不能为空')
        return value.strip()


class TagPatch(TagInput):
    name: str = Field(default='', min_length=1, max_length=50)


class CommentInput(Input):
    content: str = Field(min_length=1)

    @field_validator('content')
    @classmethod
    def nonblank_content(cls, value):
        if not value.strip():
            raise ValueError('评论不能为空')
        return value.strip()


class TagOrderItem(Input):
    uid: str = Field(min_length=1, max_length=22)
    sort_order: Annotated[StrictFloat | StrictInt, Field(allow_inf_nan=False)]


class TagReorderInput(Input):
    uids: list[str] | None = None
    items: list[TagOrderItem] | None = Field(default=None, min_length=1)

    @model_validator(mode='after')
    def exactly_one_order(self):
        if (self.uids is None) == (self.items is None):
            raise ValueError('请提供 uids 或 items 中的一项')
        return self
