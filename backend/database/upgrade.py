"""Versioned upgrades for empty databases and existing installations."""

from pathlib import Path

from alembic import command
from alembic.config import Config

from database.migrations.native_adoption import preflight


def upgrade(engine):
    config = Config()
    config.set_main_option('script_location', str(Path(__file__).parent / 'migrations'))
    with engine.begin() as connection:
        preflight(connection)
        config.attributes['connection'] = connection
        command.upgrade(config, 'head')
