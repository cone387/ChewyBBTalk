"""Re-encode password records losslessly and name token revocations explicitly.

Only this migration understands historical password serialization. Unknown,
malformed, and deliberately unusable credentials are retained verbatim; the
runtime rejects them, so an upgrade never enables a previously locked account.
Historical values resembling the new format require resolution before migration.
"""

import base64
import json

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mysql import LONGTEXT

from database.migrations.schema_v3 import UTCDateTime

revision = '0004_native_credentials'
down_revision = '0003_native_schema'
branch_labels = None
depends_on = None


def convert_password(encoded, *, allow_native=False):
    try:
        algorithm, *parts = encoded.split('$')
        if algorithm in ('pbkdf2_sha256', 'pbkdf2_sha1'):
            iterations, salt, digest = parts
            iterations = int(iterations)
            if iterations < 1:
                return encoded
            record = {'v': 1, 'kdf': 'pbkdf2', 'hash': algorithm[7:], 'iterations': iterations}
            digest_length = 32 if algorithm == 'pbkdf2_sha256' else 20
        elif algorithm == 'scrypt':
            work, salt, block, parallel, digest = parts
            work, block, parallel = int(work), int(block), int(parallel)
            if work < 2 or work & (work - 1) or block < 1 or parallel < 1:
                return encoded
            record = {'v': 1, 'kdf': 'scrypt', 'n': work, 'r': block, 'p': parallel}
            digest_length = 64
        else:
            if not allow_native:
                try:
                    record = json.loads(encoded)
                except (ValueError, TypeError, RecursionError):
                    record = None
                if isinstance(record, dict) and record.get('v') == 1:
                    raise RuntimeError(
                        'Unsupported historical credential resembles a native password record; '
                        'resolve the credential before upgrading'
                    )
            return encoded
        decoded = base64.b64decode(digest, validate=True)
        if (
            not salt
            or len(decoded) != digest_length
            or base64.b64encode(decoded).decode() != digest
        ):
            return encoded
        if record['kdf'] == 'pbkdf2' and record['iterations'] > 10_000_000:
            raise RuntimeError('Unsupported password cost; resolve the credential before upgrading')
        if record['kdf'] == 'scrypt' and (
            128 * work * block > 128 * 1024 * 1024 or work * block * parallel > 8_388_608
        ):
            raise RuntimeError('Unsupported password cost; resolve the credential before upgrading')
        record.update(salt=base64.b64encode(salt.encode()).decode(), digest=digest)
        return json.dumps(record, separators=(',', ':'))
    except (ValueError, TypeError, AttributeError, UnicodeError):
        return encoded


def password_conversions(connection):
    """Read-only gate, also called before the historical migration chain."""
    inspector = sa.inspect(connection)
    if not inspector.has_table('cb_identities'):
        return []
    columns = {column['name']: column for column in inspector.get_columns('cb_identities')}
    # A committed widening is the first step of this revision. Only that
    # intermediate state can contain already converted native credentials.
    allow_native = isinstance(columns['credential']['type'], (sa.Text, LONGTEXT))
    identities = sa.table(
        'cb_identities', sa.column('id'), sa.column('identity_type'), sa.column('credential')
    )
    rows = connection.execute(
        sa.select(identities.c.id, identities.c.credential).where(
            identities.c.identity_type == 'password'
        )
    ).all()
    return [
        (identity_id, credential, convert_password(credential, allow_native=allow_native))
        for identity_id, credential in rows
    ]


def upgrade():
    connection = op.get_bind()
    conversions = password_conversions(connection)
    inspector = sa.inspect(connection)
    columns = {column['name']: column for column in inspector.get_columns('cb_revoked_tokens')}
    old_columns = {'id', 'token_id', 'blacklisted_at'}
    new_columns = {'id', 'token_id', 'revoked_at'}
    if set(columns) not in (old_columns, new_columns):
        raise RuntimeError('Unexpected cb_revoked_tokens columns; verify migration state')
    timestamp = 'blacklisted_at' if set(columns) == old_columns else 'revoked_at'
    if columns[timestamp]['nullable'] or not isinstance(columns[timestamp]['type'], sa.DateTime):
        raise RuntimeError('Unexpected cb_revoked_tokens timestamp; verify migration state')
    credential = next(
        column for column in inspector.get_columns('cb_identities') if column['name'] == 'credential'
    )
    target_type = LONGTEXT if connection.dialect.name == 'mysql' else sa.Text
    if not isinstance(credential['type'], target_type):
        with op.batch_alter_table('cb_identities') as batch:
            batch.alter_column(
                'credential',
                existing_type=credential['type'],
                type_=sa.Text().with_variant(LONGTEXT(), 'mysql'),
                existing_nullable=False,
            )
    if timestamp == 'blacklisted_at':
        with op.batch_alter_table('cb_revoked_tokens') as batch:
            batch.alter_column(
                'blacklisted_at',
                new_column_name='revoked_at',
                existing_type=UTCDateTime().load_dialect_impl(connection.dialect),
                existing_nullable=False,
            )
    identities = sa.table('cb_identities', sa.column('id'), sa.column('credential'))
    for identity_id, credential, converted in conversions:
        if converted != credential:
            connection.execute(
                identities.update()
                .where(identities.c.id == identity_id)
                .values(credential=converted)
            )


def downgrade():
    raise RuntimeError('Credential serialization upgrade requires restoring a database backup')
