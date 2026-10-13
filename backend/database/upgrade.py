"""Versioned upgrades for empty databases and existing installations."""

from importlib import import_module
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text

from database.migrations.native_adoption import preflight


def upgrade(engine):
    config = Config()
    config.set_main_option('script_location', str(Path(__file__).parent / 'migrations'))
    with engine.begin() as connection:
        # Historical adoption validates only its own schema. Later revisions
        # have already passed adoption and may legitimately change that schema.
        native_revisions = {
            revision.revision
            for revision in ScriptDirectory.from_config(config).walk_revisions(
                base='0003_native_schema'
            )
        }
        current = (
            connection.execute(text('SELECT version_num FROM alembic_version')).scalar()
            if 'alembic_version' in inspect(connection).get_table_names()
            else None
        )
        if current not in native_revisions:
            preflight(connection)
        credentials_revisions = {
            revision.revision
            for revision in ScriptDirectory.from_config(config).walk_revisions(
                base='0004_native_credentials'
            )
        }
        if current not in credentials_revisions:
            # Cost/format incompatibilities must fail before even the legacy
            # adoption DDL, which MySQL cannot roll back.
            import_module(
                'database.migrations.versions.0004_native_credentials'
            ).password_conversions(connection)
        config.attributes['connection'] = connection
        command.upgrade(config, 'head')
