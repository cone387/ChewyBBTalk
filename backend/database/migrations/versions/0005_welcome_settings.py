"""Personal welcome configuration and account-scoped shuffle progress."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '0005_welcome_settings'
down_revision = '0004_native_credentials'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'cb_welcome_settings',
        sa.Column(
            'user_id',
            sa.BigInteger().with_variant(sa.Integer(), 'sqlite'),
            sa.ForeignKey('cb_users.id', ondelete='CASCADE'),
            primary_key=True,
        ),
        sa.Column('enabled', sa.Boolean(), nullable=False),
        sa.Column('quotes', sa.JSON().with_variant(JSONB(), 'postgresql'), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('remaining', sa.JSON().with_variant(JSONB(), 'postgresql'), nullable=False),
        sa.Column('last_id', sa.String(64), nullable=False),
    )


def downgrade():
    raise RuntimeError('回退请保留文案表或恢复备份，禁止自动删除用户文案')
