"""Add web sessions to installations already stamped at the native baseline."""

from alembic import op
from database.migrations.schema_v1 import SessionToken

revision = '0002_web_sessions'
down_revision = '0001_native_backend'
branch_labels = None
depends_on = None


def upgrade():
    # Some adopted databases were stamped before sessions were included in v1.
    # Use the frozen schema and preserve every existing business/session row.
    SessionToken.__table__.create(op.get_bind(), checkfirst=True)


def downgrade():
    raise RuntimeError('回退请使用升级前备份，禁止自动删除登录会话')
