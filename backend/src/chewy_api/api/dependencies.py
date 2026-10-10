from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from chewy_api.db.models import User
from chewy_api.services.security import request_user


def get_db(request: Request):
    with request.app.state.sessions() as session:
        yield session


DB = Annotated[Session, Depends(get_db)]


def current_user(request: Request, db: DB):
    return request_user(request, db)


CurrentUser = Annotated[User, Depends(current_user)]
