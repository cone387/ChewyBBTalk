import base64
import hashlib
from datetime import timedelta
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from .authentication import create_user_with_password
from .models import DesktopAuthorization


@override_settings(AUTH_LOGIN_RATE='')
class DesktopAuthTests(TestCase):
    def setUp(self):
        self.user = create_user_with_password('desktop', 'password')
        self.client = APIClient()
        self.verifier = 'v' * 43
        self.redirect = 'http://127.0.0.1:54321/callback'
        self.request = {
            'code_challenge': base64.urlsafe_b64encode(hashlib.sha256(self.verifier.encode()).digest()).decode().rstrip('='),
            'code_challenge_method': 'S256', 'redirect_uri': self.redirect,
        }

    def grant(self):
        self.client.force_authenticate(self.user)
        response = self.client.post('/api/v1/bbtalk/auth/desktop/authorize/', self.request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Cache-Control'], 'no-store')
        self.client.force_authenticate(None)
        return response.data['code']

    def exchange(self, code, **overrides):
        return self.client.post('/api/v1/bbtalk/auth/desktop/exchange/', {
            'code': code, 'code_verifier': self.verifier, 'redirect_uri': self.redirect, **overrides})

    def test_requires_consent_and_safe_callback(self):
        self.assertIn(self.client.post('/api/v1/bbtalk/auth/desktop/authorize/', self.request).status_code, (401, 403))
        self.client.force_authenticate(self.user)
        for redirect in ('https://evil.test/callback', 'http://localhost:5000/callback', 'http://127.0.0.1:5000/callback?x=1'):
            self.assertEqual(self.client.post('/api/v1/bbtalk/auth/desktop/authorize/', {**self.request, 'redirect_uri': redirect}).status_code, 400)

    def test_pkce_redirect_and_single_use(self):
        code = self.grant()
        self.assertEqual(self.exchange(code, code_verifier='x' * 43).status_code, 400)
        self.assertEqual(self.exchange(code, redirect_uri='http://127.0.0.1:54322/callback').status_code, 400)
        response = self.exchange(code)
        self.assertEqual(response.status_code, 200)
        self.assertIn('refresh', response.data)
        self.assertEqual(self.exchange(code).status_code, 400)

    def test_expired_and_inactive_grants(self):
        code = self.grant()
        DesktopAuthorization.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.exchange(code).status_code, 400)
        code = self.grant()
        self.user.is_active = False
        self.user.save()
        self.assertEqual(self.exchange(code).status_code, 400)
