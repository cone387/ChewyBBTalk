"""The current API exposes one explicit contract without protocol aliases."""

import pytest

BASE = '/api/v1/bbtalk'


@pytest.mark.parametrize('suffix', ['/', '.json', '.json/'])
def test_removed_url_aliases_are_not_redirected(client, suffix):
    response = client.get(BASE + suffix, follow_redirects=False)
    assert response.status_code == 404


@pytest.mark.parametrize(
    'params',
    [
        {'tags__name': 'private'},
        {'create_time__gte': '2026-01-01'},
        {'create_date__lte': '2026-01-01'},
        {'create_time__date': '2026-01-01'},
    ],
)
def test_removed_filters_are_rejected_not_ignored(client, params):
    assert client.get(BASE, params=params).status_code == 422


def test_removed_tag_body_is_rejected(client):
    assert client.post(BASE, json={'content': 'record', 'post_tags': 'old'}).status_code == 422


def test_pages_are_explicit_and_empty_past_end(client):
    row = client.post(BASE, json={'content': 'record'}).json()
    page = client.get(BASE).json()
    assert set(page) == {'items', 'total', 'page', 'page_size', 'has_more', 'total_count'}
    assert page['total'] == 1 and page['items'][0]['uid'] == row['uid']
    assert page['page'] == 1 and page['has_more'] is False
    empty = client.get(BASE, params={'page': 2}).json()
    assert empty['items'] == [] and empty['total'] == 1 and empty['page'] == 2


def test_comments_always_paginate(client):
    row = client.post(BASE, json={'content': 'record'}).json()
    url = BASE + '/' + row['uid'] + '/comments'
    client.post(url, json={'content': 'comment'})
    response = client.get(url).json()
    assert response['total'] == 1 and len(response['items']) == 1
    assert response['page'] == 1 and 'revision' in response


def test_schema_uses_native_documentation_paths(client):
    assert client.get('/openapi.json').status_code == 200
    assert client.get('/api/schema/', follow_redirects=False).status_code == 404
