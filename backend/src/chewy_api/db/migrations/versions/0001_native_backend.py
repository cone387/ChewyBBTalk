"""Adopt the deployed business schema and add native web sessions.

No legacy data or framework metadata is dropped. An incomplete older schema is
rejected before any write instead of silently creating a broken installation.
"""
from alembic import op
from chewy_api.db.migrations.schema_v1 import Base
from sqlalchemy import inspect

revision = '0001_native_backend'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    inspector = inspect(connection)
    tables = set(inspector.get_table_names())
    if 'cb_users' in tables:
        missing_tables = set(Base.metadata.tables) - {'cb_sessions'} - tables
        if missing_tables:
            raise RuntimeError(f'旧数据库缺少业务表 {sorted(missing_tables)}；请先用旧版本完成数据库迁移')
    for table in Base.metadata.sorted_tables:
        if table.name in tables:
            actual = {column['name'] for column in inspector.get_columns(table.name)}
            missing = set(table.columns.keys()) - actual
            if missing:
                raise RuntimeError(f'{table.name} 缺少字段 {sorted(missing)}；请先用旧版本升级至 0009_password_recovery，再运行迁移')
    Base.metadata.create_all(connection, checkfirst=True)


def downgrade():
    raise RuntimeError('此迁移保留原始数据；回退请使用升级前备份，禁止自动删除业务表')
