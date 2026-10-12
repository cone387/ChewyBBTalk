"""Native adoption preserves rows and enforces the same contract on every install."""

import json
import sqlite3
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from database.session import database
from database.upgrade import upgrade


@pytest.fixture
def legacy_engine(tmp_path):
    with sqlite3.connect(tmp_path / 'old.db') as connection:
        connection.executescript(
            (Path(__file__).parents[1] / 'fixtures/legacy.sql').read_text(encoding='utf8')
        )
    engine, _ = database(
        SimpleNamespace(database_url='sqlite:///' + (tmp_path / 'old.db').as_posix())
    )
    yield engine
    engine.dispose()


def test_adoption_archives_metadata_preserves_tokens_and_is_repeatable(legacy_engine):
    with legacy_engine.begin() as connection:
        old_tokens = connection.execute(
            text('SELECT id, jti, token FROM token_blacklist_outstandingtoken ORDER BY id')
        ).all()
        old_permissions = connection.execute(text('SELECT count(*) FROM auth_permission')).scalar()
    upgrade(legacy_engine)
    upgrade(legacy_engine)
    tables = inspect(legacy_engine).get_table_names()
    assert not any(name.startswith(('django_', 'auth_', 'token_blacklist_')) for name in tables)
    with legacy_engine.connect() as connection:
        assert (
            connection.execute(
                text('SELECT id, jti, token FROM cb_refresh_tokens ORDER BY id')
            ).all()
            == old_tokens
        )
        assert connection.execute(text('SELECT token_id FROM cb_revoked_tokens')).scalar() == 2
        archives = (
            connection.execute(
                text(
                    "SELECT payload FROM cb_migration_archive WHERE source='auth_permission' ORDER BY sequence"
                )
            )
            .scalars()
            .all()
        )
        assert len(archives) == old_permissions
        assert json.loads(archives[0])['id'] == 1


def test_valid_missing_unique_constraint_is_repaired(legacy_engine):
    with legacy_engine.begin() as connection:
        connection.exec_driver_sql(
            'DROP INDEX cb_bbtalk_tag_relations_bbtalk_id_tag_id_059acf04_uniq'
        )
    upgrade(legacy_engine)
    with pytest.raises(IntegrityError), legacy_engine.begin() as connection:
        connection.exec_driver_sql(
            'INSERT INTO cb_bbtalk_tag_relations (id,bbtalk_id,tag_id) VALUES (2,1,1)'
        )


@pytest.mark.parametrize('damage', ['duplicate', 'orphan', 'long_uid', 'negative_version'])
def test_invalid_legacy_data_is_rejected_before_business_writes(legacy_engine, damage):
    with legacy_engine.begin() as connection:
        if damage == 'duplicate':
            connection.exec_driver_sql(
                'DROP INDEX cb_bbtalk_tag_relations_bbtalk_id_tag_id_059acf04_uniq'
            )
            connection.exec_driver_sql('INSERT INTO cb_bbtalk_tag_relations VALUES (2,1,1)')
        elif damage == 'orphan':
            connection.exec_driver_sql('UPDATE cb_tags SET user_id=999')
        elif damage == 'long_uid':
            connection.execute(text('UPDATE cb_tags SET uid=:uid'), {'uid': 'x' * 65})
        else:
            connection.exec_driver_sql('PRAGMA ignore_check_constraints=ON')
            connection.exec_driver_sql('UPDATE cb_users SET credential_version=-1')
            connection.exec_driver_sql('PRAGMA ignore_check_constraints=OFF')
        before = connection.exec_driver_sql(
            "SELECT name,sql FROM sqlite_master WHERE type IN ('table','index') ORDER BY name"
        ).all()
    with pytest.raises(RuntimeError, match='cb_'):
        upgrade(legacy_engine)
    with legacy_engine.connect() as connection:
        assert (
            connection.exec_driver_sql(
                "SELECT name,sql FROM sqlite_master WHERE type IN ('table','index') ORDER BY name"
            ).all()
            == before
        )


def test_long_uid_survives_and_fresh_and_adopted_constraints_match(legacy_engine):
    with legacy_engine.begin() as connection:
        connection.execute(text('UPDATE cb_tags SET uid=:uid'), {'uid': 'u' * 64})
    upgrade(legacy_engine)
    fresh, _ = database(SimpleNamespace(database_url='sqlite:///:memory:'))
    try:
        upgrade(fresh)
        old, new = inspect(legacy_engine), inspect(fresh)
        assert old.get_table_names() == new.get_table_names()
        for name in new.get_table_names():
            assert old.get_indexes(name) == new.get_indexes(name), name
            assert old.get_unique_constraints(name) == new.get_unique_constraints(name), name
            assert old.get_foreign_keys(name) == new.get_foreign_keys(name), name
            assert old.get_check_constraints(name) == new.get_check_constraints(name), name
        with legacy_engine.connect() as connection:
            assert connection.exec_driver_sql('SELECT uid FROM cb_tags').scalar() == 'u' * 64
        with pytest.raises(IntegrityError), legacy_engine.begin() as connection:
            connection.exec_driver_sql('UPDATE cb_tags SET user_id=999')
        with pytest.raises(IntegrityError), legacy_engine.begin() as connection:
            connection.exec_driver_sql('UPDATE cb_users SET credential_version=-1')
    finally:
        fresh.dispose()


def test_unknown_inbound_relationship_is_rejected_without_changing_tables(legacy_engine):
    with legacy_engine.begin() as connection:
        connection.exec_driver_sql(
            'CREATE TABLE custom_records (id INTEGER PRIMARY KEY, owner_id INTEGER REFERENCES cb_users(id))'
        )
        connection.exec_driver_sql('INSERT INTO custom_records VALUES (1,1)')
        before = inspect(connection).get_table_names()
    with pytest.raises(RuntimeError, match='custom_records'):
        upgrade(legacy_engine)
    with legacy_engine.connect() as connection:
        assert inspect(connection).get_table_names() == before
        assert connection.exec_driver_sql('SELECT owner_id FROM custom_records').scalar() == 1


def test_history_archive_keeps_admin_rows_after_account_removal(legacy_engine):
    from sqlalchemy.orm import Session
    from models import User
    from services.accounts import delete_user

    with legacy_engine.begin() as connection:
        connection.exec_driver_sql(
            "INSERT INTO django_admin_log (id,object_id,object_repr,action_flag,change_message,content_type_id,user_id,action_time) VALUES (1,'1','historical',2,'edited',16,1,'2026-10-09 09:00:00')"
        )
    upgrade(legacy_engine)
    with Session(legacy_engine) as session:
        delete_user(session, session.get(User, 1))
        session.commit()
    with legacy_engine.connect() as connection:
        archive = json.loads(
            connection.exec_driver_sql(
                "SELECT payload FROM cb_migration_archive WHERE source='django_admin_log'"
            ).scalar()
        )
        assert archive['object_repr'] == 'historical'
        assert archive['user_id'] == 1


def test_missing_user_table_does_not_bootstrap_partial_legacy_data(legacy_engine):
    # A separate metadata-only partial database avoids disabling real constraints.
    engine, _ = database(SimpleNamespace(database_url='sqlite:///:memory:'))
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql('CREATE TABLE cb_tags (id INTEGER PRIMARY KEY)')
            connection.exec_driver_sql('INSERT INTO cb_tags VALUES (7)')
        with pytest.raises(RuntimeError, match='cb_'):
            upgrade(engine)
        assert inspect(engine).get_table_names() == ['cb_tags']
    finally:
        engine.dispose()


@pytest.mark.parametrize(
    'extension',
    [
        'outbound_fk',
        'trigger',
        'view',
        'extra_unique',
        'extra_check',
        'invalid_integer',
        'invalid_date',
    ],
)
def test_unsupported_extensions_and_incompatible_values_are_rejected(legacy_engine, extension):
    with legacy_engine.begin() as connection:
        if extension == 'outbound_fk':
            connection.exec_driver_sql('CREATE TABLE custom_parent (id INTEGER PRIMARY KEY)')
            connection.exec_driver_sql('INSERT INTO custom_parent VALUES (1)')
            connection.exec_driver_sql('ALTER TABLE cb_tags RENAME TO original_tags')
            connection.exec_driver_sql(
                'CREATE TABLE cb_tags (id INTEGER PRIMARY KEY,create_time datetime NOT NULL,update_time datetime NOT NULL,uid varchar(22) NOT NULL,name varchar(50) NOT NULL,color varchar(7) NOT NULL,sort_order real NOT NULL,user_id bigint NOT NULL REFERENCES custom_parent(id))'
            )
            connection.exec_driver_sql('INSERT INTO cb_tags SELECT * FROM original_tags')
            connection.exec_driver_sql('DROP TABLE original_tags')
        elif extension == 'trigger':
            connection.exec_driver_sql(
                'CREATE TRIGGER custom_tag_trigger AFTER UPDATE ON cb_tags BEGIN SELECT 1; END'
            )
        elif extension == 'view':
            connection.exec_driver_sql(
                'CREATE VIEW custom_token_report AS SELECT id,jti FROM token_blacklist_outstandingtoken'
            )
        elif extension == 'extra_unique':
            connection.exec_driver_sql(
                'CREATE UNIQUE INDEX custom_unique_user_email ON cb_users(email)'
            )
        elif extension == 'extra_check':
            connection.exec_driver_sql('ALTER TABLE cb_tags RENAME TO original_tags')
            connection.exec_driver_sql(
                'CREATE TABLE cb_tags (id INTEGER PRIMARY KEY,create_time datetime NOT NULL,update_time datetime NOT NULL,uid varchar(22) NOT NULL,name varchar(50) NOT NULL,color varchar(7) NOT NULL,sort_order real NOT NULL CHECK (sort_order >= 0),user_id bigint NOT NULL)'
            )
            connection.exec_driver_sql('INSERT INTO cb_tags SELECT * FROM original_tags')
            connection.exec_driver_sql('DROP TABLE original_tags')
        elif extension == 'invalid_integer':
            connection.exec_driver_sql("UPDATE cb_users SET credential_version='not-an-integer'")
        else:
            connection.exec_driver_sql("UPDATE cb_tags SET create_time='not-a-date'")
        before = connection.exec_driver_sql(
            'SELECT name,sql FROM sqlite_master ORDER BY name'
        ).all()
    with pytest.raises(RuntimeError, match='cb_'):
        upgrade(legacy_engine)
    with legacy_engine.connect() as connection:
        assert (
            connection.exec_driver_sql('SELECT name,sql FROM sqlite_master ORDER BY name').all()
            == before
        )


def test_sqlite_json_validity_is_enforced_after_adoption(legacy_engine):
    upgrade(legacy_engine)
    with pytest.raises(IntegrityError), legacy_engine.begin() as connection:
        connection.exec_driver_sql("UPDATE cb_bbtalks SET attachments='broken-json'")
