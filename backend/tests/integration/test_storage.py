from io import BytesIO
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from models import Attachment, StorageConfig, User
from services.security import decrypt_secret
from storage.backends import Store, safe_key
from storage.service import store_for

BASE='/api/v1/bbtalk/'
CONFIG=BASE+'settings/storage/'
FILES='/api/v1/attachments/files/'


@pytest.fixture
def s3():
    client=MagicMock()
    client.__enter__.return_value=client
    client.get_object.side_effect=lambda **kw:{'Body':BytesIO(b'cloud data')}
    client.generate_presigned_url.return_value='https://bucket.example/signed'
    with patch('storage.backends.boto3.client',return_value=client) as factory:
        yield client,factory


def config(client,**extra):
    return client.post(CONFIG+'create/',json={'name':'bucket','s3_access_key_id':'access','s3_secret_access_key':'secret','s3_bucket_name':'bucket','is_active':True,**extra}).json()


def test_cloud_crud_secret_redaction_and_connection(app,client,s3):
    cloud,factory=s3
    row=config(client)
    assert row['is_s3_configured'] and row['has_secret_key'] and 's3_secret_access_key' not in row
    path=CONFIG+str(row['id'])+'/'
    with app.state.sessions() as db:
        saved=db.get(StorageConfig,row['id'])
        assert saved.s3_secret_access_key.startswith('enc:v1:')
        assert decrypt_secret(saved.s3_secret_access_key,app.state.settings)=='secret'
    assert client.patch(path,json={'s3_secret_access_key':'','name':'renamed'}).json()['has_secret_key']
    assert client.post(path+'test/').json()['success']
    assert client.post(CONFIG+'test/').json()['success']
    cloud.list_objects_v2.side_effect=OSError('sensitive details')
    failure=client.post(path+'test/')
    assert failure.status_code==400 and 'sensitive details' not in failure.text
    cloud.list_objects_v2.side_effect=None
    uploaded=client.post(FILES,files={'file':('note.txt',b'cloud data')}).json()
    assert factory.call_args.kwargs['aws_secret_access_key']=='secret'
    assert cloud.put_object.call_args.kwargs['Body']==b'cloud data'
    preview=client.get(uploaded['preview_url'],follow_redirects=False)
    assert preview.status_code==302 and preview.headers['location']=='https://bucket.example/signed'
    assert client.delete(path+'delete/').status_code==409
    assert client.delete(FILES+uploaded['id']+'/').status_code==204
    cloud.delete_object.assert_called_once()
    assert client.post(CONFIG+'deactivate-all/').status_code==200
    assert not client.get(CONFIG).json()[0]['is_active']
    assert client.post(path+'activate/').json()['is_active']
    assert client.delete(path+'delete/').status_code==204
    assert client.post(CONFIG+'test/').status_code==400
    assert client.post(path+'test/').status_code==404


def test_migration_moves_metadata_and_keeps_sources(app,client,s3):
    file=client.post(FILES,files={'file':('note.txt',b'local data')}).json()
    with app.state.sessions() as db:
        old_path=db.get(Attachment,file['id']).storage_path
    target=config(client)
    payload={'target_config_id':target['id']}
    assert client.post(BASE+'storage/migration/preview/',json=payload).json()['need_migrate']==1
    moved=client.post(BASE+'storage/migration/execute/',json=payload).json()
    assert moved['success'] and moved['stats']['migrated']==1
    assert (app.state.settings.storage_root/old_path).read_bytes()==b'local data'
    assert client.post(BASE+'storage/migration/execute/',json=payload).json()['stats']['skipped']==1
    assert client.post(BASE+'storage/migration/execute/',json={'target_config_id':None}).json()['stats']['migrated']==1
    assert client.get(file['preview_url']).content==b'cloud data'
    assert client.post(BASE+'storage/migration/preview/',json={'target_config_id':999}).status_code==404
    with patch.object(Store,'save',side_effect=OSError('unavailable')):
        failed=client.post(BASE+'storage/migration/execute/',json=payload).json()
        assert not failed['success'] and failed['stats']['failed']==1
    assert client.get(file['preview_url']).content==b'cloud data'


@pytest.mark.parametrize('key',['','../a','/etc/passwd','C:/a','a\x00b','a/../../b'])
def test_unsafe_paths(key):
    with pytest.raises(ValueError): safe_key(key)


def test_attachment_permissions_head_ranges_and_visibility(app,client):
    file=client.post(FILES,files={'file':('image.png',b'0123456789')}).json()
    assert client.head(file['preview_url']).status_code==200
    assert client.head(file['preview_url']).content==b''
    assert client.get(file['preview_url'],headers={'Range':'bytes=2-4'}).content==b'234'
    with TestClient(app) as anonymous:
        assert anonymous.get(file['preview_url']).status_code==404
        assert anonymous.get(FILES).json()['count']==0
        row=client.post(BASE,json={'content':'public','visibility':'public','attachments':[{'uid':file['id']}]}).json()
        assert anonymous.get(file['preview_url']).status_code==200
        assert anonymous.delete(FILES+file['id']+'/').status_code==404
        assert anonymous.get(FILES,params={'page_size':'bad'}).status_code==422
        assert anonymous.get(FILES).json()['count']==1
        assert client.delete(BASE+row['uid']+'/').status_code==204
        assert anonymous.get(file['preview_url']).status_code==404
    assert client.get(FILES+'invalid/').status_code==422
    assert client.get(FILES+file['id']+'/').json()['original_name']=='image.png'
    with app.state.sessions() as db:
        stored=db.get(Attachment,file['id'])
        (app.state.settings.storage_root/stored.storage_path).unlink()
    assert client.get(file['preview_url']).status_code==404


def test_https_proxy_attachment_urls_preserve_scheme(client):
    file=client.post(FILES,files={'file':('https.txt',b'https')},headers={'X-Forwarded-Proto':'https','X-Forwarded-For':'203.0.113.8'}).json()
    assert file['preview_url'].startswith('https://testserver/')
    row=client.post(BASE,json={'content':'peer'},headers={'X-Forwarded-Proto':'https','X-Forwarded-For':'203.0.113.8'}).json()
    assert row['context']['device']['ip']=='testclient'


def test_invalid_upload_and_foreign_storage(app,client):
    for name,body in [('file.exe',b'content'),('empty.txt',b'')]:
        assert client.post(FILES,files={'file':(name,body)}).status_code==400
    app.state.settings.max_file_size=2
    assert client.post(FILES,files={'file':('big.txt',b'long')}).status_code==400
    app.state.settings.max_file_size=100
    with app.state.sessions() as db:
        other=User(username='foreign'); db.add(other); db.flush()
        foreign=StorageConfig(user_id=other.id,name='foreign',storage_type='local'); db.add(foreign); db.commit()
        foreign_id=foreign.id
        for invalid in ('bad','999',str(foreign_id)):
            with pytest.raises(Exception) as error: store_for(db,app.state.settings,invalid,app.state.owner_id)
            assert error.value.status==403
    assert client.post(FILES,files={'file':('safe.txt',b'ok')},data={'storage_config_id':str(foreign_id)}).status_code==403
    row=client.post(CONFIG+'create/',json={'name':'incomplete','is_active':True}).json()
    assert client.post(CONFIG+str(row['id'])+'/test/').status_code==400
    assert client.post(FILES,files={'file':('safe.txt',b'ok')},data={'storage_config_id':str(row['id'])}).status_code==400


def test_server_s3_and_runtime_checks(app,client,s3,monkeypatch):
    for key,value in [('AWS_ACCESS_KEY_ID','a'),('AWS_SECRET_ACCESS_KEY','s'),('AWS_STORAGE_BUCKET_NAME','bucket')]: monkeypatch.setenv(key,value)
    assert client.get(BASE+'settings/status/').json()['storage']['mode']=='server_s3'
    s3[0].list_objects_v2.side_effect=OSError('offline')
    with app.state.sessions() as db:
        user=db.get(User,app.state.owner_id); user.is_staff=True; db.commit()
    with patch('api.routes.status.list_backups',side_effect=OSError),patch('api.routes.status.shutil.disk_usage',side_effect=OSError):
        result=client.get(BASE+'settings/status/').json()
        assert result['storage']['status']==result['backup']['status']=='error'
        assert result['diagnostics']['attachment_disk']['status']=='error'
        assert result['diagnostics']['database']['status']=='ok'


def test_storage_updates_switch_active_and_retain_encryption(app,client):
    first=config(client)
    second=config(client,name='second',is_active=False)
    path=CONFIG+str(second['id'])+'/'
    assert client.patch(path,json={'s3_secret_access_key':'replacement','is_active':True}).status_code==200
    assert client.get(CONFIG+'active/').json()['id']==second['id']
    with app.state.sessions() as db:
        assert not db.get(StorageConfig,first['id']).is_active
        assert decrypt_secret(db.get(StorageConfig,second['id']).s3_secret_access_key,app.state.settings)=='replacement'
    local=config(client,name='local',storage_type='local',is_active=False)
    assert client.post(FILES,files={'file':('local.txt',b'ok')},data={'storage_config_id':str(local['id'])}).status_code==201


def test_cross_account_attachment_references_rejected(app,client):
    from services.security import token_pair
    file=client.post(FILES,files={'file':('private.txt',b'private')}).json()
    with app.state.sessions() as db:
        other=User(username='foreign-ref');db.add(other);db.flush()
        tokens=token_pair(db,other,app.state.settings);db.commit()
    client.headers['Authorization']='Bearer '+tokens['access']
    assert client.post(BASE,json={'content':'stolen','attachments':[{'uid':file['id']}]}).status_code==400
    row=client.post(BASE,json={'content':'own'}).json()
    assert client.patch(BASE+row['uid']+'/',json={'attachments':[{'uid':file['id']}]}).status_code==400
    assert client.get(file['preview_url']).status_code==404


def test_upload_commit_failure_removes_written_bytes(app,client):
    from sqlalchemy.exc import IntegrityError
    from sqlalchemy.orm import Session
    with patch.object(Session,'commit',side_effect=IntegrityError('insert',{},ValueError())):
        assert client.post(FILES,files={'file':('failed.txt',b'bytes')}).status_code==400
    assert not list(app.state.settings.storage_root.rglob('*.txt'))


def test_runtime_database_probe_and_readback_failure(app,client):
    from sqlalchemy import text
    with app.state.sessions() as db:
        db.get(User,app.state.owner_id).is_staff=True;db.commit()
    assert client.get(BASE+'settings/status/').json()['diagnostics']['attachment_disk']['status']=='ok'
    with patch('api.routes.status.tempfile.TemporaryFile') as probe,patch('api.routes.status.text',return_value=text('SELECT * FROM nonexistent_probe_table')):
        probe.return_value.__enter__.return_value.read.return_value=b'corrupt'
        result=client.get(BASE+'settings/status/').json()
    assert result['storage']['status']==result['diagnostics']['database']['status']=='error'
