"""Complete native schema, preserving and archiving all adopted records."""

from alembic import op
from database.migrations.native_adoption import adopt

revision = '0003_native_schema'
down_revision = '0002_web_sessions'
branch_labels = None
depends_on = None


def upgrade():
    adopt(op.get_bind())


def downgrade():
    raise RuntimeError('原生结构迁移保留历史归档；回退请恢复升级前完整数据库备份')
