from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import event, select

from models import BBTalk, Comment, User

BASE = '/api/v1/bbtalk'
STAMP = datetime(2026, 1, 1, tzinfo=UTC)


def seed(app, record_count=1, comment_count=5, public=True):
    with app.state.sessions() as db:
        author = User(username='comment-author', display_name='Comment Author', avatar='/avatar')
        db.add(author)
        db.flush()
        records = []
        for index in range(record_count):
            record = BBTalk(
                user_id=app.state.owner_id,
                content=f'record {index}',
                visibility='public' if public else 'private',
            )
            db.add(record)
            db.flush()
            records.append(record.uid)
            for comment_index in range(comment_count):
                # Reverse chronological insertion, with ties, catches missing sort/tie-breaker.
                db.add(
                    Comment(
                        user_id=author.id,
                        bbtalk_id=record.id,
                        content=f'comment {comment_index}',
                        create_time=STAMP + timedelta(seconds=(comment_count - comment_index) // 2),
                        update_time=STAMP,
                    )
                )
        db.commit()
    return records


def test_hundred_record_previews_have_constant_sql_and_bounded_bodies(app, client):
    seed(app, record_count=100)
    queries = []
    bodies = []

    def collect(_connection, _cursor, statement, _parameters, _context, _many):
        queries.append(statement)

    def loaded(_session, instance):
        if isinstance(instance, Comment):
            bodies.append(instance)

    event.listen(app.state.engine, 'before_cursor_execute', collect)
    event.listen(app.state.sessions.class_, 'loaded_as_persistent', loaded)
    try:
        small = client.get(BASE, params={'page_size': 1})
        small_count = len(queries)
        queries.clear()
        bodies.clear()
        response = client.get(BASE)
        assert response.status_code == 200
        rows = response.json()['results']
        assert len(rows) == 100
        assert len(bodies) == 300
        assert len(queries) == small_count <= 7
        assert small.status_code == 200
        for row in rows:
            assert row['comment_count'] == 5
            assert [item['content'] for item in row['comment_preview']] == [
                'comment 4',
                'comment 2',
                'comment 3',
            ]
            assert all(
                item['user_display_name'] == 'Comment Author' for item in row['comment_preview']
            )
            assert isinstance(row['comments_revision'], str) and row['comments_revision']
    finally:
        event.remove(app.state.engine, 'before_cursor_execute', collect)
        event.remove(app.state.sessions.class_, 'loaded_as_persistent', loaded)


@pytest.mark.parametrize('prefix', ['', '/public'])
def test_comment_pagination_order_links_legacy_array_and_head(app, client, prefix):
    uid = seed(app, comment_count=25)[0]
    if prefix:
        client.headers.pop('Authorization')
    path = f'{BASE}{prefix}/{uid}/comments'
    legacy = client.get(path)
    assert legacy.status_code == 200 and isinstance(legacy.json(), list)
    assert len(legacy.json()) == 25
    first = client.get(path, params={'page': 1})
    assert first.status_code == 200
    page = first.json()
    assert isinstance(page, dict)
    assert page['count'] == 25 and page['previous'] is None
    assert len(page['results']) == 20
    assert page['results'][:3] == client.get(f'{BASE}{prefix}/{uid}').json()['comment_preview']
    assert page['revision'] == client.get(f'{BASE}{prefix}/{uid}').json()['comments_revision']
    second = client.get(page['next']).json()
    assert len(second['results']) == 5 and second['next'] is None
    assert second['previous'] and second['revision'] == page['revision']
    assert page['results'] + second['results'] == legacy.json()
    assert [item['content'] for item in page['results'][:3]] == [
        'comment 24',
        'comment 22',
        'comment 23',
    ]
    assert client.head(path, params={'page': 1}).status_code == 200
    assert client.get(path, params={'page': 3}).status_code == 404
    for params in (
        {'page': 0},
        {'page': 'bad'},
        {'page': 1, 'page_size': 101},
        {'page': 1, 'page_size': 0},
    ):
        assert client.get(path, params=params).status_code == 422


def test_preview_and_paginated_comments_keep_visibility_and_ownership(app, client):
    private_uid = seed(app, public=False)[0]
    with app.state.sessions() as db:
        stranger = db.scalar(select(User).where(User.username == 'comment-author'))
        other = BBTalk(user_id=stranger.id, content='other private')
        db.add(other)
        db.commit()
        other_uid = other.uid
    for suffix in ('', '/comments', '/comments?page=1'):
        assert client.get(f'{BASE}/public/{private_uid}{suffix}').status_code == 404
        assert client.get(f'{BASE}/{other_uid}{suffix}').status_code == 404
    client.headers.pop('Authorization')
    assert client.get(f'{BASE}/{private_uid}/comments?page=1').status_code == 401
    assert client.get(f'{BASE}/public').json()['results'] == []


def test_revision_tracks_insert_delete_and_reused_sqlite_id(app, client):
    record = client.post(BASE, json={'content': 'revision'}).json()
    path = f'{BASE}/{record["uid"]}'
    empty_revision = record['comments_revision']
    assert record['comment_preview'] == [] and record['comment_count'] == 0
    empty_page = client.get(path + '/comments?page=1').json()
    assert empty_page == {
        'count': 0,
        'next': None,
        'previous': None,
        'results': [],
        'revision': empty_revision,
    }
    first = client.post(path + '/comments', json={'content': 'first'}).json()
    first_record = client.get(path).json()
    assert first_record['comments_revision'] != empty_revision
    with app.state.sessions() as db:
        first_row = db.scalar(select(Comment).where(Comment.uid == first['uid']))
        original_id, original_created, original_updated = (
            first_row.id,
            first_row.create_time,
            first_row.update_time,
        )
    assert client.delete(path + '/comments/' + first['uid']).status_code == 204
    assert client.get(path).json()['comments_revision'] == empty_revision
    second = client.post(path + '/comments', json={'content': 'replacement'}).json()
    with app.state.sessions() as db:
        replacement = db.scalar(select(Comment).where(Comment.uid == second['uid']))
        assert replacement.id == original_id
        replacement.create_time, replacement.update_time = original_created, original_updated
        db.commit()
    current = client.get(path).json()
    assert current['comments_revision'] != first_record['comments_revision']
    assert current['comment_preview'][0]['content'] == 'replacement'
    assert client.get(path + '/comments?page=1').json()['revision'] == current['comments_revision']


def test_comment_openapi_documents_opt_in_page(client):
    schema = client.get('/api/schema/').json()
    for path in ('/api/v1/bbtalk/{uid}/comments', '/api/v1/bbtalk/public/{uid}/comments'):
        operation = schema['paths'][path]['get']
        params = {item['name']: item for item in operation['parameters']}
        assert params['page']['required'] is False
        assert params['page_size']['schema']['default'] == 20
        variants = operation['responses']['200']['content']['application/json']['schema']['anyOf']
        assert {'$ref': '#/components/schemas/CommentPage'} in variants


def test_revision_invalidates_changes_outside_preview_only_for_affected_record(app, client):
    first_uid, second_uid = seed(app, record_count=2)
    before = client.get(f'{BASE}/{first_uid}').json()
    unrelated = client.get(f'{BASE}/{second_uid}').json()
    with app.state.sessions() as db:
        first = db.scalar(select(BBTalk).where(BBTalk.uid == first_uid))
        comment = db.scalar(
            select(Comment).where(
                Comment.bbtalk_id == first.id,
                Comment.content == 'comment 1',
            )
        )
        author_id, created, updated = comment.user_id, comment.create_time, comment.update_time
        db.delete(comment)
        db.flush()
        db.add(
            Comment(
                user_id=author_id,
                bbtalk_id=first.id,
                content='remote replacement',
                create_time=created,
                update_time=updated,
            )
        )
        db.commit()
    after = client.get(f'{BASE}/{first_uid}').json()
    assert after['comment_preview'] == before['comment_preview']
    assert after['comment_count'] == before['comment_count'] == 5
    assert after['comments_revision'] != before['comments_revision']
    assert (
        client.get(f'{BASE}/{second_uid}').json()['comments_revision']
        == unrelated['comments_revision']
    )
    comments = client.get(f'{BASE}/{first_uid}/comments?page=1').json()
    assert comments['revision'] == after['comments_revision']
    assert any(item['content'] == 'remote replacement' for item in comments['results'])
