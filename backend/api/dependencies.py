from typing import Annotated

from fastapi import Depends, Request, Security
from fastapi.security import APIKeyCookie, HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from models import User
from services.security import request_user


def get_db(request: Request):
    with request.app.state.sessions() as session:
        yield session


DB = Annotated[Session, Depends(get_db)]


jwt_auth = HTTPBearer(auto_error=False, scheme_name='jwtAuth', bearerFormat='JWT')
session_auth = APIKeyCookie(name='sessionid', auto_error=False, scheme_name='sessionAuth')
Bearer = Annotated[HTTPAuthorizationCredentials | None, Security(jwt_auth)]
SessionCookie = Annotated[str | None, Security(session_auth)]


def current_user(request: Request, db: DB, bearer: Bearer, session: SessionCookie):
    return request_user(request, db)


CurrentUser = Annotated[User, Depends(current_user)]


def optional_user(request: Request, db: DB, bearer: Bearer, session: SessionCookie):
    return request_user(request, db, required=False)


OptionalUser = Annotated[User | None, Depends(optional_user)]
