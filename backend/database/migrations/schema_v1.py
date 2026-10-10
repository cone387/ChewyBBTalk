"""Frozen schema for revision 0001. Do not modify when application models change.

Future schema changes belong in a new Alembic revision.
"""
import base64
import colorsys
import random
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator


def now():
    return datetime.now(timezone.utc)


def uid():
    return base64.urlsafe_b64encode(uuid4().bytes).decode()[:22]


def tag_color():
    rgb = colorsys.hls_to_rgb(random.random(), random.uniform(.45, .7), random.uniform(.6, .9))
    return '#{:02x}{:02x}{:02x}'.format(*(int(value * 255) for value in rgb))


class UTCDateTime(TypeDecorator):
    impl = DateTime
    cache_ok = True

    def load_dialect_impl(self, dialect):
        return dialect.type_descriptor(DateTime(timezone=dialect.name == 'postgresql'))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        value = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
        return value if dialect.name == 'postgresql' else value.replace(tzinfo=None)

    def process_result_value(self, value, dialect):
        return value.replace(tzinfo=timezone.utc) if value is not None and value.tzinfo is None else value


class Base(DeclarativeBase):
    pass


ID = BigInteger().with_variant(Integer, 'sqlite')


class User(Base):
    __tablename__ = 'cb_users'
    id: Mapped[int] = mapped_column(ID, primary_key=True)
    username: Mapped[str] = mapped_column(String(150), unique=True)
    email: Mapped[str] = mapped_column(String(254), default='')
    display_name: Mapped[str] = mapped_column(String(150), default='')
    avatar: Mapped[str] = mapped_column(String(200), default='')
    bio: Mapped[str] = mapped_column(Text, default='')
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_staff: Mapped[bool] = mapped_column(Boolean, default=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
    credential_version: Mapped[int] = mapped_column(Integer, default=0)
    create_time: Mapped[datetime] = mapped_column(UTCDateTime, default=now)
    update_time: Mapped[datetime] = mapped_column(UTCDateTime, default=now, onupdate=now)
    last_login: Mapped[datetime | None] = mapped_column(UTCDateTime)

    def __str__(self):
        return self.username


class Identity(Base):
    __tablename__ = 'cb_identities'
    __table_args__ = (UniqueConstraint('identity_type', 'identifier'),)
    id: Mapped[int] = mapped_column(ID, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('cb_users.id', ondelete='CASCADE'), index=True)
    identity_type: Mapped[str] = mapped_column(String(32), default='password')
    identifier: Mapped[str] = mapped_column(String(255))
    credential: Mapped[str] = mapped_column(String(255), default='')
    provider: Mapped[str] = mapped_column(String(32), default='')
    provider_user_id: Mapped[str] = mapped_column(String(255), default='')
    is_verified: Mapped[bool] = mapped_column(Boolean, default=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=True)
    create_time: Mapped[datetime] = mapped_column(UTCDateTime, default=now)
    update_time: Mapped[datetime] = mapped_column(UTCDateTime, default=now, onupdate=now)
    last_used: Mapped[datetime | None] = mapped_column(UTCDateTime)


class Owned:
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('cb_users.id', ondelete='CASCADE'), index=True)
    create_time: Mapped[datetime] = mapped_column(UTCDateTime, default=now, index=True)
    update_time: Mapped[datetime] = mapped_column(UTCDateTime, default=now, onupdate=now, index=True)


class Tag(Owned, Base):
    __tablename__ = 'cb_tags'
    __table_args__ = (UniqueConstraint('name', 'user_id'),)
    uid: Mapped[str] = mapped_column(String(22), unique=True, default=uid)
    name: Mapped[str] = mapped_column(String(50))
    color: Mapped[str] = mapped_column(String(7), default=tag_color)
    sort_order: Mapped[float] = mapped_column(Float, default=0)


class RecordTag(Base):
    __tablename__ = 'cb_bbtalk_tag_relations'
    __table_args__ = (UniqueConstraint('bbtalk_id', 'tag_id'),)
    id: Mapped[int] = mapped_column(ID, primary_key=True)
    bbtalk_id: Mapped[int] = mapped_column(ForeignKey('cb_bbtalks.id', ondelete='CASCADE'), index=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey('cb_tags.id', ondelete='CASCADE'), index=True)


class BBTalk(Owned, Base):
    __tablename__ = 'cb_bbtalks'
    __table_args__ = (Index('bbtalk_user_time_idx', 'user_id', 'update_time'), Index('bbtalk_user_create_idx', 'user_id', 'create_time'))
    uid: Mapped[str] = mapped_column(String(22), unique=True, default=uid)
    content: Mapped[str] = mapped_column(Text)
    visibility: Mapped[str] = mapped_column(String(16), default='private')
    attachments: Mapped[list] = mapped_column(JSON().with_variant(JSONB(), 'postgresql'), default=list)
    context: Mapped[dict] = mapped_column(JSON().with_variant(JSONB(), 'postgresql'), default=dict)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    tags: Mapped[list[Tag]] = relationship(secondary='cb_bbtalk_tag_relations', lazy='selectin')


class Comment(Owned, Base):
    __tablename__ = 'cb_comments'
    uid: Mapped[str] = mapped_column(String(22), unique=True, default=uid)
    bbtalk_id: Mapped[int] = mapped_column(ForeignKey('cb_bbtalks.id', ondelete='CASCADE'), index=True)
    content: Mapped[str] = mapped_column(Text)


class StorageConfig(Owned, Base):
    __tablename__ = 'cb_user_storage_settings'
    __table_args__ = (UniqueConstraint('user_id', 'name'),)
    name: Mapped[str] = mapped_column(String(100), default='默认配置')
    storage_type: Mapped[str] = mapped_column(String(16), default='s3')
    s3_access_key_id: Mapped[str] = mapped_column(String(255), default='')
    s3_secret_access_key: Mapped[str] = mapped_column(String(255), default='')
    s3_bucket_name: Mapped[str] = mapped_column(String(255), default='')
    s3_region_name: Mapped[str] = mapped_column(String(64), default='us-east-1')
    s3_endpoint_url: Mapped[str] = mapped_column(String(500), default='')
    s3_custom_domain: Mapped[str] = mapped_column(String(255), default='')
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)

    @property
    def is_s3_configured(self):
        return bool(self.storage_type == 's3' and self.s3_access_key_id and self.s3_secret_access_key and self.s3_bucket_name)


class Attachment(Base):
    __tablename__ = 'cb_attachments'
    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    original_name: Mapped[str] = mapped_column(String(255))
    storage_path: Mapped[str] = mapped_column(String(500))
    mime_type: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(BigInteger)
    owner_id: Mapped[str] = mapped_column(String(100), index=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    storage_config_id: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now, index=True)


class SubmissionReceipt(Base):
    __tablename__ = 'cb_submission_receipts'
    __table_args__ = (UniqueConstraint('user_id', 'key', name='submission_user_key_unique'),)
    id: Mapped[int] = mapped_column(ID, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('cb_users.id', ondelete='CASCADE'))
    key: Mapped[str] = mapped_column(String(128))
    payload_hash: Mapped[str] = mapped_column(String(64))
    record_id: Mapped[int | None] = mapped_column(ForeignKey('cb_bbtalks.id', ondelete='SET NULL'))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now)


class DesktopAuthorization(Base):
    __tablename__ = 'cb_desktop_authorizations'
    code_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('cb_users.id', ondelete='CASCADE'))
    challenge: Mapped[str] = mapped_column(String(43))
    redirect_uri: Mapped[str] = mapped_column(String(200))
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)


class PasswordRecovery(Base):
    __tablename__ = 'cb_password_recovery'
    id: Mapped[int] = mapped_column(ID, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('cb_users.id', ondelete='CASCADE'), unique=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    email: Mapped[str] = mapped_column(String(254))
    credential_version: Mapped[int] = mapped_column(Integer)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)


class OutstandingToken(Base):
    __tablename__ = 'token_blacklist_outstandingtoken'
    id: Mapped[int] = mapped_column(ID, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey('cb_users.id', ondelete='SET NULL'))
    jti: Mapped[str] = mapped_column(String(255), unique=True)
    token: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime | None] = mapped_column(UTCDateTime, default=now)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)


class BlacklistedToken(Base):
    __tablename__ = 'token_blacklist_blacklistedtoken'
    id: Mapped[int] = mapped_column(ID, primary_key=True)
    token_id: Mapped[int] = mapped_column(ForeignKey('token_blacklist_outstandingtoken.id', ondelete='CASCADE'), unique=True)
    blacklisted_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now)


class SessionToken(Base):
    __tablename__ = 'cb_sessions'
    key_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('cb_users.id', ondelete='CASCADE'), index=True)
    credential_version: Mapped[int] = mapped_column(Integer)
    csrf: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
