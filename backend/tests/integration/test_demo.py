import pytest
from sqlalchemy import func, select

from cli import commands
from cli.demo import expand_demo, scenario_uid
from cli.demo_scenarios import scenarios
from models import Attachment, BBTalk, Comment, Identity, StorageConfig, Tag, User


def test_seed_existing_account_preserves_edits_and_is_idempotent(app, monkeypatch):
    monkeypatch.setenv('AWS_ACCESS_KEY_ID', 'must-not-use-global-s3')
    with app.state.sessions() as db:
        from services.security import create_user

        user = create_user(db, 'demo', 'existing-personal-password')
        existing = BBTalk(user_id=user.id, content='personal record')
        db.add(existing)
        db.commit()
        password = db.scalar(select(Identity.credential).where(Identity.user_id == user.id))
        assert expand_demo(db, app.state.settings, user) == 230
        db.commit()
        guide = db.scalar(select(BBTalk).where(BBTalk.uid == scenario_uid(user.id, 'guide')))
        guide.content = 'my edited guide'
        db.commit()
        counts = [
            db.scalar(select(func.count()).select_from(model))
            for model in (BBTalk, Tag, Comment, Attachment)
        ]
        assert expand_demo(db, app.state.settings, user) == 0
        db.commit()
        assert counts == [
            db.scalar(select(func.count()).select_from(model))
            for model in (BBTalk, Tag, Comment, Attachment)
        ]
        assert guide.content == 'my edited guide' and existing.content == 'personal record'
        assert db.scalar(select(Identity.credential).where(Identity.user_id == user.id)) == password
        assert not db.scalar(select(BBTalk.id).where(BBTalk.user_id == app.state.owner_id))
        # Explicit reseeding can restore a deleted preset without rewriting another preset.
        deleted = db.scalar(select(BBTalk).where(BBTalk.uid == scenario_uid(user.id, 'gallery-1')))
        db.delete(deleted)
        db.commit()
        assert expand_demo(db, app.state.settings, user) == 1
        db.commit()
        assert db.scalar(select(func.count()).select_from(Attachment)) == counts[3]


def test_demo_login_filters_pagination_and_real_media_permissions(app, client):
    with app.state.sessions() as db:
        user = commands.initialize_demo(db, app.state.settings)
        user_id = user.id
        files = list(db.scalars(select(Attachment).where(Attachment.owner_id == str(user_id))))
        assert len(files) == 18
        assert {item.mime_type.split('/')[0] for item in files} >= {
            'image',
            'video',
            'audio',
            'application',
            'text',
        }
        assert all(item.storage_config_id for item in files)
        assert len(scenarios()) == 230
    client.headers.pop('Authorization')
    for item in files:
        response = client.get(f'/api/v1/attachments/files/{item.id}/preview/')
        assert response.status_code == (200 if item.is_public else 404)
        if item.is_public:
            assert len(response.content) == item.size > 0
    login = client.post(
        '/api/v1/bbtalk/auth/token/', json={'username': 'demo', 'password': 'demo123'}
    )
    assert login.status_code == 200
    client.headers['Authorization'] = 'Bearer ' + login.json()['access']
    listing = client.get('/api/v1/bbtalk/').json()
    assert listing['count'] == 240 and listing['next']
    first = {item['uid'] for item in listing['results']}
    second = client.get(listing['next']).json()
    assert not first.intersection(item['uid'] for item in second['results'])
    for params in (
        {'visibility': 'private'},
        {'has_attachments': 'true'},
        {'search': '咖啡'},
        {'tags__name': 'Markdown'},
        {'search': '时间线'},
    ):
        assert client.get('/api/v1/bbtalk/', params=params).json()['count'] > 0
    assert client.get('/api/v1/bbtalk/', params={'tags__name': '暂未使用'}).json()['count'] == 0
    for item in files:
        response = client.get(f'/api/v1/attachments/files/{item.id}/content/')
        assert response.status_code == 200 and len(response.content) == item.size
    image = next(item for item in files if item.mime_type == 'image/png')
    assert client.get(f'/api/v1/attachments/files/{image.id}/preview/').content.startswith(
        b'\x89PNG'
    )
    video = next(item for item in files if item.mime_type == 'video/mp4')
    response = client.get(
        f'/api/v1/attachments/files/{video.id}/preview/', headers={'Range': 'bytes=0-99'}
    )
    assert response.status_code == 206 and len(response.content) == 100


def test_seed_command_and_changed_storage_guard(app, monkeypatch):
    monkeypatch.setattr(commands, 'Settings', lambda: app.state.settings)
    monkeypatch.setattr(
        commands, 'database', lambda settings: (app.state.engine, app.state.sessions)
    )
    commands.main(['seed-demo'])
    commands.main(['seed-demo'])
    with app.state.sessions() as db:
        user = db.scalar(select(User).where(User.username == 'demo'))
        config = db.scalar(select(StorageConfig).where(StorageConfig.user_id == user.id))
        config.storage_type = 's3'
        db.delete(db.scalar(select(BBTalk).where(BBTalk.uid == scenario_uid(user.id, 'short'))))
        db.commit()
        with pytest.raises(ValueError, match='local'):
            expand_demo(db, app.state.settings, user)
