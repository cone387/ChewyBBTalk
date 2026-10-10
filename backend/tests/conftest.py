import pytest
from fastapi.testclient import TestClient

from application import create_app
from core.config import Settings
from database.upgrade import upgrade
from models import Identity, User
from services.security import make_password, token_pair


@pytest.fixture(scope='session')
def password_hash():
    return make_password('test-password-2026')


@pytest.fixture
def app(tmp_path, password_hash):
    config = Settings(data_dir=tmp_path, media_root=tmp_path/'media', database_url='sqlite:///' + (tmp_path/'native.sqlite3').as_posix(), secret_key='native-pytest-key-not-for-production', registration_enabled=True, login_rate='', registration_rate='', refresh_rate='', recovery_rate='')
    app = create_app(config)
    upgrade(app.state.engine)
    with app.state.sessions() as db:
        user = User(username='owner', email='owner@example.com', display_name='Owner')
        db.add(user)
        db.flush()
        db.add(Identity(user_id=user.id, identifier=user.username, credential=password_hash))
        app.state.owner_id = user.id
        app.state.tokens = token_pair(db, user, config)
        db.commit()
    yield app
    app.state.engine.dispose()


@pytest.fixture
def client(app):
    with TestClient(app) as client:
        client.headers['Authorization'] = 'Bearer ' + app.state.tokens['access']
        yield client
