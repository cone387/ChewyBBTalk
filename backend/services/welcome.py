import random

from sqlalchemy import select, update

from core.errors import fail
from models import User, WelcomeSettings


def configuration(row):
    if row is None:
        return {'enabled': False, 'quotes': [], 'revision': 0}
    return {'enabled': row.enabled, 'quotes': row.quotes, 'revision': row.revision}


def locked_settings(db, user_id):
    # A no-op UPDATE serializes writers on SQLite as well as row-locking databases,
    # including the first save where the settings row does not exist yet.
    db.execute(
        update(User).where(User.id == user_id).values(id=user_id, update_time=User.update_time)
    )
    return db.scalar(
        select(WelcomeSettings)
        .where(
            WelcomeSettings.user_id == user_id,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def save_configuration(db, user_id, data):
    row = locked_settings(db, user_id)
    if data.revision != (row.revision if row else 0):
        fail(409, '文案池已在其他页面更新，请重新载入后再保存', code='welcome_conflict')
    if row is None:
        row = WelcomeSettings(user_id=user_id, remaining=[], last_id='', quotes=[], revision=0)
        db.add(row)
    quotes = [quote.model_dump() for quote in data.quotes]
    valid = {quote['id'] for quote in quotes}
    old = {quote['id'] for quote in row.quotes}
    remaining = [key for key in row.remaining if key in valid]
    additions = list(valid - old)
    random.SystemRandom().shuffle(additions)
    row.remaining = remaining + additions
    row.quotes = quotes
    row.enabled = data.enabled
    row.revision += 1
    db.flush()
    return configuration(row)


def select_quote(db, user_id):
    row = locked_settings(db, user_id)
    if row is None or not row.enabled or not row.quotes:
        return None
    quotes = {quote['id']: quote for quote in row.quotes}
    remaining = [key for key in row.remaining if key in quotes]
    if not remaining:
        remaining = list(quotes)
        random.SystemRandom().shuffle(remaining)
    if len(remaining) > 1 and remaining[0] == row.last_id:
        remaining[0], remaining[1] = remaining[1], remaining[0]
    row.last_id = remaining[0]
    row.remaining = remaining[1:]
    db.flush()
    return quotes[row.last_id]


def restore_configuration(db, user_id, data):
    if locked_settings(db, user_id) is None:
        db.add(
            WelcomeSettings(
                user_id=user_id,
                enabled=data.enabled,
                quotes=[quote.model_dump() for quote in data.quotes],
                revision=1,
            )
        )
