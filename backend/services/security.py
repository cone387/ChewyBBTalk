"""Native password records, signed credentials, and session authentication."""

import base64
import hashlib
import hmac
import json
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
    Identity,
    RefreshToken,
    RevokedToken,
    SessionToken,
    User,
    now,
)


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def hash_password(password):
    salt = secrets.token_bytes(16)
    iterations = 1_000_000
    value = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, iterations)
    return json.dumps(
        {
            'v': 1,
            'kdf': 'pbkdf2',
            'hash': 'sha256',
            'iterations': iterations,
            'salt': base64.b64encode(salt).decode(),
            'digest': base64.b64encode(value).decode(),
        },
        separators=(',', ':'),
    )


def verify_password(password, encoded):
    if not isinstance(password, str) or not isinstance(encoded, str) or len(encoded) > 4096:
        return False
    try:
        record = json.loads(encoded)
        if not isinstance(record, dict) or type(record.get('v')) is not int or record['v'] != 1:
            return False
        salt = base64.b64decode(record['salt'], validate=True)
        expected = base64.b64decode(record['digest'], validate=True)
        if not salt or len(salt) > 1024:
            return False
        if record.get('kdf') == 'pbkdf2':
            algorithm, iterations = record['hash'], record['iterations']
            if (
                algorithm not in ('sha256', 'sha1')
                or type(iterations) is not int
                or not 1 <= iterations <= 10_000_000
                or len(expected) != {'sha256': 32, 'sha1': 20}[algorithm]
            ):
                return False
            value = hashlib.pbkdf2_hmac(algorithm, password.encode(), salt, iterations)
        elif record.get('kdf') == 'scrypt':
            work, block, parallel = record['n'], record['r'], record['p']
            if (
                any(type(v) is not int for v in (work, block, parallel))
                or work < 2
                or work & (work - 1)
                or block < 1
                or parallel < 1
                or 128 * work * block > 128 * 1024 * 1024
                or work * block * parallel > 8_388_608
                or len(expected) != 64
            ):
                return False
            value = hashlib.scrypt(
                password.encode(),
                salt=salt,
                n=work,
                r=block,
                p=parallel,
                dklen=64,
                maxmem=128 * 1024 * 1024,
            )
        else:
            return False
        return hmac.compare_digest(value, expected)
    except (ValueError, TypeError, KeyError, OverflowError, UnicodeError):
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
    db.add(Identity(user_id=user.id, identifier=username, credential=hash_password(password)))
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
    if identity and verify_password(password, identity.credential):
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
        'sub': str(user.id),
        'credential_version': user.credential_version,
    }
    access = jwt.encode(
        {**common, 'purpose': 'access', 'jti': uuid4().hex, 'exp': issued + timedelta(hours=1)},
        settings.secret_key,
        algorithm='HS256',
    )
    jti = uuid4().hex
    expires = issued + timedelta(days=7)
    refresh = jwt.encode(
        {**common, 'purpose': 'refresh', 'jti': jti, 'exp': expires},
        settings.secret_key,
        algorithm='HS256',
    )
    db.add(RefreshToken(user_id=user.id, token=refresh, jti=jti, expires_at=expires))
    return {'access': access, 'refresh': refresh}


def decode_token(token, settings, kind):
    try:
        data = jwt.decode(
            token,
            settings.secret_key,
            algorithms=['HS256'],
            options={'require': ['exp', 'jti', 'sub', 'purpose', 'credential_version']},
        )
        if data.get('purpose') != kind:
            raise ValueError('wrong token type')
        subject = data['sub']
        if (
            not isinstance(subject, str)
            or not subject.isascii()
            or not subject.isdecimal()
            or subject.startswith('0')
            or len(subject) > 19
            or int(subject) > 9_223_372_036_854_775_807
        ):
            raise ValueError('invalid subject')
        if type(data['credential_version']) is not int or data['credential_version'] < 0:
            raise ValueError('invalid credential version')
        return data
    except (jwt.PyJWTError, ValueError, TypeError):
        raise APIError(
            401,
            {'detail': 'Token 无效或已过期', 'code': 'token_not_valid'},
            {'WWW-Authenticate': 'Bearer'},
        )


def token_user(db, data):
    user = db.get(User, int(data['sub']))
    if not user or not user.is_active or data['credential_version'] != user.credential_version:
        raise APIError(
            401,
            {'detail': '密码已变更，请重新登录', 'code': 'credentials_changed'},
            {'WWW-Authenticate': 'Bearer'},
        )
    return user


def claim_refresh(db, token, settings):
    data = decode_token(token, settings, 'refresh')
    user = token_user(db, data)
    refresh_record = db.scalar(
        select(RefreshToken).where(RefreshToken.jti == data['jti']).with_for_update()
    )
    if not refresh_record:
        refresh_record = RefreshToken(
            user_id=user.id,
            token=token,
            jti=data['jti'],
            expires_at=datetime.fromtimestamp(data['exp'], timezone.utc),
        )
        db.add(refresh_record)
        db.flush()
    if db.scalar(select(RevokedToken.id).where(RevokedToken.token_id == refresh_record.id)):
        raise APIError(401, {'detail': 'Token 已失效', 'code': 'token_not_valid'})
    # Unique token_id makes simultaneous refresh/exchange claims single-use.
    db.add(RevokedToken(token_id=refresh_record.id))
    db.flush()
    return user


def authenticate_credentials(
    db,
    settings,
    *,
    bearer_token=None,
    session_key=None,
    csrf_token=None,
    unsafe=False,
    required=True,
):
    """Resolve parsed credentials without depending on HTTP request objects."""
    if bearer_token is not None:
        return token_user(db, decode_token(bearer_token, settings, 'access'))
    if session_key:
        session = db.get(SessionToken, digest(session_key))
        if session and session.expires_at > now():
            user = db.get(User, session.user_id)
            if user and user.is_active and user.credential_version == session.credential_version:
                if unsafe:
                    if not hmac.compare_digest(csrf_token or '', session.csrf):
                        raise APIError(403, {'detail': 'CSRF 验证失败'})
                return user
    if required:
        raise APIError(401, {'detail': '身份认证信息未提供。'}, {'WWW-Authenticate': 'Bearer'})
    return None
