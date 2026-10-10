"""Exercise competing HTTP requests with independent SQL connections.

Set TEST_DATABASE_URL only for an isolated PostgreSQL test database in CI.
"""
import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from chewy_api.application import create_app
from chewy_api.core.config import Settings
from chewy_api.db.models import BBTalk, Identity, SubmissionReceipt, User
from chewy_api.db.upgrade import upgrade
from chewy_api.services.security import token_pair

BASE = '/api/v1/bbtalk/'


@pytest.fixture
def concurrent_app(app, tmp_path, password_hash):
    url = os.getenv('TEST_DATABASE_URL')
    if not url:
        yield app
        return
    config = Settings(database_url=url, data_dir=tmp_path, media_root=tmp_path/'media', secret_key='concurrency-tests-only', login_rate='', refresh_rate='')
    native = create_app(config)
    upgrade(native.state.engine)
    with native.state.sessions() as db:
        user = User(username='concurrent-' + uuid4().hex)
        db.add(user)
        db.flush()
        db.add(Identity(user_id=user.id, identifier=user.username, credential=password_hash))
        native.state.owner_id = user.id
        native.state.tokens = token_pair(db, user, config)
        db.commit()
    yield native
    # Only delete this test's random account, never drop a supplied database.
    from chewy_api.services.accounts import delete_user
    with native.state.sessions() as db:
        delete_user(db, db.get(User, native.state.owner_id))
        db.commit()
    native.state.engine.dispose()


def race(app, operation):
    barrier = Barrier(2)
    def invoke(index):
        with TestClient(app) as client:
            client.headers['Authorization'] = 'Bearer ' + app.state.tokens['access']
            barrier.wait(timeout=10)
            return operation(client, index)
    with ThreadPoolExecutor(2) as pool:
        return list(pool.map(invoke, range(2)))


def test_duplicate_submissions_are_durable(concurrent_app):
    app = concurrent_app
    payload = {'content': 'concurrent record', 'post_tags': 'once'}
    headers = {'Idempotency-Key': 'concurrent-create-key'}
    results = race(app, lambda client, _: client.post(BASE, json=payload, headers=headers))
    assert 201 in [r.status_code for r in results]
    assert all(r.status_code in {200, 201, 503} for r in results)
    with TestClient(app) as client:
        client.headers['Authorization'] = 'Bearer ' + app.state.tokens['access']
        retry = client.post(BASE, json=payload, headers=headers)
        assert retry.status_code == 200
        assert retry.headers['Idempotency-Replayed'] == 'true'
        assert client.post(BASE, json={'content': 'different'}, headers=headers).status_code == 409
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(BBTalk).where(BBTalk.user_id == app.state.owner_id)) == 1
        assert db.scalar(select(func.count()).select_from(SubmissionReceipt).where(SubmissionReceipt.user_id == app.state.owner_id)) == 1


def test_conditional_edits_have_one_winner(concurrent_app):
    app = concurrent_app
    with TestClient(app) as client:
        client.headers['Authorization'] = 'Bearer ' + app.state.tokens['access']
        row = client.post(BASE, json={'content': 'original'}).json()
    results = race(app, lambda client, index: client.patch(BASE + row['uid'] + '/', json={'content': f'edit-{index}'}, headers={'If-Match': row['update_time']}))
    statuses = sorted(r.status_code for r in results)
    assert statuses in ([200, 409], [200, 503])
    with TestClient(app) as client:
        client.headers['Authorization'] = 'Bearer ' + app.state.tokens['access']
        assert client.patch(BASE + row['uid'] + '/', json={'content': 'stale'}, headers={'If-Match': row['update_time']}).status_code == 409
        assert client.get(BASE + row['uid'] + '/').json()['content'] in {'edit-0', 'edit-1'}


def test_refresh_is_single_use(concurrent_app):
    app = concurrent_app
    payload = {'refresh': app.state.tokens['refresh']}
    results = race(app, lambda client, _: client.post(BASE + 'auth/token/refresh/', json=payload))
    assert sum(r.status_code == 200 for r in results) == 1
    assert all(r.status_code in {200, 401, 503} for r in results)
    with TestClient(app) as client:
        assert client.post(BASE + 'auth/token/refresh/', json=payload).status_code == 401
