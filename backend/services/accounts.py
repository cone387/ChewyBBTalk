import os
import smtplib
from email.message import EmailMessage
from urllib.parse import urlsplit

from sqlalchemy import delete, inspect, select, text

from core.errors import fail
from models import (
    Attachment,
    BBTalk,
    BlacklistedToken,
    Comment,
    DesktopAuthorization,
    Identity,
    OutstandingToken,
    PasswordRecovery,
    RecordTag,
    SessionToken,
    StorageConfig,
    SubmissionReceipt,
    Tag,
)
from services.security import make_password


def user_data(user):
    return {
        key: getattr(user, key)
        for key in (
            'id',
            'username',
            'email',
            'display_name',
            'avatar',
            'bio',
            'is_staff',
            'create_time',
            'last_login',
        )
    }


def delete_user(db, user):
    records = select(BBTalk.id).where(BBTalk.user_id == user.id)
    tags = select(Tag.id).where(Tag.user_id == user.id)
    db.execute(
        delete(RecordTag).where(RecordTag.bbtalk_id.in_(records) | RecordTag.tag_id.in_(tags))
    )
    db.execute(delete(Comment).where((Comment.user_id == user.id) | Comment.bbtalk_id.in_(records)))
    db.execute(
        delete(BlacklistedToken).where(
            BlacklistedToken.token_id.in_(
                select(OutstandingToken.id).where(OutstandingToken.user_id == user.id)
            )
        )
    )
    for model in (
        SessionToken,
        DesktopAuthorization,
        PasswordRecovery,
        OutstandingToken,
        SubmissionReceipt,
        Identity,
        StorageConfig,
        Tag,
        BBTalk,
    ):
        db.execute(delete(model).where(model.user_id == user.id))
    db.execute(delete(Attachment).where(Attachment.owner_id == str(user.id)))
    # Historical admin audit rows may still reference an upgraded account.
    if inspect(db.bind).has_table('django_admin_log'):
        db.execute(text('DELETE FROM django_admin_log WHERE user_id = :uid'), {'uid': user.id})
    db.delete(user)


def change_password(db, user, password):
    if (
        len(password) < 8
        or password.isdecimal()
        or password.casefold() in {'password', 'password123', '12345678', 'qwerty123'}
        or password.casefold() == user.username.casefold()
    ):
        fail(400, '密码过于简单，请使用至少 8 位的复杂密码')
    identity = db.scalar(
        select(Identity)
        .where(Identity.user_id == user.id, Identity.identity_type == 'password')
        .with_for_update()
    )
    if not identity:
        fail(400, '此账号未设置密码身份')
    identity.credential = make_password(password)
    user.credential_version += 1
    for model in (PasswordRecovery, DesktopAuthorization, SessionToken):
        db.execute(delete(model).where(model.user_id == user.id))


def send_recovery_email(email, code):
    message = EmailMessage()
    message['Subject'] = 'ChewyBBTalk 密码找回'
    message['From'] = os.getenv('DEFAULT_FROM_EMAIL', 'noreply@example.invalid')
    message['To'] = email
    message.set_content(
        f'请在 App 的“找回密码”中粘贴以下恢复码：\n\n{code}\n\n恢复码 15 分钟内有效，仅可使用一次。请勿转发。'
    )
    from core.config import boolean

    constructor = smtplib.SMTP_SSL if boolean('EMAIL_USE_SSL') else smtplib.SMTP
    with constructor(
        os.getenv('EMAIL_HOST', ''), int(os.getenv('EMAIL_PORT', '587')), timeout=10
    ) as server:
        if boolean('EMAIL_USE_TLS', True) and not boolean('EMAIL_USE_SSL'):
            server.starttls()
        if username := os.getenv('EMAIL_HOST_USER'):
            server.login(username, os.getenv('EMAIL_HOST_PASSWORD', ''))
        server.send_message(message)


def valid_redirect(value):
    try:
        url = urlsplit(value)
        return (
            url.scheme == 'http'
            and url.hostname == '127.0.0.1'
            and url.port
            and 1024 <= url.port <= 65535
            and url.path == '/callback'
            and not (url.query or url.fragment or url.username or url.password)
        )
    except (ValueError, TypeError, AttributeError):
        return False
