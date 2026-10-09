from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


class Input(BaseModel):
    model_config = ConfigDict(extra='ignore', str_strip_whitespace=False)


class LoginInput(Input):
    username: str = Field(default='', max_length=150)
    password: str = Field(default='', max_length=4096)


class RegisterInput(LoginInput):
    email: str = Field(default='', max_length=254)
    display_name: str = Field(default='', max_length=150)


class UserPatch(Input):
    email: str = Field(default='', max_length=254)
    display_name: str = Field(default='', max_length=150)
    avatar: str = Field(default='', max_length=200)
    bio: str = ''


class RefreshInput(Input):
    refresh: str = ''


class PasswordInput(Input):
    new_password: str = Field(min_length=8, max_length=128)
    old_password: str = ''


class RecoveryInput(Input):
    username: str = Field(min_length=1, max_length=150)
    email: str = Field(min_length=3, max_length=254)


class RecoveryConfirm(Input):
    username: str = Field(min_length=1, max_length=150)
    code: str = Field(min_length=32, max_length=32)
    new_password: str = Field(min_length=8, max_length=128)


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


class StorageInput(Input):
    name: str = Field(default='默认配置', min_length=1, max_length=100)
    storage_type: Literal['local', 's3'] = 's3'
    s3_access_key_id: str = Field(default='', max_length=255)
    s3_secret_access_key: str = Field(default='', max_length=255)
    s3_bucket_name: str = Field(default='', max_length=255)
    s3_region_name: str = Field(default='us-east-1', max_length=64)
    s3_endpoint_url: str = Field(default='', max_length=500)
    s3_custom_domain: str = Field(default='', max_length=255)
    is_active: bool = False
