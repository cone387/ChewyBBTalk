from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import update

from api.dependencies import DB, Bearer, CSRFToken, CurrentUser, SessionCookie, resolve_user
from models import User, WelcomeSettings
from schemas.welcome import WelcomeConfig, WelcomeSelection
from services.welcome import configuration, save_configuration, select_quote

router = APIRouter(prefix='/api/v1/bbtalk/settings/welcome', tags=['Welcome'])


def write_user(
    request: Request, db: DB, bearer: Bearer, session: SessionCookie, csrf: CSRFToken = None
):
    user_id = resolve_user(request, db, bearer, session, csrf).id
    # Authentication is read-only. End its snapshot before waiting for a write
    # lock, then reauthenticate under that lock to honor account/token changes.
    db.rollback()
    db.execute(
        update(User).where(User.id == user_id).values(id=user_id, update_time=User.update_time)
    )
    return resolve_user(request, db, bearer, session, csrf)


WriteUser = Annotated[User, Depends(write_user)]


@router.get('', response_model=WelcomeConfig)
def get_configuration(response: Response, db: DB, user: CurrentUser):
    response.headers['Cache-Control'] = 'no-store'
    return configuration(db.get(WelcomeSettings, user.id))


@router.patch('', response_model=WelcomeConfig)
def patch_configuration(data: WelcomeConfig, response: Response, db: DB, user: WriteUser):
    result = save_configuration(db, user.id, data)
    db.commit()
    response.headers['Cache-Control'] = 'no-store'
    return result


@router.post('/next', response_model=WelcomeSelection)
def next_quote(response: Response, db: DB, user: WriteUser):
    result = select_quote(db, user.id)
    db.commit()
    response.headers['Cache-Control'] = 'no-store'
    return {'quote': result}
