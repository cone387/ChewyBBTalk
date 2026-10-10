"""Public HTTP contracts: failures must be explicit and schemas must match runtime."""

import pytest
from fastapi.testclient import TestClient

BASE = '/api/v1/bbtalk'


@pytest.mark.parametrize(
    'params,field',
    [
        ({'page': 0}, 'page'),
        ({'page': 'bad'}, 'page'),
        ({'page_size': 0}, 'page_size'),
        ({'page_size': 101}, 'page_size'),
        ({'has_attachments': 'perhaps'}, 'has_attachments'),
        ({'visibility': 'hidden'}, 'visibility'),
        ({'ordering': 'password'}, 'ordering'),
        ({'created_on': 'not-a-date'}, 'created_on'),
    ],
)
def test_invalid_queries_are_located(client, params, field):
    result = client.get(BASE, params=params, follow_redirects=False)
    assert result.status_code == 422, result.text
    assert any(item['loc'] == ['query', field] for item in result.json()['detail'])


def test_native_routes_arrays_and_legacy_aliases(client):
    created = client.post(
        BASE, json={'content': 'native', 'tags': ['work', 'home']}, follow_redirects=False
    )
    assert created.status_code == 201, created.text
    row = created.json()
    assert {tag['name'] for tag in row['tags']} == {'work', 'home'}
    client.post(BASE, json={'content': 'other', 'tags': ['work']})
    result = client.get(BASE, params=[('tags', 'work'), ('tags', 'home')])
    assert [item['uid'] for item in result.json()['results']] == [row['uid']]
    old = client.get(BASE + '/', params={'tags__name': 'work,home'})
    assert old.json()['results'] == result.json()['results']
    assert client.head(BASE).status_code == 200


@pytest.mark.parametrize(
    'path,payload',
    [
        ('/tags/reorder', {'items': [{'uid': 'tag', 'sort_order': True}]}),
        ('/tags/reorder', {'items': []}),
        ('/user/delete-account', {'password': {}}),
        ('/auth/desktop/authorize', {'redirect_uri': []}),
        ('/auth/desktop/exchange', {'code': [], 'code_verifier': {}}),
        ('/storage/migration/preview', {'target_config_id': {'id': 1}}),
    ],
)
def test_structured_bodies_reject_malformed_data(client, path, payload):
    result = client.post(BASE + path, json=payload)
    assert result.status_code == 422, result.text
    assert isinstance(result.json()['detail'], list)
    assert client.get(BASE).json()['count'] == 0


def test_openapi_has_query_headers_responses_and_correct_security(client, app):
    schema = client.get('/api/schema/').json()
    paths = schema['paths']
    assert BASE in paths and BASE + '/' not in paths
    params = {p['name']: p for p in paths[BASE]['get']['parameters']}
    assert params['page']['schema']['minimum'] == 1
    assert params['tags']['schema']['type'] == 'array'
    assert 'tags__name' not in params
    assert paths[BASE]['get']['responses']['200']['content']['application/json']['schema']['$ref']
    assert any(
        p['name'] == 'Idempotency-Key' and p['in'] == 'header'
        for p in paths[BASE]['post']['parameters']
    )
    assert paths[BASE + '/auth/token/blacklist']['post']['security']
    assert not paths[BASE + '/public']['get'].get('security')
    with TestClient(app) as anonymous:
        assert (
            anonymous.post(BASE + '/auth/token/blacklist', json={'refresh': 'x'}).status_code == 401
        )


def test_storage_resource_routes_and_validation(client):
    path = BASE + '/settings/storage'
    result = client.post(
        path, json={'name': 'native', 'storage_type': 'local'}, follow_redirects=False
    )
    assert result.status_code == 201
    assert client.patch(path + '/no-number', json={'name': 'x'}).status_code == 422
    assert client.delete(path + '/' + str(result.json()['id'])).status_code == 204


def test_invalid_export_and_attachment_pagination(client):
    assert client.get(BASE + '/data/export', params={'format': 'xml'}).status_code == 422
    assert client.get('/api/v1/attachments/files', params={'page_size': 'bad'}).status_code == 422


@pytest.mark.parametrize('tags', [[], ['work', 'home']])
def test_pending_legacy_submission_can_be_retried_after_client_upgrade(client, tags):
    old = {'content': 'saved before upgrade', 'context': {}}
    if tags:
        old['post_tags'] = ','.join(tags)
    headers = {'Idempotency-Key': 'client-upgrade-001'}
    first = client.post(BASE + '/', json=old, headers=headers)
    assert first.status_code == 201
    new = {'content': old['content'], 'context': {}, 'tags': tags}
    retry = client.post(BASE, json=new, headers=headers)
    assert retry.status_code == 200, retry.text
    assert retry.json()['uid'] == first.json()['uid']
    assert (
        client.post(BASE, json={**new, 'content': 'different'}, headers=headers).status_code == 409
    )


def test_patch_preserves_omitted_values_and_put_replaces_them(client):
    row = client.post(
        BASE, json={'content': 'original', 'tags': ['keep'], 'visibility': 'public'}
    ).json()
    path = BASE + '/' + row['uid']
    assert client.put(path, json={}).status_code == 422
    partial = client.patch(path, json={'content': 'patch'}).json()
    assert partial['visibility'] == 'public' and partial['tags'][0]['name'] == 'keep'
    full = client.put(path, json={'content': 'replace'}).json()
    assert full['visibility'] == 'private' and full['tags'] == []
    assert (
        client.patch(path, json={'content': 'x'}, headers={'If-Match': 'not-a-date'}).status_code
        == 422
    )


def test_non_json_body_and_conflicting_aliases_are_validation_errors(client):
    assert (
        client.post(BASE, content='not json', headers={'Content-Type': 'text/plain'}).status_code
        == 422
    )
    assert (
        client.get(
            BASE, params={'created_on': '2026-01-01', 'create_time__date': '2026-01-02'}
        ).status_code
        == 422
    )
    assert (
        client.post(BASE, json={'content': 'x', 'tags': ['new'], 'post_tags': 'old'}).status_code
        == 422
    )


@pytest.mark.parametrize(
    'params',
    [
        {'format': 'json', 'export_format': 'zip'},
        {'format': 'zip', 'export_format': 'json'},
        {'format': 'json', 'export_format': 'json'},
    ],
)
def test_export_rejects_both_parameter_names_even_with_explicit_defaults(client, params):
    result = client.get(BASE + '/data/export', params=params)
    assert result.status_code == 422
    assert result.json()['detail'][0]['loc'] == ['query', 'format']


def test_imported_legacy_context_remains_readable(client):
    import json

    data = {
        'version': '1.0',
        'bbtalks': [{'uid': 'legacy-context', 'content': 'from old export', 'context': ['source']}],
    }
    result = client.post(
        BASE + '/data/import',
        files={'file': ('old.json', json.dumps(data).encode(), 'application/json')},
    )
    assert result.status_code == 200 and result.json()['stats']['bbtalks_created'] == 1
    assert client.get(BASE).json()['results'][0]['context'] == ['source']


def test_binary_response_documentation(client):
    paths = client.get('/api/schema/').json()['paths']
    for suffix in ('preview', 'content'):
        responses = paths[f'/api/v1/attachments/files/{{pk}}/{suffix}']['get']['responses']
        assert 'application/octet-stream' in responses['200']['content']
        assert '302' in responses and '206' in responses


def test_legacy_put_preserves_unspecified_fields(client):
    row = client.post(
        BASE, json={'content': 'before', 'tags': ['keep'], 'visibility': 'public'}
    ).json()
    legacy = client.put(BASE + '/' + row['uid'] + '/', json={'content': 'after'})
    assert legacy.status_code == 200
    assert legacy.json()['visibility'] == 'public' and legacy.json()['tags'][0]['name'] == 'keep'
    tag = row['tags'][0]
    edited = client.put(BASE + '/tags/' + tag['uid'] + '/', json={'color': '#123456'})
    assert edited.status_code == 200 and edited.json()['name'] == 'keep'


def test_aliases_preserve_head_permissions_and_app_factory_metadata(app, client):
    from api.routes import records
    from application import create_app

    original_routes = list(records.router.routes)
    second = create_app(app.state.settings)
    try:
        assert records.router.routes == original_routes
        assert second.openapi() == app.openapi()
        with TestClient(second) as anonymous:
            for path in (BASE, BASE + '/'):
                assert anonymous.head(path).status_code == 401
                assert anonymous.get(path).status_code == 401
        assert client.head(BASE + '?page=0').status_code == 422
        assert client.head(BASE + '/?page=0').status_code == 422
    finally:
        second.state.engine.dispose()


def test_native_date_filters_keep_timezone_and_pagination_links(app, client):
    from datetime import UTC, datetime

    from sqlalchemy import select

    from models import BBTalk

    first = client.post(BASE, json={'content': 'boundary', 'tags': ['one', 'two']}).json()
    with app.state.sessions() as db:
        record = db.scalar(select(BBTalk).where(BBTalk.uid == first['uid']))
        record.create_time = datetime(2024, 12, 31, 20, tzinfo=UTC)
        db.commit()
    assert client.get(BASE, params={'created_on': '2025-01-01'}).json()['count'] == 1
    assert client.get(BASE, params={'created_date_to': '2024-12-31'}).json()['count'] == 0
    client.post(BASE, json={'content': 'next', 'tags': ['one', 'two']})
    result = client.get(BASE, params=[('tags', 'one'), ('tags', 'two'), ('page_size', '1')]).json()
    assert len(result['results']) == 1 and result['count'] == 2
    following = client.get(result['next']).json()
    assert len(following['results']) == 1 and following['count'] == 2
    assert following['results'][0]['uid'] != result['results'][0]['uid']
