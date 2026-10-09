from io import BytesIO
import json
import zipfile
from unittest.mock import patch
import pytest
from sqlalchemy import select, func
from chewy_api.data import DataExporter, import_data, read_import
from chewy_api.models import User, BBTalk, Attachment, Tag, Comment
from chewy_api.backups import create_backup, backup_lock, user_directory, list_backups, read_status, write_status, backup_path

BASE='/api/v1/bbtalk/'
FILES='/api/v1/attachments/files/'


def archive_bytes(members):
    stream=BytesIO()
    with zipfile.ZipFile(stream,'w') as archive:
        for name,content in members.items(): archive.writestr(name,content)
    return stream.getvalue()


def seed(client):
    file=client.post(FILES,files={'file':('hello.txt',b'hello','text/plain')}).json()
    row=client.post(BASE,json={'content':'restore me','post_tags':'backup','is_pinned':True,'visibility':'public','attachments':[{'uid':file['id']}]}).json()
    client.post(BASE+row['uid']+'/comments/',json={'content':'a comment'})
    return file,row


def test_complete_restore_preserves_data_and_remaps_account(app,client):
    file,row=seed(client)
    exported=client.get(BASE+'data/export/',params={'format':'zip','include_attachments':'true'})
    assert exported.status_code==200
    preview=client.post(BASE+'data/validate/',files={'file':('export.zip',exported.content)}).json()
    assert preview['complete_backup'] and preview['preview']['comments_count']==1
    data,archive,complete=read_import(exported.content,10_000_000)
    with archive,app.state.sessions() as db:
        target=User(username='restore-target')
        db.add(target); db.flush()
        stats=import_data(db,app.state.settings,target,data,archive,complete)
        assert not stats['errors']
        assert stats['bbtalks_created']==stats['comments_created']==stats['attachments_created']==1
        record=db.scalar(select(BBTalk).where(BBTalk.user_id==target.id))
        assert record.uid!=row['uid'] and record.is_pinned
        assert record.create_time.isoformat()==row['create_time'].replace('Z','+00:00')
        restored=db.scalar(select(Attachment).where(Attachment.owner_id==str(target.id)))
        assert restored.id!=file['id'] and restored.is_public
        assert record.attachments[0]['uid']==restored.id
        assert (app.state.settings.storage_root/restored.storage_path).read_bytes()==b'hello'
        assert [tag.name for tag in record.tags]==['backup']
        assert db.scalar(select(Comment.content).where(Comment.user_id==target.id))=='a comment'


@pytest.mark.parametrize('mutation',['missing','changed','data'])
def test_tampering_rejected_before_writes(client,mutation):
    seed(client)
    payload=client.get(BASE+'data/export/',params={'format':'zip','include_attachments':'true'}).content
    with zipfile.ZipFile(BytesIO(payload)) as archive:
        members={name:archive.read(name) for name in archive.namelist()}
    attachment=next(name for name in members if name.startswith('attachments/'))
    if mutation=='missing': del members[attachment]
    elif mutation=='changed': members[attachment]=b'changed'
    else: members['data.json']+=b'changed'
    damaged=archive_bytes(members)
    assert not client.post(BASE+'data/validate/',files={'file':('bad.zip',damaged)}).json()['valid']
    assert client.post(BASE+'data/import/',files={'file':('bad.zip',damaged)}).status_code==400
    assert client.get(BASE).json()['count']==1


def test_partial_import_duplicates_settings_and_timestamps(app,client):
    data={'version':'1.0','tags':[{'uid':'t','name':'imported','create_time':'2025-01-01T00:00:00'}, {'name':''}],
          'bbtalks':[{'uid':'r','content':'imported','tags':['t'],'attachments':[{'uid':'missing'}]}, {'content':42}],
          'comments':[{'bbtalk_uid':'r','content':'note'}, {'bbtalk_uid':'r','content':' '}, {'bbtalk_uid':'missing','content':'lost'}],
          'attachments':[{'id':'a','storage_path':'missing.txt'}, {'id':'bad','storage_path':'../escape'}],
          'storage_settings':[{'name':'restored','storage_type':'local','is_active':True}, {'name':''}]}
    payload=json.dumps(data).encode()
    options={'import_storage_settings':'true','overwrite_tags':'true'}
    first=client.post(BASE+'data/import/',files={'file':('data.json',payload)},data=options).json()
    assert first['success'] and first['partial']
    assert first['stats']['bbtalks_created']==first['stats']['tags_created']==first['stats']['storage_settings_created']==1
    second=client.post(BASE+'data/import/',files={'file':('data.json',payload)},data=options).json()
    assert second['stats']['bbtalks_skipped']==second['stats']['tags_skipped']==1
    assert second['stats']['comments_skipped']==3
    assert not client.get(BASE+'settings/storage/').json()[0]['is_active']
    assert client.post(BASE+'data/import/',files={'file':('data.json',payload)},data={'skip_duplicates':'false'}).json()['stats']['bbtalks_created']==1


@pytest.mark.parametrize('payload',[b'not json',b'[]',b'{"version":"2"}',b'{"version":"1.0","tags":{}}',b'{"version":"1.0","tags":[1]}'])
def test_invalid_import_formats(client,payload):
    assert client.post(BASE+'data/import/',files={'file':('data.json',payload)}).status_code==400
    assert not client.post(BASE+'data/validate/',files={'file':('data.json',payload)}).json()['valid']


def test_import_size_limits_and_legacy_zip(app,client):
    payload=archive_bytes({'data.json':json.dumps({'version':'1.0','bbtalks':[]})})
    assert not client.post(BASE+'data/validate/',files={'file':('old.zip',payload)}).json()['complete_backup']
    with pytest.raises(ValueError): read_import(payload,1)
    app.state.settings.max_import_size=2
    assert client.post(BASE+'data/import/',files={'file':('big.json',b'long')}).status_code==413


def test_complete_restore_storage_failure_rolls_back(app,client):
    seed(client)
    payload=client.get(BASE+'data/export/',params={'format':'zip','include_attachments':'true'}).content
    data,archive,complete=read_import(payload,10_000_000)
    with archive,app.state.sessions() as db:
        target=User(username='failed-restore'); db.add(target); db.commit()
        target_id=target.id
        with patch('chewy_api.storage.Store.save',side_effect=OSError('disk full')):
            with pytest.raises(ValueError): import_data(db,app.state.settings,target,data,archive,complete)
        assert db.scalar(select(func.count()).select_from(Tag).where(Tag.user_id==target_id))==0
        assert db.scalar(select(func.count()).select_from(BBTalk).where(BBTalk.user_id==target_id))==0


def test_backup_lock_retention_failures_and_download(app,client):
    settings=app.state.settings
    with app.state.sessions() as db:
        user=db.get(User,app.state.owner_id)
        directory=user_directory(user,settings)
        assert list_backups(user,settings)=={'items':[],'latest':None}
        with pytest.raises(ValueError): create_backup(user,db,settings,keep=0)
        with backup_lock(directory):
            write_status(directory,{'status':'running'})
            assert client.post(BASE+'data/backups/').status_code==409
            assert list_backups(user,settings)['latest']['status']=='running'
        assert list_backups(user,settings)['latest']['status']=='interrupted'
        (directory/'.status.json').write_bytes(b'broken')
        assert read_status(directory)['status']=='unknown'
        first,_=create_backup(user,db,settings,keep=1)
        second,removed=create_backup(user,db,settings,keep=1)
        assert removed==1 and not first.exists() and second.exists()
        assert client.get(BASE+'data/backups/'+second.name+'/').status_code==200
        assert client.get(BASE+'data/backups/missing.zip/').status_code==404
        for name in ('../bad.zip','/bad.zip','wrong.txt'):
            with pytest.raises(FileNotFoundError): backup_path(user,name,settings)
        with patch.object(DataExporter,'export_to_zip',side_effect=OSError('missing file')):
            assert client.post(BASE+'data/backups/').status_code==500
        assert read_status(directory)['status']=='failed'
        assert second.exists() and len(list(directory.glob('*.zip')))==1


def test_unresolved_references_and_duplicate_file_paths_cannot_export(app,client):
    from chewy_api.backup_integrity import verify_attachment_references
    for ref in ({},'missing'):
        with pytest.raises(ValueError): verify_attachment_references({'bbtalks':[{'attachments':[ref]}]})
    file,row=seed(client)
    with app.state.sessions() as db:
        original=db.get(Attachment,file['id'])
        db.add(Attachment(original_name='duplicate.txt',storage_path=original.storage_path,size=5,mime_type='text/plain',owner_id=original.owner_id))
        db.commit()
        with pytest.raises(ValueError): DataExporter(db.get(User,app.state.owner_id),db,app.state.settings).export_to_zip(True)
    assert client.get(BASE+'data/export/',params={'format':'zip'}).status_code==200


def test_legacy_zip_attachment_row_failure_reports_partial_and_cleans_file(app,client):
    payload=archive_bytes({'data.json':json.dumps({'version':'1.0','attachments':[{'id':'old','storage_path':'old.txt','created_at':'invalid'}]}),'attachments/old.txt':b'hello'})
    result=client.post(BASE+'data/import/',files={'file':('legacy.zip',payload)}).json()
    assert result['partial'] and result['stats']['attachments_skipped']==1
    assert not list(app.state.settings.storage_root.rglob('*.txt'))


def test_import_commit_failure_cleans_copied_files(app,client):
    seed(client)
    payload=client.get(BASE+'data/export/',params={'format':'zip','include_attachments':'true'}).content
    data,archive,complete=read_import(payload,10_000_000)
    existing=set(app.state.settings.storage_root.rglob('*.txt'))
    with archive,app.state.sessions() as db:
        target=User(username='commit-failure');db.add(target);db.commit()
        with patch.object(db,'commit',side_effect=OSError('commit failed')):
            with pytest.raises(OSError): import_data(db,app.state.settings,target,data,archive,complete)
    assert set(app.state.settings.storage_root.rglob('*.txt'))==existing


def test_backup_path_guards_and_retention_failure(app):
    from pathlib import Path
    from chewy_api.backups import backup_root
    settings=app.state.settings
    assert backup_root(settings,str(settings.data_dir/'custom'))==settings.data_dir/'custom'
    with app.state.sessions() as db:
        user=db.get(User,app.state.owner_id)
        directory=user_directory(user,settings)
        directory.mkdir(parents=True)
        assert read_status(directory) is None
        with patch.object(Path,'is_symlink',return_value=True):
            with pytest.raises(ValueError): user_directory(user,settings)
            with pytest.raises(ValueError): read_status(directory)
            with pytest.raises(ValueError):
                with backup_lock(directory): pass
        first,_=create_backup(user,db,settings,keep=1)
        original=Path.unlink
        def remove(path,*args,**kwargs):
            if path==first: raise PermissionError('read-only')
            return original(path,*args,**kwargs)
        with patch.object(Path,'unlink',remove):
            second,count=create_backup(user,db,settings,keep=1)
        assert first.exists() and second.exists() and count==0
        assert read_status(directory)['status']=='success'
        assert '清理失败' in read_status(directory)['message']
