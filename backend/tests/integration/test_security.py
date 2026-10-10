import base64
import hashlib
from datetime import timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from core.errors import APIError
from models import Identity, PasswordRecovery, User, now
from services.security import (
    Limiter,
    check_password,
    decrypt_secret,
    encrypt_secret,
    make_password,
)

BASE = '/api/v1/bbtalk/'


@pytest.mark.parametrize('value', ['', 'not-a-hash', '!disabled', 'pbkdf2_sha256$bad$salt$hash', 'unknown$1$salt$hash'])
def test_bad_hashes(value):
    assert not check_password('password', value)


def test_legacy_hash_algorithms():
    for algorithm in ('sha1', 'sha256'):
        expected = base64.b64encode(hashlib.pbkdf2_hmac(algorithm, b'password', b'salt', 100)).decode()
        encoded = f'pbkdf2_{algorithm}$100$salt${expected}'
        assert check_password('password', encoded)
        assert not check_password('wrong', encoded)
    value = base64.b64encode(hashlib.scrypt(b'password', salt=b'salt', n=1024, r=8, p=1, dklen=64)).decode()
    assert check_password('password', f'scrypt$1024$salt$8$1${value}')
    assert not check_password(None, make_password('test'))


def test_secret_compatibility(app):
    settings = app.state.settings
    assert encrypt_secret('', settings) == ''
    assert decrypt_secret('legacy-plaintext', settings) == 'legacy-plaintext'
    encrypted = encrypt_secret('secret', settings)
    assert encrypt_secret(encrypted, settings) == encrypted
    assert decrypt_secret(encrypted, settings) == 'secret'
    with pytest.raises(ValueError, match='无法解密'):
        decrypt_secret('enc:v1:bad', settings)


def test_limiter_expiry_scope_and_peer():
    limiter = Limiter()
    with patch('services.security.time.monotonic', return_value=100):
        limiter.check('login', 'peer', '1/minute')
        limiter.check('register', 'peer', '1/minute')
        limiter.check('login', 'other', '1/minute')
        with pytest.raises(APIError) as raised:
            limiter.check('login', 'peer', '1/minute')
        assert raised.value.status == 429
    with patch('services.security.time.monotonic', return_value=161):
        limiter.check('login', 'peer', '1/minute')
    with patch('services.security.time.monotonic', return_value=100000):
        limiter.check('login', 'peer', '1/minute')
        assert len(limiter.history) == 1


def test_registration_policy_duplicates_and_credentials(app, client):
    app.state.settings.registration_enabled = False
    assert client.post(BASE+'auth/register/', json={'username':'new','password':'new'}).status_code == 403
    app.state.settings.registration_enabled = True
    for payload in ({}, {'username':'owner','password':'duplicate'}, {'username':' ', 'password':'x'}):
        assert client.post(BASE+'auth/register/', json=payload).status_code == 400
    for payload in ({}, {'username':'owner','password':'wrong'}, {'username':'missing','password':'wrong'}):
        assert client.post(BASE+'auth/token/', json=payload).status_code == 400
    assert client.post(BASE+'auth/token/blacklist/', json={}).status_code == 400
    assert client.post(BASE+'auth/token/refresh/', json={'refresh':app.state.tokens['access']}).status_code == 401
    with TestClient(app) as anonymous:
        assert anonymous.get(BASE).status_code == 401
        assert anonymous.get(BASE,headers={'Authorization':'Bearer invalid'}).status_code == 401


def test_password_change_revokes_access_refresh_and_sessions(app, client):
    with TestClient(app) as browser:
        assert browser.post(BASE+'auth/login/',json={'username':'owner','password':'test-password-2026'}).status_code == 200
        assert client.post(BASE+'user/change-password/',json={'old_password':'wrong','new_password':'a-good-new-password'}).status_code == 400
        assert client.post(BASE+'user/change-password/',json={'old_password':'test-password-2026','new_password':'12345678'}).status_code == 400
        assert client.post(BASE+'user/change-password/',json={'old_password':'test-password-2026','new_password':'a-good-new-password'}).status_code == 200
        assert client.get(BASE+'user/me/').status_code == 401
        assert browser.get(BASE+'user/me/').status_code == 401
        assert browser.post(BASE+'auth/token/refresh/',json={'refresh':app.state.tokens['refresh']}).status_code == 401
        assert browser.post(BASE+'auth/token/',json={'username':'owner','password':'a-good-new-password'}).status_code == 200


def test_recovery_single_use_disabled_mail_failure_and_non_enumeration(app, client):
    payload = {'username':'owner','email':'owner@example.com'}
    assert client.post(BASE+'auth/password/request/',json=payload).status_code == 503
    app.state.settings.recovery_enabled = True
    sent = []
    app.state.send_recovery_email = lambda email, code: sent.append((email, code))
    first = client.post(BASE+'auth/password/request/',json=payload)
    unknown = client.post(BASE+'auth/password/request/',json={'username':'missing','email':'owner@example.com'})
    assert first.json() == unknown.json()
    assert len(sent) == 1
    confirm = {'username':'owner','code':sent[0][1],'new_password':'recovered-password-2026'}
    assert client.post(BASE+'auth/password/confirm/',json={**confirm, 'code':'x'*32}).status_code == 400
    assert client.post(BASE+'auth/password/confirm/',json=confirm).status_code == 200
    assert client.post(BASE+'auth/password/confirm/',json=confirm).status_code == 400
    assert client.get(BASE+'user/me/').status_code == 401
    app.state.send_recovery_email = lambda *_: (_ for _ in ()).throw(OSError('smtp'))
    client.headers.pop('Authorization')
    assert client.post(BASE+'auth/password/request/',json=payload).status_code == 200
    with app.state.sessions() as db:
        assert db.scalar(select(PasswordRecovery)) is None


def test_admin_authorization_csrf_and_privilege_revocation(app, client):
    with TestClient(app) as admin:
        assert admin.get('/admin/').status_code == 200
        assert 'login' in str(admin.get('/admin/').url)
        assert admin.post('/admin/login',data={'username':'owner','password':'test-password-2026'}).status_code == 403
        with app.state.sessions() as db:
            user=db.get(User, app.state.owner_id)
            user.is_staff=True
            db.commit()
        response=admin.post('/admin/login',data={'username':'owner','password':'test-password-2026'},headers={'Origin':'http://testserver'})
        assert response.status_code == 200, response.text
        assert 'login' not in str(response.url)
        assert admin.get('/admin/user/list').status_code == 200
        with app.state.sessions() as db:
            db.get(User, app.state.owner_id).is_staff=False
            db.commit()
        assert 'login' in str(admin.get('/admin/').url)


def test_account_deletion_cascades_and_preserves_other_users(app, client):
    record = client.post(BASE,json={'content':'delete me','post_tags':'tag'}).json()
    client.post(BASE+record['uid']+'/comments/',json={'content':'comment'})
    assert client.post(BASE+'user/delete-account/',json={'password':'wrong'}).status_code == 400
    assert client.post(BASE+'user/delete-account/',json={'password':'test-password-2026'}).status_code == 200
    assert client.get(BASE).status_code == 401
    with app.state.sessions() as db:
        assert db.scalar(select(User)) is None
        assert db.scalar(select(Identity)) is None


def test_smtp_tls_ssl_and_optional_credentials(monkeypatch):
    from services.accounts import send_recovery_email
    monkeypatch.setenv('EMAIL_HOST','smtp.example.com')
    monkeypatch.setenv('EMAIL_HOST_USER','mailer')
    monkeypatch.setenv('EMAIL_HOST_PASSWORD','mail-secret')
    monkeypatch.setenv('EMAIL_USE_SSL','false')
    monkeypatch.setenv('EMAIL_USE_TLS','true')
    with patch('services.accounts.smtplib.SMTP') as smtp:
        send_recovery_email('person@example.com','recovery-code')
        server=smtp.return_value.__enter__.return_value
        server.starttls.assert_called_once()
        server.login.assert_called_once_with('mailer','mail-secret')
        assert server.send_message.call_args.args[0]['To']=='person@example.com'
    monkeypatch.setenv('EMAIL_USE_SSL','true')
    monkeypatch.delenv('EMAIL_HOST_USER')
    with patch('services.accounts.smtplib.SMTP_SSL') as smtp:
        send_recovery_email('person@example.com','recovery-code')
        server=smtp.return_value.__enter__.return_value
        server.starttls.assert_not_called()
        server.login.assert_not_called()


def test_blacklist_cannot_revoke_another_users_token(app,client):
    from services.security import token_pair
    with app.state.sessions() as db:
        other=User(username='other-token'); db.add(other); db.flush()
        tokens=token_pair(db,other,app.state.settings); db.commit()
    assert client.post(BASE+'auth/token/blacklist/',json={'refresh':tokens['refresh']}).status_code==403
    assert client.post(BASE+'auth/token/refresh/',json={'refresh':tokens['refresh']}).status_code==200


def test_signed_refresh_without_outstanding_row_is_consumed(app,client):
    from uuid import uuid4

    import jwt

    from models import now
    payload={'exp':now()+timedelta(days=1),'user_id':app.state.owner_id,'jti':uuid4().hex,'token_type':'refresh','credential_version':0}
    token=jwt.encode(payload,app.state.settings.secret_key,algorithm='HS256')
    assert client.post(BASE+'auth/token/refresh/',json={'refresh':token}).status_code==200
    assert client.post(BASE+'auth/token/refresh/',json={'refresh':token}).status_code==401


def test_sessions_replace_expire_and_reject_inactive_users(app):
    from models import SessionToken
    from services.security import digest
    with TestClient(app) as browser:
        credentials={'username':'owner','password':'test-password-2026'}
        browser.post(BASE+'auth/login/',json=credentials)
        first=browser.cookies['sessionid']
        browser.post(BASE+'auth/login/',json=credentials)
        second=browser.cookies['sessionid']
        assert first!=second
        with app.state.sessions() as db:
            assert db.get(SessionToken,digest(first)) is None
            db.get(User,app.state.owner_id).is_active=False; db.commit()
        assert browser.get(BASE).status_code==401
        with app.state.sessions() as db:
            db.get(User,app.state.owner_id).is_active=True
            db.get(SessionToken,digest(second)).expires_at=now()-timedelta(seconds=1)
            db.commit()
        assert browser.get(BASE,headers={'Authorization':'Basic unsupported'}).status_code==401


def test_admin_denial_and_logout(app):
    with TestClient(app) as browser:
        credentials={'username':'owner','password':'test-password-2026'}
        assert browser.post('/admin/login',data=credentials,headers={'Origin':'http://testserver'}).status_code==400
        with app.state.sessions() as db:
            db.get(User,app.state.owner_id).is_staff=True; db.commit()
        assert browser.post('/admin/login',data=credentials,headers={'Origin':'http://testserver'}).status_code==200
        assert browser.get('/admin/logout').status_code==200
        assert 'login' in str(browser.get('/admin/').url)


@pytest.mark.parametrize('redirect',['https://127.0.0.1:15000/callback','http://localhost:15000/callback','http://127.0.0.1:80/callback','http://127.0.0.1:bad/callback','http://[invalid','http://user:pw@127.0.0.1:15000/callback','http://127.0.0.1:15000/callback?code=x'])
def test_invalid_pkce_requests(client,redirect):
    payload={'code_challenge':'a'*43,'code_challenge_method':'S256','redirect_uri':redirect}
    assert client.post(BASE+'auth/desktop/authorize/',json=payload).status_code==400
    assert client.post(BASE+'auth/desktop/exchange/',json={'code':'a'*43,'code_verifier':'a'*43,'redirect_uri':redirect}).status_code==400


def test_pkce_wrong_verifier_does_not_consume_code_and_inactive_denied(app,client):
    verifier='a'*43
    challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    redirect='http://127.0.0.1:15000/callback'
    code=client.post(BASE+'auth/desktop/authorize/',json={'code_challenge':challenge,'code_challenge_method':'S256','redirect_uri':redirect}).json()['code']
    payload={'code':code,'code_verifier':'b'*43,'redirect_uri':redirect}
    assert client.post(BASE+'auth/desktop/exchange/',json=payload).status_code==400
    with app.state.sessions() as db:
        db.get(User,app.state.owner_id).is_active=False; db.commit()
    assert client.post(BASE+'auth/desktop/exchange/',json={**payload,'code_verifier':verifier}).status_code==400
