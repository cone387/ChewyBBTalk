import base64
import hashlib
import importlib.util
import json
import sqlite3
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import event, inspect, select, text
from sqlalchemy.orm import Session

from application import create_app
from core.config import Settings
from database.upgrade import upgrade
from models import Attachment, BBTalk, Identity, StorageConfig, User
from services.security import decrypt_secret, verify_password


def test_no_framework_dependency():
    for name in ('django', 'rest_framework', 'asgiref', 'chewy_attachment'):
        assert importlib.util.find_spec(name) is None


def test_existing_database_password_jwt_blacklist_secrets_and_relations(tmp_path):
    fixtures = Path(__file__).parents[1] / 'fixtures'
    with sqlite3.connect(tmp_path / 'old.sqlite3') as connection:
        connection.executescript((fixtures / 'legacy.sql').read_text(encoding='utf8'))
    tokens = json.loads((fixtures / 'legacy.json').read_text(encoding='utf8'))
    config = Settings(
        data_dir=tmp_path,
        media_root=tmp_path / 'media',
        database_url='sqlite:///' + (tmp_path / 'old.sqlite3').as_posix(),
        secret_key='legacy-migration-fixture-key-not-for-production',
    )
    app = create_app(config)
    try:
        upgrade(app.state.engine)
        upgrade(app.state.engine)
        config.storage_root.mkdir(parents=True)
        (config.storage_root / 'legacy.txt').write_bytes(b'legacy')
        with TestClient(app) as client:
            result = client.post(
                '/api/v1/bbtalk/auth/token',
                json={'username': 'legacy-user', 'password': 'legacy-password-2026'},
            )
            assert result.status_code == 200, result.text
            client.headers['Authorization'] = 'Bearer ' + result.json()['access']
            record = client.get('/api/v1/bbtalk/' + tokens['record_uid']).json()
            assert record['content'] == '旧数据库内容'
            assert record['tags'][0]['name'] == 'legacy-tag'
            assert record['comment_count'] == 1
            assert (
                client.get(
                    '/api/v1/attachments/files/' + tokens['attachment_id'] + '/preview'
                ).content
                == b'legacy'
            )
            assert (
                client.post(
                    '/api/v1/bbtalk/auth/token/refresh', json={'refresh': tokens['revoked']}
                ).status_code
                == 401
            )
            assert (
                client.post(
                    '/api/v1/bbtalk/auth/token/refresh', json={'refresh': tokens['refresh']}
                ).status_code
                == 401
            )
            assert (
                client.post('/api/v1/bbtalk', json={'content': 'new after upgrade'}).status_code
                == 201
            )
        with app.state.sessions() as db:
            assert db.get(User, 1).username == 'legacy-user'
            assert (
                decrypt_secret(db.scalar(select(StorageConfig)).s3_secret_access_key, config)
                == 'fixture-secret'
            )
            assert db.scalar(select(BBTalk).where(BBTalk.uid == tokens['record_uid'])) is not None
            assert db.get(Attachment, tokens['attachment_id']).owner_id == '1'
    finally:
        app.state.engine.dispose()


def test_incomplete_legacy_schema_fails_before_modification(tmp_path):
    config = Settings(
        data_dir=tmp_path,
        database_url='sqlite:///' + (tmp_path / 'old.sqlite3').as_posix(),
        secret_key='test',
    )
    app = create_app(config)
    try:
        with app.state.engine.begin() as connection:
            connection.execute(
                text('CREATE TABLE cb_users (id INTEGER PRIMARY KEY, username TEXT)')
            )
            connection.execute(text("INSERT INTO cb_users VALUES (1, 'preserved')"))
        with pytest.raises(RuntimeError, match='缺少'):
            upgrade(app.state.engine)
        with app.state.engine.connect() as connection:
            assert connection.execute(text('SELECT username FROM cb_users')).scalar() == 'preserved'
        assert 'cb_bbtalks' not in inspect(app.state.engine).get_table_names()
    finally:
        app.state.engine.dispose()


@pytest.mark.parametrize('algorithm', ['sha1', 'sha256', 'scrypt'])
def test_upgrade_converts_password_records_without_plaintext(tmp_path, algorithm):
    password, salt = b'migration-password', 'preserved-salt'
    if algorithm == 'scrypt':
        value = hashlib.scrypt(password, salt=salt.encode(), n=1024, r=8, p=1, dklen=64)
        encoded = f'scrypt$1024${salt}$8$1$' + base64.b64encode(value).decode()
    else:
        value = hashlib.pbkdf2_hmac(algorithm, password, salt.encode(), 100)
        encoded = f'pbkdf2_{algorithm}$100${salt}$' + base64.b64encode(value).decode()
    config = Settings(
        data_dir=tmp_path,
        database_url='sqlite:///' + (tmp_path / 'old.sqlite3').as_posix(),
        secret_key='migration-test',
    )
    fixtures = Path(__file__).parents[1] / 'fixtures'
    with sqlite3.connect(tmp_path / 'old.sqlite3') as connection:
        connection.executescript((fixtures / 'legacy.sql').read_text(encoding='utf8'))
        connection.execute(
            "UPDATE cb_identities SET credential = ? WHERE identity_type = 'password'", (encoded,)
        )
    app = create_app(config)
    try:
        migration = Config()
        migration.set_main_option(
            'script_location', str(Path(__file__).parents[2] / 'database/migrations')
        )
        with app.state.engine.begin() as connection:
            migration.attributes['connection'] = connection
            command.upgrade(migration, '0003_native_schema')
            previous = connection.execute(
                text('SELECT id, blacklisted_at FROM cb_revoked_tokens ORDER BY id')
            ).all()
        upgrade(app.state.engine)
        upgrade(app.state.engine)
        with app.state.engine.connect() as connection:
            assert (
                connection.execute(
                    text('SELECT id, revoked_at FROM cb_revoked_tokens ORDER BY id')
                ).all()
                == previous
            )
            converted = connection.execute(
                text("SELECT credential FROM cb_identities WHERE identity_type = 'password'")
            ).scalar_one()
        record = json.loads(converted)
        assert base64.b64decode(record['digest']) == value
        assert base64.b64decode(record['salt']) == salt.encode()
        assert verify_password(password.decode(), converted)
        assert not verify_password('wrong', converted)
    finally:
        app.state.engine.dispose()


@pytest.mark.parametrize(
    'credential',
    [
        '',
        '!disabled',
        'unknown$1$salt$hash',
        'pbkdf2_sha256$bad$salt$hash',
        'scrypt$3$salt$8$1$aGFzaA==',
        'pbkdf2_sha256$100$salt$B+aZcYDPfxKQTwQQDUBdNIiP32KvbVBqDswjsZb+mdh=',
    ],
)
def test_upgrade_preserves_unusable_credentials_without_enabling_login(tmp_path, credential):
    config = Settings(
        data_dir=tmp_path,
        database_url='sqlite:///' + (tmp_path / 'old.sqlite3').as_posix(),
        secret_key='migration-test',
    )
    fixtures = Path(__file__).parents[1] / 'fixtures'
    with sqlite3.connect(tmp_path / 'old.sqlite3') as connection:
        connection.executescript((fixtures / 'legacy.sql').read_text(encoding='utf8'))
        connection.execute(
            "UPDATE cb_identities SET credential = ? WHERE identity_type = 'password'",
            (credential,),
        )
    app = create_app(config)
    try:
        upgrade(app.state.engine)
        with app.state.engine.connect() as connection:
            preserved = connection.execute(
                text("SELECT credential FROM cb_identities WHERE identity_type = 'password'")
            ).scalar_one()
        assert preserved == credential
        assert not verify_password('password', preserved)
    finally:
        app.state.engine.dispose()


def test_upgrade_rejects_excessive_password_cost_before_changing_schema(tmp_path):
    # A valid digest record must not be migrated into an account the runtime locks.
    credential = 'pbkdf2_sha256$10000001$salt$' + base64.b64encode(b'x' * 32).decode()
    config = Settings(
        data_dir=tmp_path,
        database_url='sqlite:///' + (tmp_path / 'old.sqlite3').as_posix(),
        secret_key='migration-test',
    )
    fixtures = Path(__file__).parents[1] / 'fixtures'
    with sqlite3.connect(tmp_path / 'old.sqlite3') as connection:
        connection.executescript((fixtures / 'legacy.sql').read_text(encoding='utf8'))
        connection.execute(
            "UPDATE cb_identities SET credential = ? WHERE identity_type = 'password'",
            (credential,),
        )
    app = create_app(config)
    try:
        migration = Config()
        migration.set_main_option(
            'script_location', str(Path(__file__).parents[2] / 'database/migrations')
        )
        with app.state.engine.begin() as connection:
            migration.attributes['connection'] = connection
            command.upgrade(migration, '0003_native_schema')
        with pytest.raises(RuntimeError, match='password cost'):
            upgrade(app.state.engine)
        with app.state.engine.connect() as connection:
            assert (
                connection.execute(text('SELECT version_num FROM alembic_version')).scalar_one()
                == '0003_native_schema'
            )
            assert (
                connection.execute(
                    text("SELECT credential FROM cb_identities WHERE identity_type = 'password'")
                ).scalar_one()
                == credential
            )
        assert 'blacklisted_at' in {
            column['name'] for column in inspect(app.state.engine).get_columns('cb_revoked_tokens')
        }
    finally:
        app.state.engine.dispose()


@pytest.mark.parametrize('kind', ['excessive_cost', 'native_like'])
def test_legacy_password_rejected_before_any_ddl(tmp_path, kind):
    path = tmp_path / 'legacy.sqlite3'
    with sqlite3.connect(path) as connection:
        connection.executescript(
            (Path(__file__).parents[1] / 'fixtures/legacy.sql').read_text(encoding='utf8')
        )
        credential = 'pbkdf2_sha256$10000001$salt$' + base64.b64encode(b'x' * 32).decode()
        if kind == 'native_like':
            credential = json.dumps(
                {
                    'v': 1,
                    'kdf': 'pbkdf2',
                    'hash': 'sha256',
                    'iterations': 1,
                    'salt': 'cw==',
                    'digest': base64.b64encode(
                        hashlib.pbkdf2_hmac('sha256', b'password', b's', 1)
                    ).decode(),
                }
            )
        connection.execute(
            "UPDATE cb_identities SET credential=? WHERE identity_type='password'", (credential,)
        )
    connection.close()
    app = create_app(Settings(data_dir=tmp_path, database_url='sqlite:///' + path.as_posix()))
    ddl = []

    @event.listens_for(app.state.engine, 'before_cursor_execute')
    def track_ddl(connection, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith(('CREATE ', 'ALTER ', 'DROP ')):
            ddl.append(statement)

    try:
        before = set(inspect(app.state.engine).get_table_names())
        with pytest.raises(RuntimeError, match='password cost|historical credential'):
            upgrade(app.state.engine)
        assert ddl == []
        assert set(inspect(app.state.engine).get_table_names()) == before
        with app.state.engine.connect() as connection:
            assert (
                connection.execute(
                    text("SELECT credential FROM cb_identities WHERE identity_type='password'")
                ).scalar_one()
                == credential
            )
    finally:
        app.state.engine.dispose()


@pytest.mark.parametrize('state', ['both', 'missing'])
def test_credentials_upgrade_rejects_ambiguous_revocation_schema_before_ddl(tmp_path, state):
    app = create_app(
        Settings(
            data_dir=tmp_path, database_url='sqlite:///' + (tmp_path / 'state.sqlite3').as_posix()
        )
    )
    try:
        upgrade(app.state.engine)
        with app.state.engine.begin() as connection:
            connection.execute(text("UPDATE alembic_version SET version_num='0003_native_schema'"))
            statement = (
                'ALTER TABLE cb_revoked_tokens ADD COLUMN blacklisted_at DATETIME'
                if state == 'both'
                else 'ALTER TABLE cb_revoked_tokens RENAME COLUMN revoked_at TO unknown_at'
            )
            connection.execute(text(statement))
        ddl = []

        @event.listens_for(app.state.engine, 'before_cursor_execute')
        def track_ddl(connection, cursor, statement, parameters, context, executemany):
            if statement.lstrip().upper().startswith(('CREATE ', 'ALTER ', 'DROP ')):
                ddl.append(statement)

        with pytest.raises(RuntimeError, match='cb_revoked_tokens columns'):
            upgrade(app.state.engine)
        assert ddl == []
    finally:
        app.state.engine.dispose()


def test_credentials_upgrade_resumes_after_committed_ddl(tmp_path):
    app = create_app(
        Settings(
            data_dir=tmp_path, database_url='sqlite:///' + (tmp_path / 'retry.sqlite3').as_posix()
        )
    )
    try:
        upgrade(app.state.engine)
        # MySQL commits each ALTER before the credential updates and revision stamp.
        # Persist that exact intermediate schema with one unconverted and one
        # already converted record to exercise safe recovery of either state.
        with app.state.engine.begin() as connection:
            connection.execute(text("UPDATE alembic_version SET version_num='0003_native_schema'"))
        with Session(app.state.engine) as session:
            session.add(User(id=1, username='retry'))
            session.flush()
            digest = base64.b64encode(
                hashlib.pbkdf2_hmac('sha256', b'password', b'salt', 100)
            ).decode()
            credential = 'pbkdf2_sha256$100$salt$' + digest
            converted = json.dumps(
                {
                    'v': 1,
                    'kdf': 'pbkdf2',
                    'hash': 'sha256',
                    'iterations': 100,
                    'salt': 'c2FsdA==',
                    'digest': digest,
                }
            )
            for identity_id, value in ((1, credential), (2, converted)):
                session.add(
                    Identity(
                        id=identity_id, user_id=1, identifier=str(identity_id), credential=value
                    )
                )
            session.commit()
        upgrade(app.state.engine)
        upgrade(app.state.engine)
        with app.state.engine.connect() as connection:
            values = (
                connection.execute(text('SELECT credential FROM cb_identities ORDER BY id'))
                .scalars()
                .all()
            )
            assert all(verify_password('password', value) for value in values)
            assert values[1] == converted
            assert (
                connection.execute(text('SELECT version_num FROM alembic_version')).scalar_one()
                == '0004_native_credentials'
            )
    finally:
        app.state.engine.dispose()
