"""Regressions observed in the real browser review, using isolated databases."""

from fastapi.testclient import TestClient
from sqlalchemy import inspect, text

from database.upgrade import upgrade

BASE = '/api/v1/bbtalk/'


def test_repair_stamped_database_without_sessions(app):
    with app.state.engine.begin() as connection:
        connection.execute(text('DROP TABLE cb_sessions'))
        connection.execute(text("UPDATE alembic_version SET version_num='0001_native_backend'"))
    upgrade(app.state.engine)
    upgrade(app.state.engine)
    assert inspect(app.state.engine).has_table('cb_sessions')
    with TestClient(app) as client:
        login = client.post(BASE + 'auth/login/', json={
            'username': 'owner', 'password': 'test-password-2026',
        })
        assert login.status_code == 200
        assert login.json()['id'] == app.state.owner_id
        assert client.get(BASE + 'user/me/').status_code == 200


def test_public_comments_are_read_only_and_private_comments_stay_private(client, app):
    public = client.post(BASE, json={'content': 'public', 'visibility': 'public'}).json()
    private = client.post(BASE, json={'content': 'private'}).json()
    for record in (public, private):
        assert client.post(BASE + record['uid'] + '/comments/', json={'content': 'first\nsecond'}).status_code == 201
    with TestClient(app) as anonymous:
        path = BASE + 'public/' + public['uid'] + '/comments/'
        response = anonymous.get(path)
        assert response.status_code == 200
        assert response.json()[0]['content'] == 'first\nsecond'
        assert anonymous.get(BASE + 'public/' + private['uid'] + '/comments/').status_code == 404
        assert anonymous.post(BASE + public['uid'] + '/comments/', json={'content': 'forbidden'}).status_code == 401
    client.patch(BASE + public['uid'] + '/', json={'visibility': 'private'})
    with TestClient(app) as anonymous:
        assert anonymous.get(path).status_code == 404


def test_filtered_counts_tags_and_pinning(client):
    one = client.post(BASE, json={'content': 'one', 'post_tags': 'alpha,beta', 'visibility': 'public'}).json()
    client.post(BASE, json={'content': 'two', 'post_tags': 'alpha'})
    filtered = client.get(BASE, params={'tags__name': 'alpha,beta'}).json()
    assert filtered['count'] == 1
    assert filtered['total_count'] == 2
    assert filtered['results'][0]['uid'] == one['uid']
    assert client.get(BASE, params={'visibility': 'private'}).json()['count'] == 1
    assert client.get(BASE, params={'search': 'missing'}).json()['total_count'] == 2
    assert client.patch(BASE + one['uid'] + '/', json={'is_pinned': True}).status_code == 200
    assert client.get(BASE).json()['results'][0]['uid'] == one['uid']


def test_tag_order_is_atomic_even_when_existing_orders_equal(client):
    tags = [client.post(BASE + 'tags/', json={'name': name, 'sort_order': 0}).json() for name in ('one', 'two', 'three')]
    order = [tags[2]['uid'], tags[0]['uid'], tags[1]['uid']]
    assert client.post(BASE + 'tags/reorder/', json={'uids': order}).status_code == 200
    response = client.get(BASE + 'tags/').json()
    rows = response['results'] if isinstance(response, dict) else response
    assert [tag['uid'] for tag in rows] == order
    assert client.post(BASE + 'tags/reorder/', json={'uids': order[:1]}).status_code == 409
    assert client.post(BASE + 'tags/reorder/', json={'uids': order + ['other-user-tag']}).status_code == 409


def test_bad_json_validation_gives_actionable_localized_message(client):
    response = client.post(BASE + 'data/validate/', files={'file': ('bad.json', b'{broken json', 'application/json')})
    assert response.status_code == 200
    assert response.json()['valid'] is False
    assert '第 1 行' in response.json()['error']
    assert 'Expecting' not in response.json()['error']
