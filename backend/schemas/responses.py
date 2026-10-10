"""Public resource projections. Never expose ORM objects or credential fields."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, JsonValue


class Page[T](BaseModel):
    count: int
    next: str | None
    previous: str | None
    results: list[T]


class TagOutput(BaseModel):
    uid: str
    name: str
    color: str
    sort_order: float
    create_time: datetime
    update_time: datetime


class TagCountOutput(TagOutput):
    bbtalk_count: int


class CommentOutput(BaseModel):
    uid: str
    content: str
    create_time: datetime
    update_time: datetime
    user: int
    bbtalk: int
    user_display_name: str
    user_avatar: str
    user_username: str


class CommentPage(Page[CommentOutput]):
    revision: str


class RecordOutput(BaseModel):
    uid: str
    content: str
    visibility: Literal['public', 'private']
    context: JsonValue
    is_pinned: bool
    create_time: datetime
    update_time: datetime
    user: int
    tags: list[TagOutput]
    comment_count: int
    comment_preview: list[CommentOutput]
    comments_revision: str
    attachments: list[dict[str, Any]]


class RecordPage(Page[RecordOutput]):
    total_count: int


class DateCountOutput(BaseModel):
    date: str
    count: int


class UserOutput(BaseModel):
    id: int
    username: str
    email: str
    display_name: str
    avatar: str
    bio: str
    is_staff: bool
    create_time: datetime
    last_login: datetime | None


class TokenPairOutput(BaseModel):
    access: str
    refresh: str


class LoginOutput(TokenPairOutput):
    user: UserOutput


class DesktopExchangeOutput(TokenPairOutput):
    username: str


class PolicyOutput(BaseModel):
    registration_enabled: bool
    password_recovery_enabled: bool


class StorageOutput(BaseModel):
    id: int
    name: str
    storage_type: Literal['local', 's3']
    s3_access_key_id: str
    s3_bucket_name: str
    s3_region_name: str
    s3_endpoint_url: str
    s3_custom_domain: str
    is_active: bool
    create_time: datetime
    update_time: datetime
    has_secret_key: bool
    is_s3_configured: bool


class DefaultStorageOutput(BaseModel):
    storage_type: Literal['local']
    is_active: Literal[False]


class AttachmentOutput(BaseModel):
    id: str
    original_name: str
    mime_type: str
    size: int
    owner_id: str
    is_public: bool
    storage_config_id: str | None
    created_at: str
    preview_url: str
    download_url: str
    file_url: str


class MessageOutput(BaseModel):
    message: str


class SuccessOutput(BaseModel):
    success: bool


class StorageTestOutput(SuccessOutput):
    message: str


class CodeOutput(BaseModel):
    code: str


class TagDeleteOutput(BaseModel):
    deleted_bbtalks: int


class MigrationPreviewOutput(BaseModel):
    total: int
    need_migrate: int
    already_on_target: int


class MigrationStats(BaseModel):
    total: int
    migrated: int
    skipped: int
    failed: int
    errors: list[str]


class MigrationOutput(SuccessOutput):
    stats: MigrationStats


class ImportValidationOutput(BaseModel):
    valid: bool
    file_type: Literal['json', 'zip'] | None
    version: str | None
    export_time: str | None
    preview: dict[str, int]
    error: str | None
    complete_backup: bool


class ImportStats(BaseModel):
    tags_created: int
    tags_skipped: int
    bbtalks_created: int
    bbtalks_skipped: int
    attachments_created: int
    attachments_skipped: int
    comments_created: int
    comments_skipped: int
    storage_settings_created: int
    errors: list[str]


class ImportOutput(SuccessOutput):
    partial: bool
    message: str
    stats: ImportStats


class BackupItem(BaseModel):
    filename: str
    size: int
    created_at: str


class BackupState(BaseModel):
    status: str
    started_at: str | None = None
    finished_at: str | None = None
    message: str | None = None
    filename: str | None = None


class BackupListOutput(BaseModel):
    items: list[BackupItem]
    latest: BackupState | None


class CheckOutput(BaseModel):
    status: str
    message: str


class StorageCheck(CheckOutput):
    mode: str


class BackupCheck(CheckOutput):
    count: int | None = None
    latest_completed_at: str | None = None
    latest_size: int | None = None


class DiskCheck(CheckOutput):
    total_bytes: int | None = None
    free_bytes: int | None = None


class DiagnosticsOutput(BaseModel):
    database: CheckOutput
    attachment_disk: DiskCheck


class RuntimeStatusOutput(BaseModel):
    checked_at: str
    service: CheckOutput
    storage: StorageCheck
    backup: BackupCheck
    diagnostics: DiagnosticsOutput | None = None


class HealthOutput(BaseModel):
    status: Literal['ok']
