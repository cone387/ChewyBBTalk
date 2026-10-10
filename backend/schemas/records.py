from typing import Any, Literal

from pydantic import Field

from schemas.base import Input


class RecordInput(Input):
    content: str = Field(min_length=1)
    visibility: Literal['public', 'private'] = 'private'
    post_tags: str | None = ''
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    context: dict[str, Any] = Field(default_factory=dict)
    is_pinned: bool = False


class RecordPatch(Input):
    content: str = Field(default='', min_length=1)
    visibility: Literal['public', 'private'] = 'private'
    post_tags: str | None = ''
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    context: dict[str, Any] = Field(default_factory=dict)
    is_pinned: bool = False


class TagInput(Input):
    name: str = Field(default='', max_length=50)
    color: str = Field(default='', pattern=r'^$|^#[0-9a-fA-F]{6}$')
    sort_order: float = 0


class CommentInput(Input):
    content: str = Field(min_length=1)
