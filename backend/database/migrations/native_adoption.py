"""Frozen v3 adoption machinery. Only migrate a stopped, backed-up installation."""

import base64
import hashlib
import json
import re
from datetime import date, datetime, time, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKeyConstraint,
    Integer,
    MetaData,
    PrimaryKeyConstraint,
    String,
    Table,
    UniqueConstraint,
    Uuid,
    and_,
    func,
    inspect,
    select,
    text,
    type_coerce,
)
from sqlalchemy.schema import CreateTable

from database.migrations.schema_v3 import Base


LEGACY_TABLES = (
    'auth_group_permissions',
    'auth_permission',
    'auth_group',
    'django_admin_log',
    'django_content_type',
    'django_migrations',
    'django_session',
)
RENAMED = {
    'cb_refresh_tokens': 'token_blacklist_outstandingtoken',
    'cb_revoked_tokens': 'token_blacklist_blacklistedtoken',
}
PREFIX = '_native_v3_'
BACKUP_PREFIX = '_previous_v3_'
REVISION = '0003_native_schema'


def reject_triggers(connection, names):
    dialect = connection.dialect.name
    if dialect == 'sqlite':
        rows = connection.execute(text("SELECT tbl_name FROM sqlite_master WHERE type='trigger'"))
    elif dialect == 'postgresql':
        rows = connection.execute(
            text(
                'SELECT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname=current_schema()'
            )
        )
    elif dialect == 'mysql':
        rows = connection.execute(
            text(
                'SELECT EVENT_OBJECT_TABLE FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()'
            )
        )
    else:
        raise RuntimeError('cb_* 原生接管仅支持 SQLite/PostgreSQL/MySQL')
    for (name,) in rows:
        if name in names:
            raise RuntimeError(f'{name} 存在自定义触发器；请先迁移扩展行为')


def validate_column(connection, source, column):
    actual = source.c[column.name]
    expected_type = column.type._type_affinity
    actual_type = actual.type._type_affinity
    allowed = {expected_type}
    if expected_type is Boolean:
        allowed.add(Integer)  # MySQL represents BOOLEAN as TINYINT(1).
    if connection.dialect.name == 'sqlite' and expected_type in (JSON, Uuid):
        allowed.add(String)
    if connection.dialect.name == 'mysql' and expected_type is Uuid:
        allowed.add(String)
    if actual_type not in allowed:
        raise RuntimeError(f'{source.name}.{column.name} 数据类型与目标不兼容')
    if expected_type is Integer and connection.dialect.name != 'sqlite':
        bits = 64 if isinstance(column.type, BigInteger) else 32
        invalid = (actual < -(2 ** (bits - 1))) | (actual > 2 ** (bits - 1) - 1)
        if connection.scalar(select(func.count()).select_from(source).where(invalid)):
            raise RuntimeError(f'{source.name}.{column.name} 超过目标整数范围')
    if expected_type is Boolean:
        invalid = (
            actual.is_not(None) & actual.not_in([0, 1])
            if connection.dialect.name != 'postgresql'
            else None
        )
        if invalid is not None and connection.scalar(
            select(func.count()).select_from(source).where(invalid)
        ):
            raise RuntimeError(f'{source.name}.{column.name} 布尔值无效')
    if connection.dialect.name == 'mysql' and expected_type is Uuid:
        for value in connection.scalars(select(actual).where(actual.is_not(None))):
            try:
                UUID(value)
            except (ValueError, TypeError, AttributeError):
                raise RuntimeError(f'{source.name}.{column.name} 存在无效 UUID') from None
    if connection.dialect.name != 'sqlite':
        return
    storage_types = {
        Integer: ('integer',),
        Float: ('integer', 'real'),
        Boolean: ('integer',),
        String: ('text',),
        DateTime: ('text',),
        JSON: ('text',),
        Uuid: ('text',),
    }
    if expected_type in storage_types:
        invalid = actual.is_not(None) & func.typeof(actual).not_in(storage_types[expected_type])
        if connection.scalar(select(func.count()).select_from(source).where(invalid)):
            raise RuntimeError(f'{source.name}.{column.name} 存在不兼容的 SQLite 动态类型')
    if expected_type is JSON:
        if connection.scalar(
            select(func.count())
            .select_from(source)
            .where(actual.is_not(None), func.json_valid(actual) == 0)
        ):
            raise RuntimeError(f'{source.name}.{column.name} JSON 无效')
    elif expected_type in (DateTime, Uuid):
        quote = connection.dialect.identifier_preparer.quote
        # Raw values avoid SQLAlchemy converting malformed data before our safe error.
        rows = connection.exec_driver_sql(
            f'SELECT {quote(column.name)} FROM {quote(source.name)} WHERE {quote(column.name)} IS NOT NULL'
        )
        for (value,) in rows:
            try:
                datetime.fromisoformat(value) if expected_type is DateTime else UUID(value)
            except (ValueError, TypeError, AttributeError):
                raise RuntimeError(f'{source.name}.{column.name} 存在无效日期或 UUID') from None


def source_tables(connection):
    """Reflect only migration-owned tables; unknown inbound references are rejected."""
    inspector = inspect(connection)
    names = set(inspector.get_table_names())
    if inspector.get_view_names():
        raise RuntimeError('cb_* 数据库存在自定义视图；请先单独迁移视图再接管业务表')
    if any(name.startswith((PREFIX, BACKUP_PREFIX)) for name in names):
        raise RuntimeError('cb_* 原生迁移存在未完成的临时/保留表，请从备份恢复或人工核验后再迁移')
    sources = {}
    metadata = MetaData()
    for target in Base.metadata.sorted_tables:
        if target.name == 'cb_migration_archive':
            continue
        name = RENAMED.get(target.name, target.name)
        if target.name in RENAMED and target.name in names:
            raise RuntimeError(f'{target.name} 已存在，不能与旧令牌表混合接管')
        if name not in names:
            if name == 'cb_sessions':
                continue  # Revision 0002 creates it before v3.
            raise RuntimeError(f'{name} 缺少业务表；请先完成旧版本迁移')
        table = Table(name, metadata, autoload_with=connection)
        expected, actual = set(target.c.keys()), set(table.c.keys())
        if expected != actual:
            raise RuntimeError(f'{name} 字段不完整或有未支持扩展字段；请先核验旧版本结构')
        allowed_unique = {
            tuple(sorted(constraint.columns.keys()))
            for constraint in target.constraints
            if isinstance(constraint, (UniqueConstraint, PrimaryKeyConstraint))
        }
        actual_unique = inspector.get_unique_constraints(name)
        actual_unique += [index for index in inspector.get_indexes(name) if index['unique']]
        if any(tuple(sorted(item['column_names'])) not in allowed_unique for item in actual_unique):
            raise RuntimeError(f'{name} 存在未支持的扩展唯一约束；请先迁移扩展规则')

        def normalized_check(expression):
            return re.sub(r'[\s\"`\[\]()]', '', expression).lower()

        allowed_checks = {
            normalized_check(
                str(
                    constraint.sqltext.compile(
                        dialect=connection.dialect, compile_kwargs={'literal_binds': True}
                    )
                )
            )
            for constraint in target.constraints
            if isinstance(constraint, CheckConstraint)
        }
        if name == 'cb_bbtalks':
            allowed_checks |= {
                'json_validattachmentsorattachmentsisnull',
                'json_validcontextorcontextisnull',
            }
        if any(
            normalized_check(item['sqltext']) not in allowed_checks
            for item in inspector.get_check_constraints(name)
        ):
            raise RuntimeError(f'{name} 存在未支持的扩展 CHECK 约束；请先迁移扩展规则')
        sources[target.name] = table
    owned = {table.name for table in sources.values()} | set(LEGACY_TABLES)
    reject_triggers(connection, names & owned)
    for name in names & owned:
        for foreign_key in inspector.get_foreign_keys(name):
            if foreign_key['referred_table'] not in owned:
                raise RuntimeError(f'{name} 有指向扩展表的外键；请先迁移扩展关系')
    for name in names - owned - {'alembic_version'}:
        for foreign_key in inspector.get_foreign_keys(name):
            if foreign_key['referred_table'] in owned:
                raise RuntimeError(f'{name} 有指向 cb_* 迁移表的扩展外键；请先迁移扩展关系')
    return sources


def preflight(connection):
    """Validate all data before even the baseline migration can write anything."""
    names = set(inspect(connection).get_table_names())
    if connection.dialect.name == 'mysql' and connection.dialect.server_version_info < (8, 0, 16):
        raise RuntimeError('cb_* 原生约束需要 MySQL 8.0.16 或更新版本')
    if not names:
        return
    if 'alembic_version' in names:
        revision = connection.execute(text('SELECT version_num FROM alembic_version')).scalar()
        if revision == REVISION:
            return
    if 'cb_migration_archive' in names:
        raise RuntimeError('cb_migration_archive 已存在但修订未完成；请先恢复备份或核验迁移状态')
    if not any(name.startswith(('cb_', 'token_blacklist_', 'django_', 'auth_')) for name in names):
        return
    sources = source_tables(connection)
    for target in Base.metadata.sorted_tables:
        source = sources.get(target.name)
        if source is None:
            continue
        for column in target.c:
            actual = source.c[column.name]
            validate_column(connection, source, column)
            if not column.nullable and connection.scalar(
                select(func.count()).select_from(source).where(actual.is_(None))
            ):
                raise RuntimeError(f'{source.name}.{column.name} 存在空值')
            length = getattr(column.type, 'length', None)
            if length and connection.scalar(
                select(func.count()).select_from(source).where(func.char_length(actual) > length)
            ):
                raise RuntimeError(f'{source.name}.{column.name} 超过目标字段长度')
        for constraint in target.constraints:
            if connection.dialect.name not in constraint.info.get(
                'dialects', (connection.dialect.name,)
            ):
                continue
            if isinstance(constraint, (UniqueConstraint, PrimaryKeyConstraint)):
                columns = [source.c[column.name] for column in constraint.columns]
                query = (
                    select(func.count())
                    .select_from(source)
                    .where(and_(*(column.is_not(None) for column in columns)))
                    .group_by(*columns)
                    .having(func.count() > 1)
                    .limit(1)
                )
                if connection.execute(query).first():
                    raise RuntimeError(f'{source.name} 存在重复键：{constraint.name}')
            elif isinstance(constraint, CheckConstraint):
                expression = constraint.sqltext.compile(
                    dialect=connection.dialect, compile_kwargs={'literal_binds': True}
                )
                query = select(func.count()).select_from(source).where(text(f'NOT ({expression})'))
                if connection.scalar(query):
                    raise RuntimeError(f'{source.name} 不满足约束：{constraint.name}')
            elif isinstance(constraint, ForeignKeyConstraint):
                parent = sources[constraint.referred_table.name]
                comparisons = [
                    source.c[element.parent.name] == parent.c[element.column.name]
                    for element in constraint.elements
                ]
                present = [
                    source.c[element.parent.name].is_not(None) for element in constraint.elements
                ]
                query = (
                    select(func.count())
                    .select_from(source)
                    .where(*present, ~select(1).select_from(parent).where(*comparisons).exists())
                )
                if connection.scalar(query):
                    raise RuntimeError(f'{source.name} 存在孤儿关系：{constraint.name}')


def staging_metadata(dialect):
    """Create a separate FK graph so source constraints remain enabled during copy."""
    metadata = MetaData()
    for target in Base.metadata.sorted_tables:
        columns = [
            Column(
                column.name,
                column.type,
                nullable=column.nullable,
                primary_key=column.primary_key,
                autoincrement=column.autoincrement,
            )
            for column in target.c
        ]
        table = Table(PREFIX + target.name, metadata, *columns, **dict(target.kwargs))
        table.primary_key.name = target.primary_key.name
        for constraint in target.constraints:
            if dialect not in constraint.info.get('dialects', (dialect,)):
                continue
            if isinstance(constraint, UniqueConstraint):
                table.append_constraint(
                    UniqueConstraint(*constraint.columns.keys(), name=constraint.name)
                )
            elif isinstance(constraint, CheckConstraint):
                table.append_constraint(CheckConstraint(constraint.sqltext, name=constraint.name))
            elif isinstance(constraint, ForeignKeyConstraint):
                table.append_constraint(
                    ForeignKeyConstraint(
                        [element.parent.name for element in constraint.elements],
                        [
                            PREFIX + element.column.table.name + '.' + element.column.name
                            for element in constraint.elements
                        ],
                        name=constraint.name,
                        ondelete=constraint.ondelete,
                    )
                )
    return metadata


def archive_value(value):
    if isinstance(value, bytes):
        return {'$type': 'bytes', 'base64': base64.b64encode(value).decode('ascii')}
    if isinstance(value, (datetime, date, time)):
        return {'$type': type(value).__name__, 'value': value.isoformat()}
    if isinstance(value, (Decimal, UUID)):
        return {'$type': type(value).__name__, 'value': str(value)}
    raise TypeError('归档遇到未支持的数据类型')


def content_digest(connection, table, target):
    """Compare typed row contents before replacing any original table.

    Sequential streaming avoids both loading whole tables and overlapping MySQL
    unbuffered cursors. Normalize only equivalent storage encodings, never values.
    """
    digest = hashlib.sha256()
    columns = [type_coerce(table.c[column.name], column.type) for column in target.c]
    ordering = [table.c[column.name] for column in target.primary_key.columns]
    query = select(*columns).order_by(*ordering).execution_options(yield_per=500)
    with connection.execute(query) as rows:
        for row in rows:
            normalized = []
            for value, column in zip(row, target.c):
                affinity = column.type._type_affinity
                if value is not None:
                    if affinity is DateTime:
                        if isinstance(value, str):
                            value = datetime.fromisoformat(value)
                        value = (
                            value.replace(tzinfo=timezone.utc)
                            if value.tzinfo is None
                            else value.astimezone(timezone.utc)
                        )
                    elif affinity is Uuid:
                        value = UUID(str(value)).hex
                    elif affinity is Boolean:
                        value = bool(value)
                normalized.append(value)
            encoded = json.dumps(
                normalized, ensure_ascii=False, sort_keys=True, default=archive_value
            ).encode('utf8')
            digest.update(len(encoded).to_bytes(8, 'big'))
            digest.update(encoded)
    return digest.digest()


def adopt(connection):
    preflight(connection)
    sources = source_tables(connection)
    staging = staging_metadata(connection.dialect.name)
    # Deliberately leave foreign-key enforcement enabled, including SQLite.
    for table in staging.sorted_tables:
        connection.execute(CreateTable(table))
    for target in Base.metadata.sorted_tables:
        source = sources.get(target.name)
        if source is not None:
            table = staging.tables[PREFIX + target.name]
            connection.execute(
                table.insert().from_select(
                    target.c.keys(), select(*(source.c[name] for name in target.c.keys()))
                )
            )
            if connection.scalar(select(func.count()).select_from(table)) != connection.scalar(
                select(func.count()).select_from(source)
            ):
                raise RuntimeError(f'{source.name} 迁移复制行数不匹配')
            if content_digest(connection, source, target) != content_digest(
                connection, table, target
            ):
                raise RuntimeError(f'{source.name} 迁移复制内容不一致，已拒绝替换原表')
    old_metadata = MetaData()
    names = set(inspect(connection).get_table_names())
    archive = staging.tables[PREFIX + 'cb_migration_archive']
    for name in LEGACY_TABLES:
        if name not in names:
            continue
        table = Table(name, old_metadata, autoload_with=connection)
        query = select(table)
        if table.primary_key.columns:
            query = query.order_by(*table.primary_key.columns)
        for sequence, row in enumerate(connection.execute(query).mappings(), 1):
            connection.execute(
                archive.insert().values(
                    source=name,
                    sequence=sequence,
                    payload=json.dumps(dict(row), ensure_ascii=False, default=archive_value),
                )
            )
    quote = connection.dialect.identifier_preparer.quote
    if connection.dialect.name == 'mysql':
        # MySQL DDL commits implicitly: retain all originals across the atomic swap.
        # Index names are table-local here, so create them before the swap as well.
        for target in Base.metadata.sorted_tables:
            for index in target.indexes:
                fields = ', '.join(quote(column.name) for column in index.columns)
                connection.exec_driver_sql(
                    f'CREATE INDEX {quote(index.name)} ON {quote(PREFIX + target.name)} ({fields})'
                )
        renames = [
            f'{quote(source.name)} TO {quote(BACKUP_PREFIX + source.name)}'
            for source in sources.values()
        ]
        renames += [
            f'{quote(PREFIX + target.name)} TO {quote(target.name)}'
            for target in Base.metadata.sorted_tables
        ]
        connection.exec_driver_sql('RENAME TABLE ' + ', '.join(renames))
        # The copied/archive rows are committed by RENAME; only now remove sources.
        for name in LEGACY_TABLES:
            if name in names:
                connection.exec_driver_sql(f'DROP TABLE {quote(name)}')
        source_metadata = MetaData()
        for source in sources.values():
            Table(BACKUP_PREFIX + source.name, source_metadata, autoload_with=connection)
        for table in reversed(source_metadata.sorted_tables):
            if table.name.startswith(BACKUP_PREFIX):
                table.drop(connection)
    else:
        # PostgreSQL and our SQLite engine execute this whole graph swap in a transaction.
        for name in LEGACY_TABLES:
            if name in names:
                connection.exec_driver_sql(f'DROP TABLE {quote(name)}')
        source_metadata = MetaData()
        for source in sources.values():
            Table(source.name, source_metadata, autoload_with=connection)
        for table in reversed(source_metadata.sorted_tables):
            if table.name in {source.name for source in sources.values()}:
                table.drop(connection)
        for target in Base.metadata.sorted_tables:
            connection.exec_driver_sql(
                f'ALTER TABLE {quote(PREFIX + target.name)} RENAME TO {quote(target.name)}'
            )
        for target in Base.metadata.sorted_tables:
            for index in target.indexes:
                index.create(connection)
    if connection.dialect.name == 'postgresql':
        for target in Base.metadata.sorted_tables:
            column = target.autoincrement_column
            if column is not None:
                sequence = connection.scalar(
                    text('SELECT pg_get_serial_sequence(:table, :column)'),
                    {'table': target.name, 'column': column.name},
                )
                if sequence:
                    maximum = connection.scalar(select(func.max(column)))
                    connection.execute(
                        text('SELECT setval(CAST(:sequence AS regclass), :value, :used)'),
                        {'sequence': sequence, 'value': maximum or 1, 'used': maximum is not None},
                    )
