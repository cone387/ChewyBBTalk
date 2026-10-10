import importlib.util
import json
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect, select, text

from chewy_api.application import create_app
from chewy_api.core.config import Settings
from chewy_api.db.models import Attachment, BBTalk, StorageConfig, User
from chewy_api.db.upgrade import upgrade
from chewy_api.services.security import decrypt_secret


def test_no_framework_dependency():
    for name in ('django', 'rest_framework', 'asgiref', 'chewy_attachment'):
        assert importlib.util.find_spec(name) is None


def test_existing_database_password_jwt_blacklist_secrets_and_relations(tmp_path):
    fixtures = Path(__file__).parents[1] / 'fixtures'
    with sqlite3.connect(tmp_path/'old.sqlite3') as connection:
        connection.executescript((fixtures/'legacy.sql').read_text(encoding='utf8'))
    tokens = json.loads((fixtures/'legacy.json').read_text(encoding='utf8'))
    config = Settings(data_dir=tmp_path, media_root=tmp_path/'media', database_url='sqlite:///' + (tmp_path/'old.sqlite3').as_posix(), secret_key='legacy-migration-fixture-key-not-for-production')
    app = create_app(config)
    try:
        upgrade(app.state.engine)
        upgrade(app.state.engine)
        config.storage_root.mkdir(parents=True)
        (config.storage_root/'legacy.txt').write_bytes(b'legacy')
        with TestClient(app) as client:
            result = client.post('/api/v1/bbtalk/auth/token/', json={'username':'legacy-user','password':'legacy-password-2026'})
            assert result.status_code == 200, result.text
            client.headers['Authorization'] = 'Bearer ' + result.json()['access']
            record = client.get('/api/v1/bbtalk/' + tokens['record_uid'] + '/').json()
            assert record['content'] == '旧数据库内容'
            assert record['tags'][0]['name'] == 'legacy-tag'
            assert record['comment_count'] == 1
            assert client.get('/api/v1/attachments/files/' + tokens['attachment_id'] + '/preview/').content == b'legacy'
            assert client.post('/api/v1/bbtalk/auth/token/refresh/', json={'refresh': tokens['revoked']}).status_code == 401
            assert client.post('/api/v1/bbtalk/auth/token/refresh/', json={'refresh': tokens['refresh']}).status_code == 200
            assert client.post('/api/v1/bbtalk/auth/token/refresh/', json={'refresh': tokens['refresh']}).status_code == 401
            assert client.post('/api/v1/bbtalk/', json={'content':'new after upgrade'}).status_code == 201
        with app.state.sessions() as db:
            assert db.get(User, 1).username == 'legacy-user'
            assert decrypt_secret(db.scalar(select(StorageConfig)).s3_secret_access_key, config) == 'fixture-secret'
            assert db.scalar(select(BBTalk).where(BBTalk.uid == tokens['record_uid'])) is not None
            assert db.get(Attachment, tokens['attachment_id']).owner_id == '1'
    finally:
        app.state.engine.dispose()


def test_incomplete_legacy_schema_fails_before_modification(tmp_path):
    config = Settings(data_dir=tmp_path, database_url='sqlite:///' + (tmp_path/'old.sqlite3').as_posix(), secret_key='test')
    app = create_app(config)
    try:
        with app.state.engine.begin() as connection:
            connection.execute(text('CREATE TABLE cb_users (id INTEGER PRIMARY KEY, username TEXT)'))
            connection.execute(text("INSERT INTO cb_users VALUES (1, 'preserved')"))
        with pytest.raises(RuntimeError, match='缺少'):
            upgrade(app.state.engine)
        with app.state.engine.connect() as connection:
            assert connection.execute(text('SELECT username FROM cb_users')).scalar() == 'preserved'
        assert 'cb_bbtalks' not in inspect(app.state.engine).get_table_names()
    finally:
        app.state.engine.dispose()
