"""Cross-dialect adoption in disposable databases, never the supplied database.

TEST_DATABASE_URL must be a dedicated test server account with CREATE/DROP DATABASE
permission. Each test owns a randomly named database and removes only that database.
"""

import base64
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Column, Integer, MetaData, Table, Text, create_engine, event, inspect, text
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import Session

from database.migrations import schema_v1 as old
from database.migrations import schema_v3 as previous
from database.upgrade import upgrade
from models import BBTalk, Comment, Identity, RefreshToken, RevokedToken, Tag, User
from services.security import verify_password


@pytest.fixture
def isolated_database():
    configured = os.getenv('TEST_DATABASE_URL')
    if not configured:
        pytest.skip('TEST_DATABASE_URL is not configured')
    url = make_url(configured)
    # Match Settings: SQLAlchemy's unqualified PostgreSQL URL can select
    # psycopg v3, while this project installs psycopg2 (and PyMySQL for MySQL).
    if url.drivername == 'postgresql':
        url = url.set(drivername='postgresql+psycopg2')
    elif url.drivername == 'mysql':
        url = url.set(drivername='mysql+pymysql')
    if url.get_backend_name() not in {'postgresql', 'mysql'}:
        pytest.skip('Disposable database tests require PostgreSQL or MySQL')
    name = 'bbtalk_migration_test_' + uuid4().hex
    administrative = create_engine(url, isolation_level='AUTOCOMMIT', hide_parameters=True)
    engine = None
    try:
        with administrative.connect() as connection:
            quoted = connection.dialect.identifier_preparer.quote(name)
            connection.exec_driver_sql('CREATE DATABASE ' + quoted)
        engine = create_engine(url.set(database=name), hide_parameters=True)
        yield engine
    finally:
        if engine is not None:
            engine.dispose()
            with administrative.connect() as connection:
                quoted = connection.dialect.identifier_preparer.quote(name)
                connection.exec_driver_sql('DROP DATABASE ' + quoted)
        administrative.dispose()


def test_empty_database_has_enforced_native_constraints(isolated_database):
    engine = isolated_database
    upgrade(engine)
    upgrade(engine)
    assert inspect(engine).has_table('cb_migration_archive')
    with Session(engine) as session:
        user = User(username='fresh')
        session.add(user)
        session.flush()
        user_id = user.id
        session.add(Tag(user_id=user_id, name='unicode', uid='标' * 64))
        session.commit()
    with pytest.raises(DBAPIError) as violation, engine.begin() as connection:
        connection.execute(text('UPDATE cb_users SET credential_version=-1'))
    if engine.dialect.name == 'mysql':
        assert violation.value.orig.args[0] == 3819
    else:
        assert violation.value.orig.pgcode == '23514'
    with pytest.raises(IntegrityError), engine.begin() as connection:
        connection.execute(text('UPDATE cb_tags SET user_id=999999'))


def test_legacy_adoption_preserves_rows_archive_and_next_identity(isolated_database):
    engine = isolated_database
    old.Base.metadata.create_all(engine)
    precise_time = datetime(2026, 10, 9, 9, 0, 1, 123456, tzinfo=timezone.utc)
    long_text = '完整旧正文' * 20000
    precise_order = 16777217.25
    if engine.dialect.name == 'mysql':
        with engine.begin() as connection:
            connection.exec_driver_sql("SET SESSION sql_mode=''")
            quoted = connection.dialect.identifier_preparer.quote(engine.url.database)
            connection.exec_driver_sql(
                f'ALTER DATABASE {quoted} CHARACTER SET latin1 COLLATE latin1_swedish_ci'
            )
            connection.exec_driver_sql(
                'ALTER TABLE cb_tags MODIFY create_time DATETIME(6) NOT NULL, MODIFY update_time DATETIME(6) NOT NULL, MODIFY sort_order DOUBLE NOT NULL'
            )
            connection.exec_driver_sql('ALTER TABLE cb_users MODIFY bio LONGTEXT NOT NULL')
            connection.exec_driver_sql('ALTER TABLE cb_bbtalks MODIFY content LONGTEXT NOT NULL')
            connection.exec_driver_sql('ALTER TABLE cb_comments MODIFY content LONGTEXT NOT NULL')
    with Session(engine) as session:
        session.add(
            old.User(
                id=99,
                username='historical',
                display_name='历史🍎',
                credential_version=3,
                bio=long_text,
            )
        )
        session.flush()
        session.add(
            old.Tag(
                id=77,
                user_id=99,
                name='historical',
                uid='h' * 22,
                sort_order=precise_order,
                create_time=precise_time,
                update_time=precise_time,
            )
        )
        session.add(old.BBTalk(id=66, user_id=99, content=long_text))
        session.add(
            old.OutstandingToken(
                id=81,
                user_id=99,
                jti='historical-jti',
                token='historical-token',
                expires_at=old.now(),
            )
        )
        session.flush()
        session.add(old.Comment(id=55, user_id=99, bbtalk_id=66, content=long_text))
        session.add(old.BlacklistedToken(id=88, token_id=81))
        session.commit()
    metadata = MetaData()
    audit = Table(
        'django_admin_log',
        metadata,
        Column('id', Integer, primary_key=True),
        Column('message', Text().with_variant(LONGTEXT(), 'mysql')),
        mysql_charset='utf8mb4',
    )
    metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(audit.insert().values(id=7, message='原始审计' * 20000))
    upgrade(engine)
    upgrade(engine)
    with Session(engine) as session:
        assert session.get(RefreshToken, 81).token == 'historical-token'
        assert session.get(RevokedToken, 88).token_id == 81
        assert session.get(Tag, 77).uid == 'h' * 22
        assert session.get(Tag, 77).create_time == precise_time
        assert session.get(Tag, 77).update_time == precise_time
        assert session.get(Tag, 77).sort_order == precise_order
        assert session.get(User, 99).bio == long_text
        assert session.get(User, 99).display_name == '历史🍎'
        assert session.get(BBTalk, 66).content == long_text
        assert session.get(Comment, 55).content == long_text
        user = User(username='next-account')
        session.add(user)
        session.commit()
        assert user.id > 99
    with engine.connect() as connection:
        payload = connection.scalar(
            text("SELECT payload FROM cb_migration_archive WHERE source='django_admin_log'")
        )
        assert json.loads(payload) == {'id': 7, 'message': '原始审计' * 20000}
    assert not any(
        name.startswith(('django_', 'token_blacklist_', '_native_', '_previous_'))
        for name in inspect(engine).get_table_names()
    )


def test_unknown_inbound_foreign_key_is_rejected_on_real_database(isolated_database):
    engine = isolated_database
    old.Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            'CREATE TABLE custom_records (id INTEGER PRIMARY KEY, user_id BIGINT REFERENCES cb_users(id))'
        )
        # MySQL ignores inline REFERENCES; add its actual constraint explicitly.
        if engine.dialect.name == 'mysql':
            connection.exec_driver_sql(
                'ALTER TABLE custom_records ADD CONSTRAINT custom_owner FOREIGN KEY (user_id) REFERENCES cb_users(id)'
            )
    before = inspect(engine).get_table_names()
    with pytest.raises(RuntimeError, match='custom_records'):
        upgrade(engine)
    assert inspect(engine).get_table_names() == before


@pytest.mark.parametrize('duplicate', [False, True])
def test_missing_uniqueness_is_repaired_or_bad_rows_rejected(isolated_database, duplicate):
    engine = isolated_database
    old.Base.metadata.create_all(engine)
    with Session(engine) as session:
        session.add(old.User(id=1, username='owner'))
        session.flush()
        session.add(old.Tag(id=1, user_id=1, name='tag'))
        session.add(old.BBTalk(id=1, user_id=1, content='record'))
        session.flush()
        session.add(old.RecordTag(id=1, bbtalk_id=1, tag_id=1))
        session.commit()
    with engine.begin() as connection:
        constraints = inspect(connection).get_unique_constraints('cb_bbtalk_tag_relations')
        name = next(
            item['name'] for item in constraints if item['column_names'] == ['bbtalk_id', 'tag_id']
        )
        quoted = connection.dialect.identifier_preparer.quote(name)
        operation = 'DROP INDEX' if engine.dialect.name == 'mysql' else 'DROP CONSTRAINT'
        connection.exec_driver_sql(f'ALTER TABLE cb_bbtalk_tag_relations {operation} {quoted}')
        if duplicate:
            connection.exec_driver_sql(
                'INSERT INTO cb_bbtalk_tag_relations (id,bbtalk_id,tag_id) VALUES (2,1,1)'
            )
    before = inspect(engine).get_table_names()
    if duplicate:
        with pytest.raises(RuntimeError, match='cb_bbtalk_tag_relations'):
            upgrade(engine)
        assert inspect(engine).get_table_names() == before
    else:
        upgrade(engine)
        with pytest.raises(IntegrityError), engine.begin() as connection:
            connection.exec_driver_sql(
                'INSERT INTO cb_bbtalk_tag_relations (id,bbtalk_id,tag_id) VALUES (2,1,1)'
            )


def test_extension_view_is_preserved_by_refusing_adoption(isolated_database):
    engine = isolated_database
    old.Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            'CREATE VIEW custom_token_report AS SELECT id,jti FROM token_blacklist_outstandingtoken'
        )
    before = inspect(engine).get_table_names()
    with pytest.raises(RuntimeError, match='cb_'):
        upgrade(engine)
    assert inspect(engine).get_table_names() == before
    with engine.connect() as connection:
        assert connection.exec_driver_sql('SELECT * FROM custom_token_report').all() == []


@pytest.mark.parametrize('algorithm', ['sha1', 'sha256', 'scrypt'])
def test_native_credentials_upgrade_preserves_passwords_and_revocations(
    isolated_database, algorithm
):
    engine = isolated_database
    config = Config()
    config.set_main_option(
        'script_location', str(Path(__file__).parents[2] / 'database/migrations')
    )
    with engine.begin() as connection:
        config.attributes['connection'] = connection
        command.upgrade(config, '0003_native_schema')
    salt = 'salt-' + 'x' * 90
    if algorithm == 'scrypt':
        value = hashlib.scrypt(b'password', salt=salt.encode(), n=1024, r=8, p=1, dklen=64)
        credential = f'scrypt$1024${salt}$8$1$' + base64.b64encode(value).decode()
    else:
        value = hashlib.pbkdf2_hmac(algorithm, b'password', salt.encode(), 100)
        credential = f'pbkdf2_{algorithm}$100${salt}$' + base64.b64encode(value).decode()
    timestamp = datetime(2026, 10, 9, 9, 0, 1, 123456, tzinfo=timezone.utc)
    with Session(engine) as session:
        session.add(previous.User(id=1, username='native-upgrade'))
        session.flush()
        session.add(
            previous.Identity(id=1, user_id=1, identifier='native-upgrade', credential=credential)
        )
        session.add(
            previous.OutstandingToken(
                id=1, user_id=1, token='retained', jti='retained-jti', expires_at=timestamp
            )
        )
        session.flush()
        session.add(previous.BlacklistedToken(id=1, token_id=1, blacklisted_at=timestamp))
        session.commit()
    upgrade(engine)
    upgrade(engine)
    with Session(engine) as session:
        converted = session.get(Identity, 1).credential
        assert verify_password('password', converted)
        assert not verify_password('wrong', converted)
        assert base64.b64decode(json.loads(converted)['digest']) == value
        assert base64.b64decode(json.loads(converted)['salt']) == salt.encode()
        assert session.get(RefreshToken, 1).token == 'retained'
        assert session.get(RevokedToken, 1).revoked_at == timestamp
    columns = {column['name']: column for column in inspect(engine).get_columns('cb_identities')}
    assert isinstance(columns['credential']['type'], (Text, LONGTEXT))


def test_credentials_upgrade_resumes_committed_ddl(isolated_database):
    engine = isolated_database
    # Recreate the committed 0004 schema, not today's head with an old stamp:
    # later migrations must still be pending when credential recovery resumes.
    config = Config()
    config.set_main_option(
        'script_location', str(Path(__file__).parents[2] / 'database/migrations')
    )
    with engine.begin() as connection:
        config.attributes['connection'] = connection
        command.upgrade(config, '0004_native_credentials')
    timestamp = datetime(2026, 10, 9, 9, 0, 1, 123456, tzinfo=timezone.utc)
    digest = base64.b64encode(hashlib.pbkdf2_hmac('sha256', b'password', b'salt', 100)).decode()
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
    with Session(engine) as session:
        session.add(User(id=1, username='retry'))
        session.flush()
        for identity_id, value in ((1, credential), (2, converted)):
            session.add(
                Identity(id=identity_id, user_id=1, identifier=str(identity_id), credential=value)
            )
        session.add(
            RefreshToken(id=1, user_id=1, token='retained', jti='retry-jti', expires_at=timestamp)
        )
        session.flush()
        session.add(RevokedToken(id=1, token_id=1, revoked_at=timestamp))
        session.commit()
    with engine.begin() as connection:
        connection.execute(text("UPDATE alembic_version SET version_num='0003_native_schema'"))
    upgrade(engine)
    upgrade(engine)
    with Session(engine) as session:
        assert verify_password('password', session.get(Identity, 1).credential)
        assert session.get(Identity, 2).credential == converted
        assert session.get(RefreshToken, 1).token == 'retained'
        assert session.get(RevokedToken, 1).revoked_at == timestamp


def test_legacy_unsupported_cost_fails_before_any_ddl(isolated_database):
    engine = isolated_database
    old.Base.metadata.create_all(engine)
    credential = 'pbkdf2_sha256$10000001$salt$' + base64.b64encode(b'x' * 32).decode()
    with Session(engine) as session:
        session.add(old.User(id=1, username='cost'))
        session.flush()
        session.add(old.Identity(id=1, user_id=1, identifier='cost', credential=credential))
        session.commit()
    ddl = []

    @event.listens_for(engine, 'before_cursor_execute')
    def track_ddl(connection, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith(('CREATE ', 'ALTER ', 'DROP ')):
            ddl.append(statement)

    with pytest.raises(RuntimeError, match='password cost'):
        upgrade(engine)
    assert ddl == []
    assert not inspect(engine).has_table('alembic_version')
    with Session(engine) as session:
        assert session.get(old.Identity, 1).credential == credential
