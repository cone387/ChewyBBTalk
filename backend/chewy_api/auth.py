import base64
import hashlib
import logging
import os
import re
import secrets
import smtplib
from datetime import timedelta
from email.message import EmailMessage
from urllib.parse import urlsplit

from fastapi import APIRouter, Request, Response
from sqlalchemy import select, delete, update, inspect, text
from sqlalchemy.exc import IntegrityError

from .dependencies import DB, CurrentUser
from .errors import APIError, fail
from .models import User, Identity, SessionToken, DesktopAuthorization, PasswordRecovery, OutstandingToken, BlacklistedToken, SubmissionReceipt, Comment, RecordTag, Tag, BBTalk, StorageConfig, Attachment, now
from .schemas import LoginInput, RegisterInput, RefreshInput, UserPatch, PasswordInput, RecoveryInput, RecoveryConfirm
from .security import create_user, password_user, token_pair, claim_refresh, limit, digest, check_password, make_password

router = APIRouter(prefix='/api/v1/bbtalk', tags=['Auth'])


def user_data(user):
    return {key: getattr(user, key) for key in ('id', 'username', 'email', 'display_name', 'avatar', 'bio', 'is_staff', 'create_time', 'last_login')}


@router.get('/auth/policy/')
def policy(request: Request, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    config = request.app.state.settings
    return {'registration_enabled': config.registration_enabled, 'password_recovery_enabled': config.recovery_enabled}


def authenticate(data, request, db):
    limit(request, 'login', request.app.state.settings.login_rate)
    if not data.username or not data.password:
        fail(400, '用户名和密码不能为空')
    user = password_user(db, data.username, data.password)
    if not user:
        fail(400, '用户名或密码错误')
    return user


@router.post('/auth/token/')
def token(data: LoginInput, request: Request, db: DB):
    user = authenticate(data, request, db)
    result = {**token_pair(db, user, request.app.state.settings), 'user': user_data(user)}
    db.commit()
    return result


@router.post('/auth/register/', status_code=201)
def register(data: RegisterInput, request: Request, db: DB):
    config = request.app.state.settings
    limit(request, 'register', config.registration_rate)
    if not config.registration_enabled:
        fail(403, '当前服务未开放注册，请联系管理员', code='registration_disabled')
    if not data.username.strip() or not data.password:
        fail(400, '用户名和密码不能为空')
    try:
        user = create_user(db, data.username.strip(), data.password, email=data.email.strip(), display_name=data.display_name.strip())
        result = {**token_pair(db, user, config), 'user': user_data(user)}
        db.commit()
        return result
    except IntegrityError:
        db.rollback()
        fail(400, '用户名已存在')


@router.post('/auth/token/refresh/')
def refresh(data: RefreshInput, request: Request, db: DB):
    limit(request, 'refresh', request.app.state.settings.refresh_rate)
    try:
        user = claim_refresh(db, data.refresh, request.app.state.settings)
        result = token_pair(db, user, request.app.state.settings)
        db.commit()
        return result
    except IntegrityError:
        db.rollback()
        raise APIError(401, {'detail': 'Token 已失效', 'code': 'token_not_valid'})


@router.post('/auth/token/blacklist/')
def blacklist(data: RefreshInput, request: Request, db: DB, user: CurrentUser):
    if not data.refresh:
        fail(400, 'Refresh Token 不能为空')
    try:
        owner = claim_refresh(db, data.refresh, request.app.state.settings)
        if owner.id != user.id:
            fail(403, '无权注销此令牌')
        db.commit()
        return {'message': 'Token 已加入黑名单，登出成功'}
    except IntegrityError:
        db.rollback()
        fail(400, 'Token 无效')


@router.post('/auth/login/')
def login(data: LoginInput, request: Request, response: Response, db: DB):
    user = authenticate(data, request, db)
    key, csrf = secrets.token_urlsafe(32), secrets.token_hex(32)
    if previous := request.cookies.get('sessionid'):
        db.execute(delete(SessionToken).where(SessionToken.key_hash == digest(previous)))
    db.add(SessionToken(key_hash=digest(key), user_id=user.id, credential_version=user.credential_version, csrf=csrf, expires_at=now() + timedelta(days=14)))
    db.commit()
    response.set_cookie('sessionid', key, max_age=14 * 86400, httponly=True, samesite='lax', secure=request.app.state.settings.cookie_secure)
    response.set_cookie('csrftoken', csrf, max_age=14 * 86400, samesite='lax', secure=request.app.state.settings.cookie_secure)
    return user_data(user)


@router.post('/auth/logout/')
def logout(request: Request, response: Response, db: DB, user: CurrentUser):
    db.execute(delete(SessionToken).where(SessionToken.key_hash == digest(request.cookies.get('sessionid', ''))))
    db.commit()
    response.delete_cookie('sessionid')
    response.delete_cookie('csrftoken')
    return {'message': '登出成功'}


@router.get('/user/me/')
def me(user: CurrentUser):
    return user_data(user)


@router.patch('/user/me/')
def edit_me(data: UserPatch, db: DB, user: CurrentUser):
    for name, value in data.model_dump(exclude_unset=True).items():
        setattr(user, name, value)
    db.commit()
    return user_data(user)


def delete_user(db, user):
    records = select(BBTalk.id).where(BBTalk.user_id == user.id)
    tags = select(Tag.id).where(Tag.user_id == user.id)
    db.execute(delete(RecordTag).where(RecordTag.bbtalk_id.in_(records) | RecordTag.tag_id.in_(tags)))
    db.execute(delete(Comment).where((Comment.user_id == user.id) | Comment.bbtalk_id.in_(records)))
    db.execute(delete(BlacklistedToken).where(BlacklistedToken.token_id.in_(select(OutstandingToken.id).where(OutstandingToken.user_id == user.id))))
    for model in (SessionToken, DesktopAuthorization, PasswordRecovery, OutstandingToken, SubmissionReceipt, Identity, StorageConfig, Tag, BBTalk):
        db.execute(delete(model).where(model.user_id == user.id))
    db.execute(delete(Attachment).where(Attachment.owner_id == str(user.id)))
    # Historical admin audit rows may still reference an upgraded account.
    if inspect(db.bind).has_table('django_admin_log'):
        db.execute(text('DELETE FROM django_admin_log WHERE user_id = :uid'), {'uid': user.id})
    db.delete(user)


@router.post('/user/delete-account/')
def delete_account(data: dict, db: DB, user: CurrentUser):
    if not password_user(db, user.username, data.get('password', '')):
        fail(400, '密码错误，请重新输入')
    delete_user(db, user)
    db.commit()
    return {'message': '账号已成功删除'}


def change_password(db, user, password):
    if len(password) < 8 or password.isdecimal() or password.casefold() in {'password', 'password123', '12345678', 'qwerty123'} or password.casefold() == user.username.casefold():
        fail(400, '密码过于简单，请使用至少 8 位的复杂密码')
    identity = db.scalar(select(Identity).where(Identity.user_id == user.id, Identity.identity_type == 'password').with_for_update())
    if not identity:
        fail(400, '此账号未设置密码身份')
    identity.credential = make_password(password)
    user.credential_version += 1
    for model in (PasswordRecovery, DesktopAuthorization, SessionToken):
        db.execute(delete(model).where(model.user_id == user.id))


@router.post('/user/change-password/')
def change(data: PasswordInput, request: Request, db: DB, user: CurrentUser):
    limit(request, 'recovery', request.app.state.settings.recovery_rate)
    user = db.scalar(select(User).where(User.id == user.id).with_for_update())
    identity = db.scalar(select(Identity).where(Identity.user_id == user.id, Identity.identity_type == 'password'))
    if not identity or not check_password(data.old_password, identity.credential):
        fail(400, '当前密码不正确')
    change_password(db, user, data.new_password)
    db.commit()
    return {'message': '密码已更新，请重新登录'}


def send_recovery_email(email, code):
    message = EmailMessage()
    message['Subject'] = 'ChewyBBTalk 密码找回'
    message['From'] = os.getenv('DEFAULT_FROM_EMAIL', 'noreply@example.invalid')
    message['To'] = email
    message.set_content(f'请在 App 的“找回密码”中粘贴以下恢复码：\n\n{code}\n\n恢复码 15 分钟内有效，仅可使用一次。请勿转发。')
    from .config import boolean
    constructor = smtplib.SMTP_SSL if boolean('EMAIL_USE_SSL') else smtplib.SMTP
    with constructor(os.getenv('EMAIL_HOST', ''), int(os.getenv('EMAIL_PORT', '587')), timeout=10) as server:
        if boolean('EMAIL_USE_TLS', True) and not boolean('EMAIL_USE_SSL'):
            server.starttls()
        if username := os.getenv('EMAIL_HOST_USER'):
            server.login(username, os.getenv('EMAIL_HOST_PASSWORD', ''))
        server.send_message(message)


def recovery_limits(request, username):
    config = request.app.state.settings
    limit(request, 'recovery', config.recovery_rate)
    limit(request, 'recovery-account', config.recovery_rate, digest(username.strip().casefold()))
    if not config.recovery_enabled:
        fail(503, '当前服务暂未启用邮件找回，请联系服务提供方', code='recovery_disabled')


@router.post('/auth/password/request/')
def recovery_request(data: RecoveryInput, request: Request, response: Response, db: DB):
    recovery_limits(request, data.username)
    user = db.scalar(select(User).where(User.username == data.username, User.is_active.is_(True)))
    if user and user.email.casefold() == data.email.casefold() and db.scalar(select(Identity.id).where(Identity.user_id == user.id, Identity.identity_type == 'password')):
        code = secrets.token_urlsafe(24)
        db.execute(delete(PasswordRecovery).where(PasswordRecovery.user_id == user.id))
        grant = PasswordRecovery(user_id=user.id, email=user.email, credential_version=user.credential_version, code_hash=digest(code), expires_at=now() + timedelta(minutes=15))
        db.add(grant)
        db.commit()
        try:
            request.app.state.send_recovery_email(user.email, code)
        except Exception:
            logging.getLogger(__name__).warning('Password recovery mail delivery failed')
            db.execute(delete(PasswordRecovery).where(PasswordRecovery.user_id == user.id, PasswordRecovery.code_hash == digest(code)))
            db.commit()
    response.headers['Cache-Control'] = 'no-store'
    return {'message': '如果用户名和邮箱匹配，你将收到恢复邮件。请检查收件箱及垃圾邮件；未收到时可稍后重试或联系服务提供方。'}


@router.post('/auth/password/confirm/')
def recovery_confirm(data: RecoveryConfirm, request: Request, db: DB):
    recovery_limits(request, data.username)
    user = db.scalar(select(User).where(User.username == data.username, User.is_active.is_(True)).with_for_update())
    grant = db.scalar(select(PasswordRecovery).where(PasswordRecovery.user_id == user.id, PasswordRecovery.code_hash == digest(data.code), PasswordRecovery.expires_at > now())) if user else None
    if not grant or grant.email != user.email or grant.credential_version != user.credential_version:
        fail(400, '恢复码无效或已过期，请重新申请')
    count = db.execute(delete(PasswordRecovery).where(PasswordRecovery.id == grant.id, PasswordRecovery.code_hash == digest(data.code))).rowcount
    if count != 1:
        fail(400, '恢复码已使用，请重新申请')
    change_password(db, user, data.new_password)
    db.commit()
    return {'message': '密码已重置，请使用新密码登录'}


def valid_redirect(value):
    try:
        url = urlsplit(value)
        return url.scheme == 'http' and url.hostname == '127.0.0.1' and url.port and 1024 <= url.port <= 65535 and url.path == '/callback' and not (url.query or url.fragment or url.username or url.password)
    except (ValueError, TypeError, AttributeError):
        return False


@router.post('/auth/desktop/authorize/')
def authorize(data: dict, request: Request, response: Response, db: DB, user: CurrentUser):
    limit(request, 'login', request.app.state.settings.login_rate)
    challenge, redirect = data.get('code_challenge', ''), data.get('redirect_uri', '')
    if not isinstance(challenge, str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}', challenge) or data.get('code_challenge_method') != 'S256' or not valid_redirect(redirect):
        fail(400, '授权请求无效，请从桌面端重新发起')
    code = secrets.token_urlsafe(32)
    db.execute(delete(DesktopAuthorization).where(DesktopAuthorization.expires_at < now()))
    db.add(DesktopAuthorization(code_hash=digest(code), user_id=user.id, challenge=challenge, redirect_uri=redirect, expires_at=now() + timedelta(minutes=2)))
    db.commit()
    response.headers.update({'Cache-Control': 'no-store', 'Pragma': 'no-cache'})
    return {'code': code}


@router.post('/auth/desktop/exchange/')
def exchange(data: dict, request: Request, response: Response, db: DB):
    limit(request, 'login', request.app.state.settings.login_rate)
    code, verifier, redirect = data.get('code', ''), data.get('code_verifier', ''), data.get('redirect_uri', '')
    if not isinstance(code, str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}', code) or not isinstance(verifier, str) or not re.fullmatch(r'[A-Za-z0-9._~-]{43,128}', verifier) or not valid_redirect(redirect):
        fail(400, '授权码无效或已过期')
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    claimed = db.execute(update(DesktopAuthorization).where(DesktopAuthorization.code_hash == digest(code), DesktopAuthorization.challenge == challenge, DesktopAuthorization.redirect_uri == redirect, DesktopAuthorization.expires_at > now(), DesktopAuthorization.consumed.is_(False)).values(consumed=True)).rowcount
    if claimed != 1:
        fail(400, '授权码无效或已过期')
    grant = db.get(DesktopAuthorization, digest(code))
    user = db.get(User, grant.user_id)
    if not user or not user.is_active:
        fail(400, '授权码无效或已过期')
    result = {**token_pair(db, user, request.app.state.settings), 'username': user.username}
    db.commit()
    response.headers.update({'Cache-Control': 'no-store', 'Pragma': 'no-cache'})
    return result
