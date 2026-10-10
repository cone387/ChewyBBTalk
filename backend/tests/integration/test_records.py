from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from models import BBTalk

BASE = '/api/v1/bbtalk/'


def test_filters_dates_pagination_and_pin(app, client):
    a = client.post(BASE, json={'content': 'needle first', 'post_tags': 'topic,daily', 'visibility': 'public'}).json()
    b = client.post(BASE, json={'content': 'second', 'post_tags': 'daily'}).json()
    with app.state.sessions() as db:
        first = db.scalar(select(BBTalk).where(BBTalk.uid == a['uid']))
        first.create_time = datetime(2024, 12, 31, 20, tzinfo=timezone.utc)
        db.commit()
    for params in ({'search': 'needle topic'}, {'tags__name': 'topic'}, {'visibility': 'public'}, {'create_time__date': '2025-01-01'}, {'create_time__gte': '2024-12-31', 'create_time__lte': '2025-01-02'}, {'create_date__gte': '2025-01-01', 'create_date__lte': '2025-01-01'}):
        result = client.get(BASE, params=params)
        assert result.status_code == 200, result.text
        assert [r['uid'] for r in result.json()['results']] == [a['uid']]
    assert client.get(BASE, params={'has_attachments': 'false'}).json()['count'] == 2
    assert client.get(BASE, params={'has_attachments': 'true'}).json()['count'] == 0
    assert client.get(BASE, params={'search': '"broken'}).status_code == 200
    for params in ({'page': '0'}, {'page': 'bad'}):
        assert client.get(BASE, params=params).status_code == 422
    assert client.get(BASE, params={'page': '2'}).status_code == 404
    assert client.get(BASE, params={'create_time__gte': 'bad'}).status_code == 422
    assert client.get(BASE+'date-counts/', params={'year':2025,'month':1}).json() == [{'date':'2025-01-01','count':1}]
    assert client.get(BASE+'date-counts/', params={'month':13}).status_code == 422
    assert client.post(BASE+a['uid']+'/pin/').json()['is_pinned']
    assert client.get(BASE).json()['results'][0]['uid'] == a['uid']
    assert not client.post(BASE+a['uid']+'/pin/').json()['is_pinned']
    assert client.get(BASE+'public/'+b['uid']+'/').status_code == 404


def test_tag_lifecycle_and_transactional_deletion(client):
    a = client.post(BASE, json={'content':'sole','post_tags':'solo'}).json()
    b = client.post(BASE, json={'content':'shared','post_tags':'solo,other'}).json()
    assert client.get(BASE+'tags/',params={'ordering':'-create_time,invalid'}).status_code == 422
    tag = client.get(BASE+'tags/',params={'name':'solo','search':'sol','ordering':'-create_time'}).json()[0]
    assert tag['bbtalk_count'] == 2
    path = BASE+'tags/'+tag['uid']+'/'
    assert client.get(path).status_code == 200
    assert client.patch(path,json={'color':'#112233'}).json()['color'] == '#112233'
    assert client.patch(path,json={'name':' '}).status_code==422
    assert client.post(BASE+'tags/reorder/',json={'items':[{'uid':tag['uid'],'sort_order':5}]}).status_code == 200
    for items in ([],{},[{}]):
        assert client.post(BASE+'tags/reorder/',json={'items':items}).status_code == 422
    assert client.post(BASE+'tags/',json={'name':'   '}).status_code == 422
    assert client.post(BASE+'tags/',json={'name':'solo'}).status_code == 200
    assert client.delete(path,params={'delete_bbtalks':'true'}).json()['deleted_bbtalks'] == 1
    assert client.get(BASE+a['uid']+'/').status_code == 404
    assert [t['name'] for t in client.get(BASE+b['uid']+'/').json()['tags']] == ['other']
    assert client.get(path).status_code == 404


@pytest.mark.parametrize('payload', [{'content':' '},{'content':'valid','post_tags':'x'*51},{'content':None},{'visibility':'invalid'},{'content':'valid','context':None}])
def test_invalid_creates_leave_no_receipts_or_records(client, payload):
    headers={'Idempotency-Key':'invalid-record-key'}
    assert client.post(BASE,json=payload,headers=headers).status_code == 422
    assert client.get(BASE).json()['count'] == 0
    assert client.get(BASE+'submission-status/',params={'key':'invalid-record-key'}).status_code == 404
    assert client.post(BASE,json={'content':'corrected'},headers=headers).status_code == 201


def test_edits_comments_and_deleted_submission(client):
    headers={'Idempotency-Key':'record-delete-key'}
    row=client.post(BASE,json={'content':'valid','post_tags':'keep'},headers=headers).json()
    path=BASE+row['uid']+'/'
    assert client.put(path,json={}).status_code == 422
    assert client.patch(path,json={'content':' '}).status_code == 422
    for stamp in ('bad','2025-01-01'):
        assert client.patch(path,json={'content':'change'},headers={'If-Match':stamp}).status_code == 422
    assert client.patch(path,json={'content':'change'}).json()['tags'][0]['name'] == 'keep'
    assert client.post(path+'comments/',json={'content':' '}).status_code == 422
    comment=client.post(path+'comments/',json={'content':' note '}).json()
    assert comment['content']=='note'
    assert client.delete(path+'comments/'+comment['uid']+'/').status_code==204
    assert client.delete(path+'comments/'+comment['uid']+'/').status_code==404
    assert client.patch(path,json={'post_tags':''}).json()['tags']==[]
    assert client.delete(path).status_code==204
    assert client.post(BASE,json={'content':'valid','post_tags':'keep'},headers=headers).status_code==410
    assert client.get(BASE+'submission-status/',params={'key':'short'}).status_code==422


def test_large_feed_has_bounded_queries(app,client):
    from sqlalchemy import event
    with app.state.sessions() as db:
        db.add_all(BBTalk(user_id=app.state.owner_id,content=f'row {i}') for i in range(101))
        db.commit()
    queries=[]
    def collect(*args): queries.append(args[2])
    event.listen(app.state.engine,'before_cursor_execute',collect)
    try:
        first=client.get(BASE).json()
        assert len(first['results'])==100 and first['next']
        assert len(queries)<=7
        last=client.get(BASE,params={'page':2}).json()
        assert len(last['results'])==1 and last['previous'] and not last['next']
    finally:
        event.remove(app.state.engine,'before_cursor_execute',collect)


def test_public_records_legacy_references_and_json_null(app,client):
    from services.records import attachment_ids
    assert attachment_ids([{'uid':'not-a-uuid'},{},None])==set()
    row=client.post(BASE,json={'content':'public','visibility':'public','attachments':[{'url':'/legacy','type':'file'}]}).json()
    assert client.get(BASE+'public/'+row['uid']+'/').json()['attachments']==[{'url':'/legacy','type':'file'}]
    with app.state.sessions() as db:
        record=db.scalar(select(BBTalk).where(BBTalk.uid==row['uid']))
        record.attachments=None;db.commit()
    assert client.get(BASE,params={'has_attachments':'false'}).json()['count']==1
    assert client.get(BASE,params={'has_attachments':'true'}).json()['count']==0
    tag=client.post(BASE+'tags/',json={'name':'unattached'}).json()
    assert client.delete(BASE+'tags/'+tag['uid']+'/').json()['deleted_bbtalks']==0


def test_database_outage_has_retryable_response(client):
    from unittest.mock import patch

    from sqlalchemy.exc import OperationalError
    with patch('api.routes.records.paginate',side_effect=OperationalError('SELECT',{},OSError('offline'))):
        result=client.get(BASE)
    assert result.status_code==503 and result.headers['Retry-After']=='1'
    assert result.json()['code']=='submission_retry'
