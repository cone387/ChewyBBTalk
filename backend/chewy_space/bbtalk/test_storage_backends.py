from unittest.mock import Mock, patch

from django.core.files.storage import default_storage
from django.test import TestCase
from chewy_attachment.core.exceptions import StorageException

from .models import User, UserStorageSettings
from .storage import UserS3Storage, get_storage_for_user, get_user_storage
from .storage_provider import UserStorageConfigProvider


class StorageBackendTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='storage-owner')
        self.provider = UserStorageConfigProvider()

    def configured(self, **overrides):
        return UserStorageSettings.objects.create(user=self.user, name='s3', is_active=True,
            s3_access_key_id='test-access', s3_secret_access_key='test-secret', s3_bucket_name='test-bucket', **overrides)

    def test_local_fallback_without_s3_configuration(self):
        self.assertIsNone(get_user_storage(self.user))
        self.assertIs(get_storage_for_user(self.user), default_storage)
        self.assertIsNone(self.provider.get_default_config())

    def test_inactive_or_incomplete_settings_never_open_s3_connections(self):
        settings = UserStorageSettings.objects.create(user=self.user, name='empty', is_active=True)
        self.assertIsNone(get_user_storage(self.user))
        settings.delete()
        configured = self.configured()
        configured.is_active = False; configured.save()
        self.assertIsNone(get_user_storage(self.user))

    def test_active_configuration_is_used_even_when_an_older_inactive_one_exists(self):
        UserStorageSettings.objects.create(user=self.user, name='old-inactive')
        configured = self.configured()
        with patch('bbtalk.storage.UserS3Storage') as constructor:
            self.assertIs(get_user_storage(self.user), constructor.return_value)
        self.assertEqual(constructor.call_args.kwargs['user_settings'].pk, configured.pk)

    def test_active_s3_configuration_is_selected(self):
        configured = self.configured()
        with patch('bbtalk.storage.UserS3Storage') as constructor:
            self.assertIs(get_storage_for_user(self.user), constructor.return_value)
        self.assertEqual(constructor.call_args.kwargs['user_settings'].pk, configured.pk)

    def test_lookup_errors_fall_back_to_local_storage(self):
        with patch('bbtalk.models.UserStorageSettings.objects.filter', side_effect=RuntimeError('database unavailable')):
            self.assertIs(get_storage_for_user(self.user), default_storage)

    def test_s3_constructor_accepts_models_and_dicts_with_private_defaults(self):
        configured = self.configured(s3_endpoint_url='https://s3.example.com', s3_custom_domain='cdn.example.com')
        for source in [configured, configured.get_s3_config()]:
            with self.subTest(source=type(source)), patch('storages.backends.s3boto3.S3Boto3Storage.__init__', return_value=None) as constructor:
                UserS3Storage(source)
                kwargs = constructor.call_args.kwargs
                self.assertEqual(kwargs['secret_key'], 'test-secret')
                self.assertEqual(kwargs['bucket_name'], 'test-bucket')
                self.assertEqual(kwargs['endpoint_url'], 'https://s3.example.com')
                self.assertEqual(kwargs['custom_domain'], 'cdn.example.com')
                self.assertEqual(kwargs['default_acl'], 'private')
                self.assertTrue(kwargs['querystring_auth'])
                self.assertFalse(kwargs['file_overwrite'])

    def test_s3_constructor_respects_explicit_options_and_no_configuration(self):
        with patch('storages.backends.s3boto3.S3Boto3Storage.__init__', return_value=None) as constructor:
            UserS3Storage(None, bucket_name='default-bucket')
            self.assertEqual(constructor.call_args.kwargs, {'bucket_name': 'default-bucket'})
            UserS3Storage({'bucket_name': 'bucket'}, default_acl='public-read', querystring_auth=False)
            self.assertEqual(constructor.call_args.kwargs['default_acl'], 'public-read')
            self.assertFalse(constructor.call_args.kwargs['querystring_auth'])
            self.assertNotIn('endpoint_url', constructor.call_args.kwargs)

    def test_provider_returns_decrypted_private_configuration(self):
        configured = self.configured()
        schema = self.provider.get_config(str(configured.pk))
        self.assertEqual(schema.config_id, str(configured.pk))
        self.assertEqual(schema.secret_key, 'test-secret')
        self.assertFalse(schema.public_read)
        self.assertEqual(schema.prefix, 'attachments')

    def test_provider_rejects_empty_missing_inactive_and_incomplete_settings(self):
        settings = UserStorageSettings.objects.create(user=self.user, name='incomplete', is_active=True)
        for config in ['', '999999', str(settings.pk)]:
            with self.subTest(config=config), self.assertRaises(StorageException):
                self.provider.get_config(config)
        settings.delete()
        configured = self.configured(); configured.is_active = False; configured.save()
        with self.assertRaises(StorageException):
            self.provider.get_config(str(configured.pk))

    def test_provider_translates_unexpected_lookup_errors(self):
        with patch('bbtalk.models.UserStorageSettings.objects.filter', side_effect=RuntimeError('database unavailable')):
            with self.assertRaises(StorageException):
                self.provider.get_config('1')
