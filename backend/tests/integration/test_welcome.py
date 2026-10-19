import json
from concurrent.futures import ThreadPoolExecutor
from itertools import pairwise
from threading import Barrier, local

import pytest
from fastapi.testclient import TestClient

from backups.transfer import DataExporter, import_data, read_import
from models import User

BASE = '/api/v1/bbtalk/settings/welcome'


def quote(index):
    return {'id': f'q{index}', 'text': f'给未来的自己 {index}', 'source': '我的记录'}


def save(client, quotes, enabled=True, revision=0):
    return client.patch(BASE, json={'enabled': enabled, 'quotes': quotes, 'revision': revision})


def test_welcome_is_private_and_account_scoped(client):
    assert client.get(BASE).json() == {'enabled': False, 'quotes': [], 'revision': 0}
    assert save(client, [quote(1)]).status_code == 200
    response = client.get(BASE)
    assert response.headers['cache-control'] == 'no-store'
    assert response.json()['quotes'] == [quote(1)]
    other = client.post(
        '/api/v1/bbtalk/auth/register',
        json={
            'username': 'welcome-other',
            'password': 'another-password-2026',
        },
    ).json()
    headers = {'Authorization': 'Bearer ' + other['access']}
    assert client.get(BASE, headers=headers).json()['quotes'] == []
    assert client.post(BASE + '/next', headers=headers).json() == {'quote': None}
    client.headers.pop('Authorization')
    assert client.get(BASE).status_code == 401
    assert client.post(BASE + '/next').status_code == 401


def test_welcome_rotation_persists_and_avoids_cycle_boundary_repeat(client):
    assert save(client, [quote(i) for i in range(4)]).status_code == 200
    picks = [client.post(BASE + '/next').json()['quote']['id'] for _ in range(12)]
    for start in (0, 4, 8):
        assert set(picks[start : start + 4]) == {'q0', 'q1', 'q2', 'q3'}
    assert all(a != b for a, b in pairwise(picks))
    assert client.get(BASE).json()['revision'] == 1


def test_welcome_single_disabled_empty_and_pool_changes(client):
    assert save(client, [quote(1)]).status_code == 200
    assert client.post(BASE + '/next').json()['quote'] == quote(1)
    assert client.post(BASE + '/next').json()['quote'] == quote(1)
    assert save(client, [quote(2), quote(3)], revision=1).status_code == 200
    assert {client.post(BASE + '/next').json()['quote']['id'] for _ in range(2)} == {'q2', 'q3'}
    assert save(client, [quote(2)], enabled=False, revision=2).status_code == 200
    assert client.post(BASE + '/next').json() == {'quote': None}
    assert save(client, [], revision=3).status_code == 200
    assert client.post(BASE + '/next').json() == {'quote': None}


def test_welcome_stale_save_cannot_overwrite(client):
    assert save(client, [quote(1)]).status_code == 200
    assert save(client, [quote(2)]).status_code == 409
    assert client.get(BASE).json()['quotes'] == [quote(1)]


@pytest.mark.parametrize(
    'quotes',
    [
        [{'id': 'x', 'text': '   ', 'source': ''}],
        [{'id': 'x', 'text': 'x' * 1001, 'source': ''}],
        [{'id': 'x', 'text': 'ok', 'source': 'x' * 201}],
        [quote(1), quote(1)],
        [quote(1), {**quote(1), 'id': 'different'}],
        [quote(i) for i in range(201)],
    ],
)
def test_welcome_rejects_invalid_pool(client, quotes):
    assert save(client, quotes).status_code == 422
    assert client.get(BASE).json()['revision'] == 0


def test_welcome_forbids_target_user(client):
    assert (
        client.patch(
            BASE,
            json={
                'user_id': 2,
                'enabled': True,
                'quotes': [],
                'revision': 0,
            },
        ).status_code
        == 422
    )


def test_welcome_selection_does_not_edit_user_profile(app, client):
    with app.state.sessions() as db:
        before = db.get(User, app.state.owner_id).update_time
    save(client, [quote(1)])
    client.post(BASE + '/next')
    with app.state.sessions() as db:
        assert db.get(User, app.state.owner_id).update_time == before


def test_concurrent_welcome_reads_advance_separate_quotes(app, client, monkeypatch):
    from api import dependencies

    authenticate = dependencies.authenticate_credentials
    barrier, state = Barrier(4), local()
    assert save(client, [quote(i) for i in range(4)]).status_code == 200

    def simultaneous_auth(*args, **kwargs):
        user = authenticate(*args, **kwargs)
        if not getattr(state, 'waited', False):
            state.waited = True
            barrier.wait(timeout=10)
        return user

    monkeypatch.setattr(dependencies, 'authenticate_credentials', simultaneous_auth)

    def pick(_):
        with TestClient(app, raise_server_exceptions=False) as other:
            return other.post(
                BASE + '/next',
                headers={
                    'Authorization': 'Bearer ' + app.state.tokens['access'],
                },
            )

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(pick, range(4)))
    assert [result.status_code for result in results] == [200] * 4
    assert len({result.json()['quote']['id'] for result in results}) == 4


def test_welcome_backup_restores_to_new_account_without_overwriting(app, client):
    assert save(client, [quote(1)]).status_code == 200
    with app.state.sessions() as db:
        owner = db.get(User, app.state.owner_id)
        data = DataExporter(owner, db, app.state.settings).export_all()
        assert data['welcome'] == {'enabled': True, 'quotes': [quote(1)]}
        target = User(username='welcome-import')
        db.add(target)
        db.commit()
        import_data(db, app.state.settings, target, data)
        assert (
            DataExporter(target, db, app.state.settings).export_all()['welcome'] == data['welcome']
        )
        data['welcome']['quotes'] = [quote(2)]
        import_data(db, app.state.settings, target, data)
        assert DataExporter(target, db, app.state.settings).export_all()['welcome']['quotes'] == [
            quote(1)
        ]


def test_backup_validation_rejects_invalid_welcome_before_import():
    with pytest.raises(ValueError):
        read_import(
            json.dumps(
                {
                    'version': '1.0',
                    'welcome': {
                        'enabled': True,
                        'quotes': [
                            {'id': 'q1', 'text': '  ', 'source': ''},
                        ],
                    },
                }
            ).encode(),
            10000,
        )
