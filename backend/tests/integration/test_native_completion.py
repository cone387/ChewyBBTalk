"""Regression coverage for the remaining native HTTP contract gaps."""

import json
import logging

import pytest
from fastapi.testclient import TestClient
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, OperationalError

from api.dependencies import jwt_auth, session_auth
from models import BBTalk, Comment, Tag

BASE = '/api/v1/bbtalk'


@pytest.mark.parametrize('scheme', ['http', 'https'])
def test_admin_proxy_preserves_port_and_external_scheme(app, scheme):
    headers = {'Host': '127.0.0.1:4010', 'Origin': f'{scheme}://127.0.0.1:4010'}
    if scheme == 'https':
        headers['X-Forwarded-Proto'] = 'https'
    with TestClient(app, headers=headers, follow_redirects=False) as browser:
        redirect = browser.get('/admin/')
        assert redirect.status_code in (302, 307)
        assert redirect.headers['Location'] == f'{scheme}://127.0.0.1:4010/admin/login'
        denied = browser.post(
            '/admin/login', data={'username': 'owner', 'password': 'incorrect-password'}
        )
        # A matching proxy authority passes CSRF and reaches credential checking.
        assert denied.status_code == 400
        foreign = browser.post(
            '/admin/login',
            data={'username': 'owner', 'password': 'incorrect-password'},
            headers={'Origin': f'{scheme}://127.0.0.1:4011'},
        )
        assert foreign.status_code == 403


def import_payload(client, data):
    return client.post(
        BASE + '/data/import',
        files={
            'file': ('records.json', json.dumps({'version': '1.0', **data}), 'application/json')
        },
    )


@pytest.mark.parametrize('length', [23, 64])
def test_imported_long_tag_uid_can_use_both_reorder_formats(client, length):
    uid = 't' * length
    result = import_payload(client, {'tags': [{'uid': uid, 'name': 'imported'}]})
    assert result.json()['stats']['tags_created'] == 1
    assert client.get((BASE + '/tags/' + uid).rstrip('/')).status_code == 200
    for payload in ({'items': [{'uid': uid, 'sort_order': 5}]}, {'uids': [uid]}):
        assert client.post(BASE + '/tags/reorder', json=payload).status_code == 200


@pytest.mark.parametrize('uid', ['', None, 7, 'x' * 65])
def test_invalid_uids_never_enter_imported_resources(client, app, uid):
    result = import_payload(
        client,
        {
            'tags': [{'uid': uid, 'name': 'invalid'}],
            'bbtalks': [{'uid': uid, 'content': 'invalid'}, {'uid': 'valid', 'content': 'valid'}],
            'comments': [{'uid': uid, 'bbtalk_uid': 'valid', 'content': 'invalid'}],
        },
    )
    stats = result.json()['stats']
    assert stats['tags_created'] == stats['comments_created'] == 0
    assert stats['bbtalks_created'] == 1
    assert len(stats['errors']) == 3
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(Tag)) == 0
        assert db.scalar(select(func.count()).select_from(Comment)) == 0
        assert db.scalar(select(BBTalk.uid)) == 'valid'
    for field in ('uids', 'items'):
        payload = {field: [uid] if field == 'uids' else [{'uid': uid, 'sort_order': 0}]}
        assert client.post(BASE + '/tags/reorder', json=payload).status_code == 422


def test_all_tags_are_available_for_complete_reorder(client, app):
    with app.state.sessions() as db:
        db.add_all(Tag(user_id=app.state.owner_id, name=f'tag-{index}') for index in range(2001))
        db.commit()
    tags = client.get(BASE + '/tags').json()
    assert len(tags) == 2001
    assert client.get(BASE + '/tags').json() == tags
    result = client.post(BASE + '/tags/reorder', json={'uids': [tag['uid'] for tag in tags]})
    assert result.status_code == 200


def test_authentication_consumes_injected_credentials(client, app):
    client.headers.pop('authorization')
    app.dependency_overrides[jwt_auth] = lambda: HTTPAuthorizationCredentials(
        scheme='Bearer', credentials=app.state.tokens['access']
    )
    try:
        assert client.get(BASE + '/user/me').status_code == 200
    finally:
        app.dependency_overrides.clear()
    login = client.post(
        BASE + '/auth/login', json={'username': 'owner', 'password': 'test-password-2026'}
    )
    assert login.status_code == 200
    session_key = client.cookies['cb_session']
    csrf = client.cookies['cb_csrf']
    client.cookies.clear()
    app.dependency_overrides[session_auth] = lambda: session_key
    try:
        assert client.get(BASE + '/user/me').status_code == 200
        assert client.post((BASE).rstrip('/'), json={'content': 'missing csrf'}).status_code == 403
        assert (
            client.post(
                (BASE).rstrip('/'), json={'content': 'injected cookie'}, headers={'X-CSRF-Token': csrf}
            ).status_code
            == 201
        )
    finally:
        app.dependency_overrides.clear()


def test_empty_explicit_bearer_does_not_fall_back_to_cookie(client):
    client.headers.pop('authorization')
    assert (
        client.post(
            BASE + '/auth/login', json={'username': 'owner', 'password': 'test-password-2026'}
        ).status_code
        == 200
    )
    response = client.get(BASE + '/user/me', headers={'Authorization': 'Bearer'})
    assert response.status_code == 401
    assert response.json()['code'] == 'token_not_valid'


def test_openapi_describes_dynamic_success_errors_and_csrf(client):
    paths = client.get('/openapi.json').json()['paths']
    for path in (BASE, BASE + '/tags'):
        assert {'200', '201', '401', '403', '409', '503'} <= paths[path]['post']['responses'].keys()
    headers = {param['name']: param for param in paths[BASE]['post']['parameters']}
    assert 'Cookie' in headers['X-CSRF-Token']['description']
    assert headers['X-CSRF-Token']['required'] is False


@pytest.mark.parametrize(
    'error_class,status,code',
    [
        (IntegrityError, 400, 'database_conflict'),
        (OperationalError, 503, 'database_unavailable'),
    ],
)
def test_database_failures_are_classified_and_safely_logged(
    client, app, caplog, error_class, status, code
):
    secret = 'password-and-token-must-never-be-logged'

    @app.get('/audit-database-failure')
    def failing_operation():
        raise error_class(
            'SELECT secret FROM private_table', {'password': secret}, RuntimeError(secret)
        )

    with caplog.at_level(logging.WARNING):
        response = client.get('/audit-database-failure')
    assert response.status_code == status
    assert response.json()['code'] == code
    assert 'database' in caplog.text.lower()
    assert secret not in caplog.text + response.text
    assert 'private_table' not in caplog.text + response.text
    assert all(record.exc_info is None for record in caplog.records)
    if status == 503:
        assert response.headers['Retry-After'] == '1'


def test_uncertain_record_submission_keeps_client_retry_contract(client, monkeypatch, caplog):
    secret = 'private-submission-content'

    def unavailable(*args):
        raise OperationalError('INSERT secret', {'content': secret}, RuntimeError(secret))

    monkeypatch.setattr('api.routes.records.validate_attachments', unavailable)
    with caplog.at_level(logging.WARNING):
        response = client.post(
            (BASE).rstrip('/'), json={'content': secret}, headers={'Idempotency-Key': 'retry-original-key'}
        )
    assert response.status_code == 503
    assert response.json()['code'] == 'submission_retry'
    assert response.headers['Retry-After'] == '1'
    assert 'database' in caplog.text.lower()
    assert secret not in caplog.text + response.text


@pytest.mark.parametrize('write', [False, True])
def test_mysql_check_violation_is_not_retryable_outage(client, app, monkeypatch, caplog, write):
    from pymysql.err import OperationalError as MySQLOperationalError

    secret = 'constraint-message-with-private-content'

    def violated_check(*args):
        raise OperationalError(
            'INSERT private', {'content': secret}, MySQLOperationalError(3819, secret)
        )

    if write:
        monkeypatch.setattr('api.routes.records.validate_attachments', violated_check)
    else:
        app.get('/audit-mysql-check')(lambda: violated_check())
    with caplog.at_level(logging.WARNING):
        result = (
            client.post((BASE).rstrip('/'), json={'content': 'invalid'})
            if write
            else client.get('/audit-mysql-check')
        )
    assert result.status_code == 400
    assert result.json()['code'] == 'database_conflict'
    assert 'Retry-After' not in result.headers
    assert secret not in caplog.text + result.text


def test_competing_submission_unique_constraint_replays_committed_winner(client, app, monkeypatch):
    from sqlalchemy.orm import Session

    from models import SubmissionReceipt

    payload = {'content': 'one durable submission'}
    headers = {'Idempotency-Key': 'competing-submit-001'}
    original_scalar = Session.scalar
    winner = []
    waiting = True

    def after_receipt_lookup(db, statement, *args, **kwargs):
        nonlocal waiting
        result = original_scalar(db, statement, *args, **kwargs)
        entities = [item.get('entity') for item in getattr(statement, 'column_descriptions', [])]
        if waiting and SubmissionReceipt in entities and result is None:
            waiting = False
            # Release SQLite's read snapshot, then deterministically schedule the
            # competing HTTP request between this lookup and its INSERT. The
            # database itself raises the duplicate-key error on the losing write.
            db.rollback()
            winner.append(client.post((BASE).rstrip('/'), json=payload, headers=headers))
        return result

    monkeypatch.setattr(Session, 'scalar', after_receipt_lookup)
    loser = client.post((BASE).rstrip('/'), json=payload, headers=headers)
    assert winner[0].status_code == 201
    assert loser.status_code == 200
    assert loser.headers['Idempotency-Replayed'] == 'true'
    assert loser.json()['uid'] == winner[0].json()['uid']
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(BBTalk)) == 1
        assert db.scalar(select(func.count()).select_from(SubmissionReceipt)) == 1


@pytest.mark.parametrize('key', [None, 'failed-submission-001'])
def test_failed_submission_without_winning_receipt_rolls_back(client, app, monkeypatch, key):
    from models import SubmissionReceipt, User

    def duplicate_user(db, user, attachments):
        db.add(User(username=user.username))
        db.flush()  # Actual database uniqueness failure, not a mocked exception.

    monkeypatch.setattr('api.routes.records.validate_attachments', duplicate_user)
    result = client.post(
        (BASE).rstrip('/'),
        json={'content': 'must not persist'},
        headers={'Idempotency-Key': key} if key else {},
    )
    assert result.status_code == 400
    assert result.json()['code'] == 'database_conflict'
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(BBTalk)) == 0
        assert db.scalar(select(func.count()).select_from(SubmissionReceipt)) == 0
        assert db.scalar(select(func.count()).select_from(User)) == 1


def test_conditional_edit_race_returns_winner_and_never_overwrites_it(client, app, monkeypatch):
    from datetime import datetime, timedelta

    from sqlalchemy import update
    from sqlalchemy.orm import Session

    row = client.post((BASE).rstrip('/'), json={'content': 'before'}).json()
    winner_time = datetime.fromisoformat(row['update_time'].replace('Z', '+00:00')) + timedelta(
        seconds=1
    )
    original_execute = Session.execute
    waiting = True

    def after_version_check(db, statement, *args, **kwargs):
        nonlocal waiting
        if (
            waiting
            and getattr(statement, 'is_update', False)
            and statement.table.name == 'cb_bbtalks'
        ):
            waiting = False
            # Model a competing transaction committed after the in-memory
            # revision check, before the conditional UPDATE reaches the database.
            db.rollback()
            with app.state.sessions() as competitor:
                competitor.execute(
                    update(BBTalk)
                    .where(BBTalk.uid == row['uid'])
                    .values(content='winning edit', update_time=winner_time)
                )
                competitor.commit()
        return original_execute(db, statement, *args, **kwargs)

    monkeypatch.setattr(Session, 'execute', after_version_check)
    loser = client.patch(
        (BASE + '/' + row['uid']).rstrip('/'),
        json={'content': 'losing edit'},
        headers={'If-Match': row['update_time']},
    )
    assert loser.status_code == 409
    assert loser.json()['code'] == 'edit_conflict'
    assert loser.json()['current']['content'] == 'winning edit'
    assert client.get((BASE + '/' + row['uid']).rstrip('/')).json()['content'] == 'winning edit'


def test_canonical_tag_put_replaces_optional_fields(client):
    tag = client.post(
        BASE + '/tags', json={'name': 'before', 'color': '#123456', 'sort_order': 42}
    ).json()
    replaced = client.put((BASE + '/tags/' + tag['uid']).rstrip('/'), json={'name': 'after'})
    assert replaced.status_code == 200
    assert replaced.json()['name'] == 'after'
    assert replaced.json()['color'] == ''
    assert replaced.json()['sort_order'] == 0
