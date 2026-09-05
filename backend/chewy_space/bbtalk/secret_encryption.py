"""Encryption helpers for secrets stored in application data."""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


ENCRYPTED_PREFIX = 'enc:v1:'


def _fernet() -> Fernet:
    """Build a deterministic Fernet key from the persisted Django secret key."""
    digest = hashlib.sha256(settings.SECRET_KEY.encode('utf-8')).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def is_encrypted(value: str | None) -> bool:
    return bool(value and value.startswith(ENCRYPTED_PREFIX))


def encrypt_secret(value: str | None) -> str:
    """Encrypt a secret, preserving empty values and already encrypted values."""
    if not value or is_encrypted(value):
        return value or ''
    token = _fernet().encrypt(value.encode('utf-8')).decode('ascii')
    return f'{ENCRYPTED_PREFIX}{token}'


def decrypt_secret(value: str | None) -> str:
    """Decrypt an encrypted value and remain compatible with legacy plaintext."""
    if not value or not is_encrypted(value):
        return value or ''
    token = value[len(ENCRYPTED_PREFIX):].encode('ascii')
    try:
        return _fernet().decrypt(token).decode('utf-8')
    except (InvalidToken, UnicodeDecodeError, ValueError) as exc:
        raise ValueError('无法解密存储密钥，请确认 SECRET_KEY 未发生变化') from exc
