from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


def database(settings):
    options = {'pool_pre_ping': True}
    if settings.database_url.startswith('sqlite:'):
        options['connect_args'] = {'check_same_thread': False, 'timeout': 15}
        if settings.database_url.endswith(':memory:'):
            options['poolclass'] = StaticPool
        else:
            Path(settings.database_url.removeprefix('sqlite:///')).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(settings.database_url, **options)
    if engine.dialect.name == 'sqlite':
        @event.listens_for(engine, 'connect')
        def configure(connection, _):
            connection.isolation_level = None
            connection.execute('PRAGMA foreign_keys=ON')
            connection.execute('PRAGMA journal_mode=WAL')

        @event.listens_for(engine, 'begin')
        def begin(connection):
            connection.exec_driver_sql('BEGIN')
    return engine, sessionmaker(engine, expire_on_commit=False)
