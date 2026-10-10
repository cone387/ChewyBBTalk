"""Exercise the production ASGI entrypoint, not Django's test request handler."""
import base64
import hashlib
import tempfile
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from application import create_app
from core.config import Settings
from database.upgrade import upgrade
from models import BBTalk
from services.security import create_user

BASE = '/api/v1/bbtalk/'
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=')


class FastAPIContractTests(TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.config = Settings(data_dir=Path(self.directory.name), media_root=Path(self.directory.name)/'media',
            database_url='sqlite:///' + (Path(self.directory.name)/'db.sqlite3').as_posix(),
            secret_key='native-tests-only-not-a-production-key', registration_enabled=True,
            login_rate='', registration_rate='', refresh_rate='')
        self.app = create_app(self.config)
        self.addCleanup(self.app.state.engine.dispose)
        upgrade(self.app.state.engine)
        with self.app.state.sessions() as db:
            self.user = create_user(db, 'asgi-owner', 'long-password-for-tests')
            db.commit()
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)
        response = self.client.post(BASE + 'auth/token/', json={
            'username': 'asgi-owner', 'password': 'long-password-for-tests',
        })
        self.assertEqual(response.status_code, 200, response.text)
        self.tokens = response.json()
        self.client.headers['Authorization'] = 'Bearer ' + self.tokens['access']

    def test_entrypoint_policy_and_route_inventory(self):
        self.assertIsInstance(self.app, FastAPI)
        self.assertEqual(self.client.get('/healthz').json(), {'status': 'ok'})
        response = self.client.get(BASE + 'auth/policy/', headers={'Authorization': 'Bearer invalid'})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['registration_enabled'])
        self.assertEqual(response.headers['cache-control'], 'no-store')

    def test_token_rotation_and_blacklist(self):
        self.assertEqual(self.client.get(BASE + 'user/me/').json()['username'], 'asgi-owner')
        refresh = self.client.post(BASE + 'auth/token/refresh/', json={'refresh': self.tokens['refresh']})
        self.assertEqual(refresh.status_code, 200, refresh.text)
        self.assertEqual(self.client.post(BASE + 'auth/token/refresh/', json={'refresh': self.tokens['refresh']}).status_code, 401)
        self.assertEqual(self.client.post(BASE + 'auth/token/blacklist/', json={'refresh': refresh.json()['refresh']}).status_code, 200)
        self.assertEqual(self.client.post(BASE + 'auth/token/refresh/', json={'refresh': refresh.json()['refresh']}).status_code, 401)

    def test_idempotency_queries_comments_conditional_edits_and_isolation(self):
        payload = {'content': 'FastAPI 中文记录', 'post_tags': 'migration,fastapi', 'visibility': 'private'}
        headers = {'Idempotency-Key': 'fastapi-submission-001'}
        first = self.client.post(BASE, json=payload, headers=headers)
        self.assertEqual(first.status_code, 201, first.text)
        record = first.json()
        replay = self.client.post(BASE, json=payload, headers=headers)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay.headers['idempotency-replayed'], 'true')
        self.assertEqual(replay.headers['cache-control'], 'no-store')
        with self.app.state.sessions() as db:
            self.assertEqual(db.scalar(select(func.count()).select_from(BBTalk)), 1)
        self.assertEqual(self.client.get(BASE, params={'search': '中文', 'tags__name': 'fastapi'}).json()['count'], 1)
        self.assertEqual(self.client.get(BASE + 'submission-status/', params={'key': headers['Idempotency-Key']}).json()['uid'], record['uid'])
        path = BASE + record['uid'] + '/'
        self.assertEqual(self.client.get(BASE + record['uid'] + '.json/').json()['uid'], record['uid'])
        comment = self.client.post(path + 'comments/', json={'content': 'comment'})
        self.assertEqual(comment.status_code, 201, comment.text)
        self.assertEqual(self.client.delete(path + 'comments/' + comment.json()['uid'] + '/').status_code, 204)
        self.assertEqual(self.client.post(path + 'pin/').status_code, 200)
        changed = self.client.patch(path, json={'content': 'updated'}, headers={'If-Match': record['update_time']})
        self.assertEqual(changed.status_code, 200, changed.text)
        self.assertEqual(self.client.patch(path, json={'content': 'stale'}, headers={'If-Match': record['update_time']}).status_code, 409)
        with TestClient(self.app) as other:
            tokens = other.post(BASE + 'auth/register/', json={'username': 'other-account', 'password': 'other-password'}).json()
            other.headers['Authorization'] = 'Bearer ' + tokens['access']
            self.assertEqual(other.get(path).status_code, 404)
            self.assertEqual(other.get(BASE).json()['count'], 0)
        self.assertEqual(self.client.delete(path).status_code, 204)

    def test_session_cookie_and_csrf(self):
        with TestClient(self.app) as browser:
            response = browser.post(BASE + 'auth/login/', json={'username': 'asgi-owner', 'password': 'long-password-for-tests'})
            self.assertEqual(response.status_code, 200)
            self.assertIn('sessionid', browser.cookies)
            self.assertIn('csrftoken', browser.cookies)
            self.assertEqual(browser.get(BASE + 'user/me/').status_code, 200)
            self.assertEqual(browser.patch(BASE + 'user/me/', json={'bio': 'missing csrf'}).status_code, 403)
            response = browser.patch(BASE + 'user/me/', json={'bio': 'session works'}, headers={'X-CSRFToken': browser.cookies['csrftoken']})
            self.assertEqual(response.status_code, 200, response.text)
            response = browser.post(BASE + 'auth/logout/', headers={'X-CSRFToken': browser.cookies['csrftoken']})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(browser.get(BASE + 'user/me/').status_code, 401)

    def test_multipart_private_public_range_head_and_download(self):
        upload = self.client.post('/api/v1/attachments/files/', files={'file': ('image.png', PNG, 'image/png')})
        self.assertEqual(upload.status_code, 201, upload.text)
        uid = upload.json()['id']
        path = '/api/v1/attachments/files/' + uid + '/'
        preview = path + 'preview/'
        self.assertEqual(self.client.get(preview).content, PNG)
        response = self.client.get(preview, headers={'Range': 'bytes=0-7'})
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.content, PNG[:8])
        self.assertEqual(response.headers['content-range'], f'bytes 0-7/{len(PNG)}')
        self.assertEqual(self.client.head(preview).content, b'')
        self.assertEqual(self.client.get(path + 'content/').content, PNG)
        with TestClient(self.app) as anonymous:
            self.assertIn(anonymous.get(preview).status_code, (403, 404))
            post = self.client.post(BASE, json={'content': 'public attachment', 'attachments': [{'uid': uid}], 'visibility': 'public'})
            self.assertEqual(post.status_code, 201, post.text)
            self.assertEqual(anonymous.get(preview).content, PNG)
            self.assertEqual(anonymous.get('/media/attachments/' + uid).status_code, 404)
        self.assertEqual(self.client.delete(path).status_code, 204)

    def test_throttle_and_cors(self):
        self.app.state.limiter.history.clear()
        with patch.object(self.config, 'login_rate', '1/minute'):
            self.assertEqual(self.client.post(BASE + 'auth/token/', json={}).status_code, 400)
            response = self.client.post(BASE + 'auth/login/', json={}, headers={'X-Forwarded-For': '203.0.113.20'})
            self.assertEqual(response.status_code, 429)
            self.assertEqual(response.json()['code'], 'rate_limited')
            self.assertIn('retry-after', response.headers)
        response = self.client.options(BASE, headers={
            'Origin': 'http://localhost:4010', 'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'Authorization,Idempotency-Key,If-Match',
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['access-control-allow-origin'], 'http://localhost:4010')

    def test_pkce_single_use_exchange(self):
        verifier = 'v' * 43
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
        redirect = 'http://127.0.0.1:43123/callback'
        grant = self.client.post(BASE + 'auth/desktop/authorize/', json={
            'code_challenge': challenge, 'code_challenge_method': 'S256', 'redirect_uri': redirect,
        })
        self.assertEqual(grant.status_code, 200, grant.text)
        payload = {'code': grant.json()['code'], 'code_verifier': verifier, 'redirect_uri': redirect}
        self.assertEqual(self.client.post(BASE + 'auth/desktop/exchange/', json=payload).status_code, 200)
        self.assertEqual(self.client.post(BASE + 'auth/desktop/exchange/', json=payload).status_code, 400)

    def test_storage_status_export_and_backup_stream(self):
        response = self.client.post(BASE + 'settings/storage/create/', json={'name': 'local', 'storage_type': 'local'})
        self.assertEqual(response.status_code, 201, response.text)
        pk = response.json()['id']
        self.assertEqual(self.client.patch(BASE + f'settings/storage/{pk}/', json={'name': 'renamed'}).status_code, 200)
        self.assertEqual(self.client.get(BASE + 'settings/status/').status_code, 200)
        self.assertEqual(self.client.get(BASE + 'data/export/').status_code, 200)
        response = self.client.post(BASE + 'data/backups/')
        self.assertEqual(response.status_code, 201, response.text)
        filename = response.json()['items'][0]['filename']
        download = self.client.get(BASE + 'data/backups/' + filename + '/')
        self.assertEqual(download.status_code, 200, download.text[:100])
        self.assertTrue(download.content.startswith(b'PK'))
        self.assertIn('attachment', download.headers['content-disposition'])

    def test_public_pages_admin_and_invalid_requests(self):
        for path in ['/privacy-policy/', '/support/', '/admin/login/']:
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200, (path, response.text[:200]))
            self.assertIn('text/html', response.headers['content-type'])
        self.assertIn(self.client.get('/admin/', follow_redirects=False).status_code, (302, 307))
        self.assertEqual(self.client.get('/unknown/').status_code, 404)
        self.assertEqual(self.client.put(BASE + 'auth/token/', json={}).status_code, 405)
        self.assertEqual(self.client.post(BASE, content='{', headers={'Content-Type': 'application/json'}).status_code, 422)
        self.assertEqual(self.client.get(BASE + 'tags.json').status_code, 200)
        self.assertEqual(self.client.get(BASE + 'tags.json/').status_code, 200)
        with patch.object(self.config, 'allowed_hosts', ['localhost']):
            with TestClient(create_app(self.config)) as client:
                self.assertEqual(client.get('/healthz').status_code, 400)

    def test_docs_and_schema(self):
        response = self.client.get('/api/schema/')
        self.assertEqual(response.status_code, 200)
        schema = response.json()
        for path in [BASE.rstrip('/'), BASE + 'auth/token', '/api/v1/attachments/files', '/healthz']:
            self.assertIn(path, schema['paths'])
        self.assertIn('requestBody', schema['paths'][BASE.rstrip('/')]['post'])
        self.assertEqual(schema['components']['securitySchemes']['jwtAuth']['scheme'], 'bearer')
        self.assertEqual(self.client.get('/api/schema/swagger-ui/').status_code, 200)
        self.assertEqual(self.client.get('/api/schema/redoc/').status_code, 200)
