"""Password/JWT compatibility without importing the previous web framework."""

import base64
import hashlib
import hmac
import math
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select

from core.errors import APIError
from models import (
    BlacklistedToken,
    Identity,
    OutstandingToken,
    SessionToken,
    User,
    now,
)


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def make_password(password):
    salt = secrets.token_urlsafe(16)
    iterations = 1_000_000
    value = base64.b64encode(
        hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), iterations)
    ).decode()
    return f'pbkdf2_sha256${iterations}${salt}${value}'


def check_password(password, encoded):
    if not isinstance(password, str) or not encoded:
        return False
    try:
        algorithm, *parts = encoded.split('$')
        if algorithm in ('pbkdf2_sha256', 'pbkdf2_sha1'):
            iterations, salt, expected = parts
            value = hashlib.pbkdf2_hmac(
                algorithm.removeprefix('pbkdf2_'), password.encode(), salt.encode(), int(iterations)
            )
        elif algorithm == 'scrypt':
            work, salt, block, parallel, expected = parts
            value = hashlib.scrypt(
                password.encode(),
                salt=salt.encode(),
                n=int(work),
                r=int(block),
                p=int(parallel),
                dklen=64,
                maxmem=128 * 1024 * 1024,
            )
        else:
            return False
        return hmac.compare_digest(base64.b64encode(value).decode(), expected)
    except (ValueError, TypeError, OverflowError):
        return False


def encrypt_secret(value, settings):
    if not value or value.startswith('enc:v1:'):
        return value or ''
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.secret_key.encode()).digest())
    return 'enc:v1:' + Fernet(key).encrypt(value.encode()).decode()


def decrypt_secret(value, settings):
    if not value or not value.startswith('enc:v1:'):
        return value or ''
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.secret_key.encode()).digest())
    try:
        return Fernet(key).decrypt(value[7:].encode()).decode()
    except (InvalidToken, ValueError, UnicodeError) as error:
        raise ValueError('无法解密存储密钥，请确认 SECRET_KEY 未发生变化') from error


class Limiter:
    """Per-worker direct-peer limits, matching the previous deployment policy."""

    def __init__(self):
        self.history = defaultdict(deque)
        self.lock = threading.Lock()
        self.last_cleanup = 0

    def check(self, scope, ident, rate):
        if not rate:
            return
        count, period = rate.split('/')
        limit = int(count)
        duration = {'s': 1, 'm': 60, 'h': 3600, 'd': 86400}[period[0]]
        current = time.monotonic()
        with self.lock:
            if current - self.last_cleanup > 3600:
                self.history = defaultdict(
                    deque,
                    {
                        key: values
                        for key, values in self.history.items()
                        if values and current - values[-1] < 86400
                    },
                )
                self.last_cleanup = current
            history = self.history[scope, ident]
            while history and history[0] <= current - duration:
                history.popleft()
            if len(history) >= limit:
                wait = max(1, math.ceil(duration - (current - history[0])))
                raise APIError(
                    429,
                    {
                        'error': f'请求过于频繁，请 {wait} 秒后重试',
                        'code': 'rate_limited',
                        'retry_after': wait,
                    },
                    {'Retry-After': str(wait)},
                )
            history.append(current)


def limit(request, scope, rate, ident=None):
    request.app.state.limiter.check(
        scope, ident or (request.client.host if request.client else 'unknown'), rate
    )


def create_user(db, username, password, **values):
    user = User(
        username=username, display_name=values.pop('display_name', '') or username, **values
    )
    db.add(user)
    db.flush()
    db.add(Identity(user_id=user.id, identifier=username, credential=make_password(password)))
    db.flush()
    return user


def password_user(db, username, password):
    user = db.scalar(select(User).where(User.username == username, User.is_active.is_(True)))
    identity = (
        db.scalar(
            select(Identity).where(
                Identity.user_id == user.id, Identity.identity_type == 'password'
            )
        )
        if user
        else None
    )
    if identity and check_password(password, identity.credential):
        user.last_login = identity.last_used = now()
        return user
    # Equalize unknown-user and invalid-password work without exposing account existence.
    if identity is None:
        hashlib.pbkdf2_hmac('sha256', str(password).encode(), b'unknown-user', 1_000_000)
    return None


def token_pair(db, user, settings):
    issued = now()
    common = {
        'iat': int(issued.timestamp()),
        'user_id': user.id,
        'credential_version': user.credential_version,
    }
    access = jwt.encode(
        {**common, 'token_type': 'access', 'jti': uuid4().hex, 'exp': issued + timedelta(hours=1)},
        settings.secret_key,
        algorithm='HS256',
    )
    jti = uuid4().hex
    expires = issued + timedelta(days=7)
    refresh = jwt.encode(
        {**common, 'token_type': 'refresh', 'jti': jti, 'exp': expires},
        settings.secret_key,
        algorithm='HS256',
    )
    db.add(OutstandingToken(user_id=user.id, token=refresh, jti=jti, expires_at=expires))
    return {'access': access, 'refresh': refresh}


def decode_token(token, settings, kind):
    try:
        data = jwt.decode(
            token,
            settings.secret_key,
            algorithms=['HS256'],
            options={'require': ['exp', 'jti', 'user_id']},
        )
        if data.get('token_type') != kind:
            raise ValueError('wrong token type')
        return data
    except (jwt.PyJWTError, ValueError, TypeError):
        raise APIError(
            401,
            {'detail': 'Token 无效或已过期', 'code': 'token_not_valid'},
            {'WWW-Authenticate': 'Bearer'},
        )


def token_user(db, data):
    user = db.get(User, data['user_id'])
    if (
        not user
        or not user.is_active
        or data.get('credential_version', 0) != user.credential_version
    ):
        raise APIError(
            401,
            {'detail': '密码已变更，请重新登录', 'code': 'credentials_changed'},
            {'WWW-Authenticate': 'Bearer'},
        )
    return user


def claim_refresh(db, token, settings):
    data = decode_token(token, settings, 'refresh')
    user = token_user(db, data)
    outstanding = db.scalar(
        select(OutstandingToken).where(OutstandingToken.jti == data['jti']).with_for_update()
    )
    if not outstanding:
        outstanding = OutstandingToken(
            user_id=user.id,
            token=token,
            jti=data['jti'],
            expires_at=datetime.fromtimestamp(data['exp'], timezone.utc),
        )
        db.add(outstanding)
        db.flush()
    if db.scalar(select(BlacklistedToken.id).where(BlacklistedToken.token_id == outstanding.id)):
        raise APIError(401, {'detail': 'Token 已失效', 'code': 'token_not_valid'})
    # Unique token_id makes simultaneous refresh/exchange claims single-use.
    db.add(BlacklistedToken(token_id=outstanding.id))
    db.flush()
    return user


def request_user(request, db, required=True):
    authorization = request.headers.get('authorization', '')
    if authorization:
        scheme, _, value = authorization.partition(' ')
        if scheme.lower() == 'bearer':
            return token_user(db, decode_token(value, request.app.state.settings, 'access'))
    key = request.cookies.get('sessionid')
    if key:
        session = db.get(SessionToken, digest(key))
        if session and session.expires_at > now():
            user = db.get(User, session.user_id)
            if user and user.is_active and user.credential_version == session.credential_version:
                if request.method not in {'GET', 'HEAD', 'OPTIONS'}:
                    header = request.headers.get('x-csrftoken', '')
                    if not hmac.compare_digest(header, session.csrf):
                        raise APIError(403, {'detail': 'CSRF 验证失败'})
                return user
    if required:
        raise APIError(401, {'detail': '身份认证信息未提供。'}, {'WWW-Authenticate': 'Bearer'})
    return None
