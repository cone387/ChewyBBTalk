from datetime import timedelta
from unittest.mock import patch
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from .authentication import create_user_with_password, authenticate_with_password
from .models import PasswordRecovery


@override_settings(PASSWORD_RECOVERY_ENABLED=True, EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', PASSWORD_RECOVERY_RATE='100/minute')
class PasswordRecoveryTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = create_user_with_password('owner', 'Original-Pass-738!', email='owner@example.com')
        self.new_password = 'Updated-Pass-862!'

    def request_code(self):
        response = self.client.post('/api/v1/bbtalk/auth/password/request/', {'username': 'owner', 'email': 'owner@example.com'})
        self.assertEqual(response.status_code, 200)
        return mail.outbox[-1].body.split('\n\n')[1]

    def confirm(self, code):
        return self.client.post('/api/v1/bbtalk/auth/password/confirm/', {'username': 'owner', 'code': code, 'new_password': self.new_password})

    def login(self):
        return self.client.post('/api/v1/bbtalk/auth/token/', {'username': 'owner', 'password': 'Original-Pass-738!'}).data

    def test_single_use_reset_revokes_access_and_refresh(self):
        tokens = self.login()
        code = self.request_code()
        self.assertEqual(len(code), 32)
        self.assertNotEqual(PasswordRecovery.objects.get(user=self.user).code_hash, code)
        self.assertEqual(self.confirm(code).status_code, 200)
        self.assertIsNotNone(authenticate_with_password('owner', self.new_password))
        self.assertEqual(self.confirm(code).status_code, 400)
        self.assertEqual(self.client.get('/api/v1/bbtalk/user/me/', HTTP_AUTHORIZATION='Bearer ' + tokens['access']).status_code, 401)
        self.assertEqual(self.client.post('/api/v1/bbtalk/auth/token/refresh/', {'refresh': tokens['refresh']}).status_code, 401)
        fresh = self.client.post('/api/v1/bbtalk/auth/token/', {'username': 'owner', 'password': self.new_password})
        self.assertEqual(fresh.status_code, 200)
        self.assertEqual(self.client.get('/api/v1/bbtalk/user/me/', HTTP_AUTHORIZATION='Bearer ' + fresh.data['access']).status_code, 200)
        self.assertEqual(self.client.post('/api/v1/bbtalk/auth/token/refresh/', {'refresh': fresh.data['refresh']}).status_code, 200)

    def test_unknown_user_and_mismatched_email_have_same_response(self):
        responses = [self.client.post('/api/v1/bbtalk/auth/password/request/', body) for body in [
            {'username': 'owner', 'email': 'owner@example.com'},
            {'username': 'unknown', 'email': 'owner@example.com'},
            {'username': 'owner', 'email': 'wrong@example.com'},
        ]]
        self.assertEqual(responses[0].data, responses[1].data)
        self.assertEqual(responses[1].data, responses[2].data)
        self.assertEqual(len(mail.outbox), 1)

    def test_expired_wrong_and_replaced_codes_cannot_reset(self):
        old_code = self.request_code()
        new_code = self.request_code()
        self.assertEqual(self.confirm(old_code).status_code, 400)
        self.assertEqual(self.confirm('x' * 32).status_code, 400)
        PasswordRecovery.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.confirm(new_code).status_code, 400)
        self.assertIsNotNone(authenticate_with_password('owner', 'Original-Pass-738!'))

    def test_email_change_invalidates_code(self):
        code = self.request_code()
        self.user.email = 'new@example.com'; self.user.save()
        self.assertEqual(self.confirm(code).status_code, 400)

    def test_invalid_password_does_not_consume_code(self):
        code = self.request_code()
        response = self.client.post('/api/v1/bbtalk/auth/password/confirm/', {'username': 'owner', 'code': code, 'new_password': '12345678'})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.confirm(code).status_code, 200)

    def test_change_password_requires_old_password_and_revokes_tokens(self):
        tokens = self.login()
        headers = {'HTTP_AUTHORIZATION': 'Bearer ' + tokens['access']}
        response = self.client.post('/api/v1/bbtalk/user/change-password/', {'old_password': 'wrong', 'new_password': self.new_password}, **headers)
        self.assertEqual(response.status_code, 400)
        response = self.client.post('/api/v1/bbtalk/user/change-password/', {'old_password': 'Original-Pass-738!', 'new_password': self.new_password}, **headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get('/api/v1/bbtalk/user/me/', **headers).status_code, 401)

    @override_settings(PASSWORD_RECOVERY_ENABLED=False)
    def test_disabled_recovery_never_claims_mail_was_sent(self):
        response = self.client.post('/api/v1/bbtalk/auth/password/request/', {'username': 'owner', 'email': 'owner@example.com'})
        self.assertEqual(response.status_code, 503)
        self.assertFalse(PasswordRecovery.objects.exists())
        self.assertFalse(self.client.get('/api/v1/bbtalk/auth/policy/').data['password_recovery_enabled'])

    @override_settings(PASSWORD_RECOVERY_RATE='1/minute')
    def test_account_rate_limit_cannot_be_bypassed_with_another_peer(self):
        self.request_code()
        response = self.client.post('/api/v1/bbtalk/auth/password/request/', {'username': 'owner', 'email': 'owner@example.com'}, REMOTE_ADDR='203.0.113.10')
        self.assertEqual(response.status_code, 429)

    @patch('bbtalk.password_recovery.send_mail', side_effect=RuntimeError('provider failure'))
    def test_mail_failure_drops_undelivered_token(self, _send):
        response = self.client.post('/api/v1/bbtalk/auth/password/request/', {'username': 'owner', 'email': 'owner@example.com'})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(PasswordRecovery.objects.exists())
        self.assertNotIn('provider failure', str(response.data))
