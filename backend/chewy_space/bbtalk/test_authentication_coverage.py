"""Coverage for bbtalk.authentication: backend, session auth, bearer token parsing."""
from django.contrib.auth.models import AnonymousUser
from django.http import HttpRequest
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from django.test import TestCase

from .authentication import (
    SessionAuthentication,
    TokenAuthentication,
    UserBackend,
    authenticate_with_password,
    create_user_with_password,
)
from .models import Identity, User


class UserBackendTests(TestCase):
    def setUp(self):
        self.backend = UserBackend()
        self.user = create_user_with_password('backend-user', 'secret-pass')
        self.password_identity = Identity.objects.get(user=self.user, identity_type='password')

    def test_authenticate_requires_both_credentials(self):
        self.assertIsNone(self.backend.authenticate(HttpRequest(), username=None, password='x'))
        self.assertIsNone(self.backend.authenticate(HttpRequest(), username='backend-user', password=None))

    def test_authenticate_updates_login_timestamps_and_returns_user(self):
        self.password_identity.last_used = None
        self.password_identity.save(update_fields=['last_used'])
        User.objects.filter(pk=self.user.pk).update(last_login=None)
        result = self.backend.authenticate(HttpRequest(), username='backend-user', password='secret-pass')
        self.assertEqual(result.pk, self.user.pk)
        self.password_identity.refresh_from_db()
        self.user.refresh_from_db()
        self.assertIsNotNone(self.password_identity.last_used)
        self.assertIsNotNone(self.user.last_login)

    def test_authenticate_rejects_unknown_user_wrong_password_and_inactive(self):
        self.assertIsNone(self.backend.authenticate(HttpRequest(), username='ghost', password='x'))
        self.assertIsNone(self.backend.authenticate(HttpRequest(), username='backend-user', password='wrong'))
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        self.assertIsNone(self.backend.authenticate(HttpRequest(), username='backend-user', password='secret-pass'))

    def test_authenticate_returns_none_when_identity_belongs_to_other_identifier(self):
        # Password identity exists for the user but under a different identifier.
        Identity.objects.filter(pk=self.password_identity.pk).update(identifier='someone-else')
        self.assertIsNone(self.backend.authenticate(HttpRequest(), username='backend-user', password='secret-pass'))

    def test_get_user_variants(self):
        self.assertEqual(self.backend.get_user(self.user.pk).pk, self.user.pk)
        self.assertIsNone(self.backend.get_user(999999))
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        self.assertIsNone(self.backend.get_user(self.user.pk))


class SessionAuthenticationTests(TestCase):
    def setUp(self):
        self.user = create_user_with_password('session-user', 'secret-pass')
        self.auth = SessionAuthentication()

    def make_request(self, user, method='GET'):
        request = Request(HttpRequest())
        request._request.method = method
        request._request.user = user
        return request

    def test_unauthenticated_requests_are_ignored(self):
        self.assertIsNone(self.auth.authenticate(self.make_request(AnonymousUser())))
        self.assertIsNone(self.auth.authenticate(self.make_request(None)))

    def test_authenticated_safe_request_returns_tuple(self):
        result = self.auth.authenticate(self.make_request(self.user))
        self.assertEqual(result, (self.user, None))

    def test_unsafe_request_without_csrf_token_is_rejected(self):
        request = self.make_request(self.user, method='POST')
        with self.assertRaises(Exception) as ctx:
            self.auth.authenticate(request)
        self.assertIn('CSRF', str(ctx.exception))


class TokenAuthenticationTests(TestCase):
    def setUp(self):
        self.auth = TokenAuthentication()
        self.factory = APIRequestFactory()

    def drf_request(self, **headers):
        return Request(self.factory.get('/', **headers))

    def test_missing_or_foreign_authorization_headers_are_ignored(self):
        self.assertIsNone(self.auth.authenticate(self.drf_request()))
        self.assertIsNone(self.auth.authenticate(self.drf_request(HTTP_AUTHORIZATION='Token abcdef')))
        self.assertIsNone(self.auth.authenticate(self.drf_request(HTTP_AUTHORIZATION='Basic dXNlcjpwYXNz')))

    def test_malformed_bearer_headers_raise(self):
        with self.assertRaisesMessage(AuthenticationFailed, 'No credentials'):
            self.auth.authenticate(self.drf_request(HTTP_AUTHORIZATION='Bearer'))
        with self.assertRaisesMessage(AuthenticationFailed, 'spaces'):
            self.auth.authenticate(self.drf_request(HTTP_AUTHORIZATION='Bearer a b c'))
        request = self.drf_request()
        request._request.META['HTTP_AUTHORIZATION'] = 'Bearer \xff\xfe'
        with self.assertRaisesMessage(AuthenticationFailed, 'invalid characters'):
            self.auth.authenticate(request)

    def test_any_valid_bearer_token_is_rejected_as_unimplemented(self):
        with self.assertRaisesMessage(AuthenticationFailed, 'not implemented'):
            self.auth.authenticate(self.drf_request(HTTP_AUTHORIZATION='Bearer whatever-token'))
        with self.assertRaisesMessage(AuthenticationFailed, 'not implemented'):
            self.auth.authenticate_credentials('direct-key')

    def test_authenticate_header_advertises_bearer_scheme(self):
        self.assertEqual(self.auth.authenticate_header(self.drf_request()), 'Bearer')


class HelperFunctionTests(TestCase):
    def test_authenticate_with_password_handles_missing_user(self):
        self.assertIsNone(authenticate_with_password('does-not-exist', 'whatever'))
        self.assertIsNone(authenticate_with_password(None, None))

    def test_create_user_with_password_sets_defaults_and_display_name(self):
        user = create_user_with_password('helper-user', 'pw', email='h@example.com')
        identity = Identity.objects.get(user=user, identity_type='password')
        self.assertEqual(identity.identifier, 'helper-user')
        self.assertTrue(identity.is_verified)
        self.assertTrue(identity.is_primary)
        self.assertTrue(identity.check_password('pw'))
        self.assertEqual(user.display_name, 'helper-user')
        self.assertEqual(user.email, 'h@example.com')
        named = create_user_with_password('helper-named', 'pw', display_name='Shown Name')
        self.assertEqual(named.display_name, 'Shown Name')
