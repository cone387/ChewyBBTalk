from typing import Literal

from pydantic import Field

from schemas.base import Input


class LoginInput(Input):
    username: str = Field(default='', max_length=150)
    password: str = Field(default='', max_length=4096)


class RegisterInput(LoginInput):
    email: str = Field(default='', max_length=254)
    display_name: str = Field(default='', max_length=150)


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


class DeleteAccountInput(Input):
    password: str = Field(min_length=1, max_length=4096)


class DesktopAuthorizeInput(Input):
    code_challenge: str = Field(pattern=r'^[A-Za-z0-9_-]{43}$')
    code_challenge_method: Literal['S256']
    redirect_uri: str = Field(min_length=1, max_length=2048)


class DesktopExchangeInput(Input):
    code: str = Field(pattern=r'^[A-Za-z0-9_-]{43}$')
    code_verifier: str = Field(pattern=r'^[A-Za-z0-9._~-]{43,128}$')
    redirect_uri: str = Field(min_length=1, max_length=2048)
