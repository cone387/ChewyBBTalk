import json

from core.public_config import DEFAULTS


def test_public_config_is_unauthenticated_uncached_and_allowlisted(client, monkeypatch):
    monkeypatch.setenv('SECRET_KEY', 'must-not-leak-signing-key')
    monkeypatch.setenv('EMAIL_HOST_PASSWORD', 'must-not-leak-mail-password')
    monkeypatch.setenv('VITE_UNKNOWN_SECRET', 'must-not-leak-even-with-vite-prefix')
    monkeypatch.setenv('VITE_SITE_NAME', '</script><script>alert(1)</script>')
    monkeypatch.setenv('VITE_API_BASE_URL', '')
    client.headers.pop('Authorization')
    response = client.get('/api/public-config')
    assert response.status_code == 200
    assert response.headers['content-type'].startswith('application/javascript')
    assert response.headers['cache-control'] == 'no-store'
    assert response.headers['x-content-type-options'] == 'nosniff'
    assert 'must-not-leak' not in response.text
    assert '</script>' not in response.text
    payload = json.loads(
        response.text.removeprefix('window.__BBTALK_CONFIG__ = ').removesuffix(';')
    )
    assert set(payload) == set(DEFAULTS)
    assert payload['VITE_SITE_NAME'] == '</script><script>alert(1)</script>'
    assert payload['VITE_API_BASE_URL'] == ''
    monkeypatch.setenv('VITE_SITE_NAME', 'Updated site')
    assert 'Updated site' in client.get('/api/public-config').text
    assert client.head('/api/public-config').status_code == 200
