from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from bbtalk.authentication import create_user_with_password
from bbtalk.models import User

class AuthPolicyTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        create_user_with_password(username='existing', password='existing-password')

    @override_settings(REGISTRATION_ENABLED=False)
    def test_closed_registration_does_not_block_existing_login(self):
        policy = self.client.get('/api/v1/bbtalk/auth/policy/', HTTP_AUTHORIZATION='Bearer invalid')
        self.assertEqual(policy.status_code, 200)
        self.assertFalse(policy.data['registration_enabled'])
        self.assertEqual(policy['Cache-Control'], 'no-store')
        rejected = self.client.post('/api/v1/bbtalk/auth/register/', {'username': 'new', 'password': 'password'})
        self.assertEqual(rejected.status_code, 403)
        self.assertEqual(rejected.data['code'], 'registration_disabled')
        self.assertFalse(User.objects.filter(username='new').exists())
        response = self.client.post('/api/v1/bbtalk/auth/token/', {'username': 'existing', 'password': 'existing-password'})
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)

    @override_settings(AUTH_LOGIN_RATE='1/minute')
    def test_login_limit_shared_with_legacy_login_and_not_bypassed_by_forwarded_header(self):
        self.assertEqual(self.client.post('/api/v1/bbtalk/auth/token/', {'username': 'existing', 'password': 'wrong'}).status_code, 400)
        response = self.client.post('/api/v1/bbtalk/auth/login/', {'username': 'existing', 'password': 'existing-password'}, HTTP_X_FORWARDED_FOR='203.0.113.9')
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.data['code'], 'rate_limited')
        self.assertIn('秒后重试', response.data['error'])
        self.assertGreater(int(response['Retry-After']), 0)
        response = self.client.post('/api/v1/bbtalk/auth/token/', {'username': 'existing', 'password': 'existing-password'}, REMOTE_ADDR='203.0.113.10')
        self.assertEqual(response.status_code, 200)

    @override_settings(REGISTRATION_ENABLED=True, AUTH_REGISTRATION_RATE='1/minute', AUTH_REFRESH_RATE='1/minute')
    def test_registration_and_refresh_have_independent_limits(self):
        self.assertEqual(self.client.post('/api/v1/bbtalk/auth/register/', {'username': 'new', 'password': 'password'}).status_code, 201)
        self.assertEqual(self.client.post('/api/v1/bbtalk/auth/register/', {'username': 'next', 'password': 'password'}).status_code, 429)
        self.assertFalse(User.objects.filter(username='next').exists())
        self.assertEqual(self.client.post('/api/v1/bbtalk/auth/token/refresh/', {'refresh': 'invalid'}).status_code, 401)
        self.assertEqual(self.client.post('/api/v1/bbtalk/auth/token/refresh/', {'refresh': 'invalid'}).status_code, 429)

    @override_settings(AUTH_LOGIN_RATE='')
    def test_empty_rate_explicitly_disables_the_limit(self):
        for _ in range(3):
            self.assertEqual(self.client.post('/api/v1/bbtalk/auth/token/', {}).status_code, 400)
