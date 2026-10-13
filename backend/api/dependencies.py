from typing import Annotated

from fastapi import Depends, Header, Request, Security
from fastapi.security import APIKeyCookie, HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from models import User
from services.security import authenticate_credentials


def get_db(request: Request):
    with request.app.state.sessions() as session:
        yield session


DB = Annotated[Session, Depends(get_db)]


class ExplicitBearer(HTTPBearer):
    async def __call__(self, request: Request):
        credentials = await super().__call__(request)
        # Preserve explicit Bearer precedence even when its token is empty.
        # HTTPBearer(auto_error=False) normally treats this as absent, which
        # would unexpectedly fall back to an otherwise valid session cookie.
        scheme, _, token = request.headers.get('authorization', '').partition(' ')
        if credentials is None and scheme.lower() == 'bearer':
            return HTTPAuthorizationCredentials(scheme=scheme, credentials=token)
        return credentials


jwt_auth = ExplicitBearer(auto_error=False, scheme_name='jwtAuth', bearerFormat='JWT')
session_auth = APIKeyCookie(name='cb_session', auto_error=False, scheme_name='sessionAuth')
Bearer = Annotated[HTTPAuthorizationCredentials | None, Security(jwt_auth)]
SessionCookie = Annotated[str | None, Security(session_auth)]
CSRFToken = Annotated[
    str | None,
    Header(
        alias='X-CSRF-Token',
        description=(
            'Session Cookie 认证的 POST/PUT/PATCH/DELETE 请求必须提供登录时的 cb_csrf；'
            'Bearer 认证及 GET/HEAD/OPTIONS 无需此头。'
        ),
    ),
]


def resolve_user(request, db, bearer, session, csrf, required=True):
    return authenticate_credentials(
        db,
        request.app.state.settings,
        bearer_token=bearer.credentials if bearer else None,
        session_key=session,
        csrf_token=csrf,
        unsafe=request.method not in {'GET', 'HEAD', 'OPTIONS'},
        required=required,
    )


def current_user(
    request: Request,
    db: DB,
    bearer: Bearer,
    session: SessionCookie,
    csrf: CSRFToken = None,
):
    return resolve_user(request, db, bearer, session, csrf)


CurrentUser = Annotated[User, Depends(current_user)]


def optional_user(
    request: Request,
    db: DB,
    bearer: Bearer,
    session: SessionCookie,
    csrf: CSRFToken = None,
):
    return resolve_user(request, db, bearer, session, csrf, required=False)


OptionalUser = Annotated[User | None, Depends(optional_user)]
