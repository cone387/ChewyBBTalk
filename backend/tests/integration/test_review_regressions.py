"""Regressions observed in the real browser review, using isolated databases."""

import base64
import hashlib

from fastapi.testclient import TestClient
from sqlalchemy import inspect, text

from database.upgrade import upgrade

BASE = '/api/v1/bbtalk/'


def test_repair_stamped_database_without_sessions(tmp_path):
    from application import create_app
    from core.config import Settings
    from database.migrations.schema_v1 import Base, Identity, User

    # This database predates native credentials and must contain the historical encoding.
    digest = hashlib.pbkdf2_hmac('sha256', b'test-password-2026', b'repair-test', 1000)
    password_hash = 'pbkdf2_sha256$1000$repair-test$' + base64.b64encode(digest).decode()
    app = create_app(
        Settings(
            database_url='sqlite:///' + (tmp_path / 'baseline.db').as_posix(),
            data_dir=tmp_path,
            secret_key='test-only',
        )
    )
    try:
        with app.state.engine.begin() as connection:
            Base.metadata.create_all(connection)
            connection.execute(text('DROP TABLE cb_sessions'))
            connection.execute(
                text('CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY)')
            )
            connection.execute(text("INSERT INTO alembic_version VALUES ('0001_native_backend')"))
        with app.state.sessions() as session:
            user = User(username='owner')
            session.add(user)
            session.flush()
            owner_id = user.id
            session.add(Identity(user_id=owner_id, identifier='owner', credential=password_hash))
            session.commit()
        upgrade(app.state.engine)
        upgrade(app.state.engine)
        assert inspect(app.state.engine).has_table('cb_sessions')
        with TestClient(app) as client:
            login = client.post(
                BASE + 'auth/login',
                json={
                    'username': 'owner',
                    'password': 'test-password-2026',
                },
            )
            assert login.status_code == 200
            assert login.json()['id'] == owner_id
            assert client.get(BASE + 'user/me').status_code == 200
    finally:
        app.state.engine.dispose()


def test_public_comments_are_read_only_and_private_comments_stay_private(client, app):
    public = client.post((BASE).rstrip('/'), json={'content': 'public', 'visibility': 'public'}).json()
    private = client.post((BASE).rstrip('/'), json={'content': 'private'}).json()
    for record in (public, private):
        assert (
            client.post(
                BASE + record['uid'] + '/comments', json={'content': 'first\nsecond'}
            ).status_code
            == 201
        )
    with TestClient(app) as anonymous:
        path = BASE + 'public/' + public['uid'] + '/comments/'
        response = anonymous.get((path).rstrip('/'))
        assert response.status_code == 200
        assert response.json()['items'][0]['content'] == 'first\nsecond'
        assert anonymous.get(BASE + 'public/' + private['uid'] + '/comments').status_code == 404
        assert (
            anonymous.post(
                BASE + public['uid'] + '/comments', json={'content': 'forbidden'}
            ).status_code
            == 401
        )
    client.patch(BASE + public['uid'], json={'visibility': 'private'})
    with TestClient(app) as anonymous:
        assert anonymous.get((path).rstrip('/')).status_code == 404


def test_filtered_counts_tags_and_pinning(client):
    one = client.post(
        (BASE).rstrip('/'), json={'content': 'one', 'tags': ['alpha', 'beta'], 'visibility': 'public'}
    ).json()
    client.post((BASE).rstrip('/'), json={'content': 'two', 'tags': ['alpha']})
    filtered = client.get(BASE.rstrip('/'), params=[('tags', 'alpha'), ('tags', 'beta')]).json()
    assert filtered['total'] == 1
    assert filtered['total_count'] == 2
    assert filtered['items'][0]['uid'] == one['uid']
    assert client.get((BASE).rstrip('/'), params={'visibility': 'private'}).json()['total'] == 1
    assert client.get((BASE).rstrip('/'), params={'search': 'missing'}).json()['total_count'] == 2
    assert client.patch(BASE + one['uid'], json={'is_pinned': True}).status_code == 200
    assert client.get((BASE).rstrip('/')).json()['items'][0]['uid'] == one['uid']


def test_tag_order_is_atomic_even_when_existing_orders_equal(client):
    tags = [
        client.post(BASE + 'tags', json={'name': name, 'sort_order': 0}).json()
        for name in ('one', 'two', 'three')
    ]
    order = [tags[2]['uid'], tags[0]['uid'], tags[1]['uid']]
    assert client.post(BASE + 'tags/reorder', json={'uids': order}).status_code == 200
    response = client.get(BASE + 'tags').json()
    assert [tag['uid'] for tag in response] == order
    assert client.post(BASE + 'tags/reorder', json={'uids': order[:1]}).status_code == 409
    assert (
        client.post(BASE + 'tags/reorder', json={'uids': order + ['other-user-tag']}).status_code
        == 409
    )


def test_bad_json_validation_gives_actionable_localized_message(client):
    response = client.post(
        BASE + 'data/validate', files={'file': ('bad.json', b'{broken json', 'application/json')}
    )
    assert response.status_code == 200
    assert response.json()['valid'] is False
    assert '第 1 行' in response.json()['error']
    assert 'Expecting' not in response.json()['error']
