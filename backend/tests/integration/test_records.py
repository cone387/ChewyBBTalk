from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from models import BBTalk

BASE = '/api/v1/bbtalk/'


def test_filters_dates_pagination_and_pin(app, client):
    a = client.post((BASE).rstrip('/'), json={'content': 'needle first', 'tags': ['topic', 'daily'], 'visibility': 'public'}).json()
    b = client.post((BASE).rstrip('/'), json={'content': 'second', 'tags': ['daily']}).json()
    with app.state.sessions() as db:
        first = db.scalar(select(BBTalk).where(BBTalk.uid == a['uid']))
        first.create_time = datetime(2024, 12, 31, 20, tzinfo=timezone.utc)
        db.commit()
    for params in ({'search': 'needle topic'}, {'tags': 'topic'}, {'visibility': 'public'}, {'created_on': '2025-01-01'}, {'created_from': '2024-12-31', 'created_to': '2025-01-02'}, {'created_date_from': '2025-01-01', 'created_date_to': '2025-01-01'}):
        result = client.get((BASE).rstrip('/'), params=params)
        assert result.status_code == 200, result.text
        assert [r['uid'] for r in result.json()['items']] == [a['uid']]
    assert client.get((BASE).rstrip('/'), params={'has_attachments': 'false'}).json()['total'] == 2
    assert client.get((BASE).rstrip('/'), params={'has_attachments': 'true'}).json()['total'] == 0
    assert client.get((BASE).rstrip('/'), params={'search': '"broken'}).status_code == 200
    for params in ({'page': '0'}, {'page': 'bad'}):
        assert client.get((BASE).rstrip('/'), params=params).status_code == 422
    assert client.get((BASE).rstrip('/'), params={'page': '2'}).json()['items'] == []
    assert client.get((BASE).rstrip('/'), params={'created_from': 'bad'}).status_code == 422
    assert client.get(BASE + 'date-counts', params={'year':2025,'month':1}).json() == [{'date':'2025-01-01','count':1}]
    assert client.get(BASE + 'date-counts', params={'month':13}).status_code == 422
    assert client.post(BASE + a['uid'] + '/pin').json()['is_pinned']
    assert client.get((BASE).rstrip('/')).json()['items'][0]['uid'] == a['uid']
    assert not client.post(BASE + a['uid'] + '/pin').json()['is_pinned']
    assert client.get(BASE + 'public/' + b['uid']).status_code == 404


def test_tag_lifecycle_and_transactional_deletion(client):
    a = client.post((BASE).rstrip('/'), json={'content':'sole','tags':['solo']}).json()
    b = client.post((BASE).rstrip('/'), json={'content':'shared','tags':['solo', 'other']}).json()
    assert client.get(BASE + 'tags',params={'ordering':'-create_time,invalid'}).status_code == 422
    tag = client.get(BASE + 'tags',params={'name':'solo','search':'sol','ordering':'-create_time'}).json()[0]
    assert tag['bbtalk_count'] == 2
    path = BASE+'tags/'+tag['uid']+'/'
    assert client.get((path).rstrip('/')).status_code == 200
    assert client.patch((path).rstrip('/'),json={'color':'#112233'}).json()['color'] == '#112233'
    assert client.patch((path).rstrip('/'),json={'name':' '}).status_code==422
    assert client.post(BASE + 'tags/reorder',json={'items':[{'uid':tag['uid'],'sort_order':5}]}).status_code == 200
    for items in ([],{},[{}]):
        assert client.post(BASE + 'tags/reorder',json={'items':items}).status_code == 422
    assert client.post(BASE + 'tags',json={'name':'   '}).status_code == 422
    assert client.post(BASE + 'tags',json={'name':'solo'}).status_code == 200
    assert client.delete((path).rstrip('/'),params={'delete_bbtalks':'true'}).json()['deleted_bbtalks'] == 1
    assert client.get(BASE + a['uid']).status_code == 404
    assert [t['name'] for t in client.get(BASE + b['uid']).json()['tags']] == ['other']
    assert client.get((path).rstrip('/')).status_code == 404


@pytest.mark.parametrize('payload', [{'content':' '},{'content':'valid','tags':['x'*51]},{'content':None},{'visibility':'invalid'},{'content':'valid','context':None}])
def test_invalid_creates_leave_no_receipts_or_records(client, payload):
    headers={'Idempotency-Key':'invalid-record-key'}
    assert client.post((BASE).rstrip('/'),json=payload,headers=headers).status_code == 422
    assert client.get((BASE).rstrip('/')).json()['total'] == 0
    assert client.get(BASE + 'submission-status',params={'key':'invalid-record-key'}).status_code == 404
    assert client.post((BASE).rstrip('/'),json={'content':'corrected'},headers=headers).status_code == 201


def test_edits_comments_and_deleted_submission(client):
    headers={'Idempotency-Key':'record-delete-key'}
    row=client.post((BASE).rstrip('/'),json={'content':'valid','tags':['keep']},headers=headers).json()
    path=BASE+row['uid']+'/'
    assert client.put((path).rstrip('/'),json={}).status_code == 422
    assert client.patch((path).rstrip('/'),json={'content':' '}).status_code == 422
    for stamp in ('bad','2025-01-01'):
        assert client.patch((path).rstrip('/'),json={'content':'change'},headers={'If-Match':stamp}).status_code == 422
    assert client.patch((path).rstrip('/'),json={'content':'change'}).json()['tags'][0]['name'] == 'keep'
    assert client.post(path + 'comments',json={'content':' '}).status_code == 422
    comment=client.post(path + 'comments',json={'content':' note '}).json()
    assert comment['content']=='note'
    assert client.delete(path + 'comments/' + comment['uid']).status_code==204
    assert client.delete(path + 'comments/' + comment['uid']).status_code==404
    assert client.patch((path).rstrip('/'),json={'tags':[]}).json()['tags']==[]
    assert client.delete((path).rstrip('/')).status_code==204
    assert client.post((BASE).rstrip('/'),json={'content':'valid','tags':['keep']},headers=headers).status_code==410
    assert client.get(BASE + 'submission-status',params={'key':'short'}).status_code==422


def test_large_feed_has_bounded_queries(app,client):
    from sqlalchemy import event
    with app.state.sessions() as db:
        db.add_all(BBTalk(user_id=app.state.owner_id,content=f'row {i}') for i in range(101))
        db.commit()
    queries=[]
    def collect(*args): queries.append(args[2])
    event.listen(app.state.engine,'before_cursor_execute',collect)
    try:
        first=client.get((BASE).rstrip('/')).json()
        assert len(first['items'])==100 and first['has_more']
        assert len(queries)<=7
        last=client.get((BASE).rstrip('/'),params={'page':2}).json()
        assert len(last['items'])==1 and last['page'] == 2 and not last['has_more']
    finally:
        event.remove(app.state.engine,'before_cursor_execute',collect)


def test_public_records_legacy_references_and_json_null(app,client):
    from services.records import attachment_ids
    assert attachment_ids([{'uid':'not-a-uuid'},{},None])==set()
    row=client.post((BASE).rstrip('/'),json={'content':'public','visibility':'public','attachments':[{'url':'/legacy','type':'file'}]}).json()
    assert client.get(BASE + 'public/' + row['uid']).json()['attachments']==[{'url':'/legacy','type':'file'}]
    with app.state.sessions() as db:
        record=db.scalar(select(BBTalk).where(BBTalk.uid==row['uid']))
        record.attachments=None;db.commit()
    assert client.get((BASE).rstrip('/'),params={'has_attachments':'false'}).json()['total']==1
    assert client.get((BASE).rstrip('/'),params={'has_attachments':'true'}).json()['total']==0
    tag=client.post(BASE + 'tags',json={'name':'unattached'}).json()
    assert client.delete(BASE + 'tags/' + tag['uid']).json()['deleted_bbtalks']==0


def test_database_outage_has_retryable_response(client):
    from unittest.mock import patch

    from sqlalchemy.exc import OperationalError
    with patch('api.routes.records.paginate',side_effect=OperationalError('SELECT',{},OSError('offline'))):
        result=client.get((BASE).rstrip('/'))
    assert result.status_code==503 and result.headers['Retry-After']=='1'
    assert result.json()['code']=='database_unavailable'
