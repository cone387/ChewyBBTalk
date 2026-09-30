from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import TestCase

from .models import Attachment, User
from .storage_migration import StorageMigrationService


class StorageMigrationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='migration-owner')
        self.other = User.objects.create(username='migration-other')
        self.local = Attachment.objects.create(owner_id=str(self.user.id), storage_path='local.jpg', original_name='local.jpg', mime_type='image/jpeg', size=3)
        self.remote = Attachment.objects.create(owner_id=str(self.user.id), storage_path='remote.jpg', original_name='remote.jpg', mime_type='image/jpeg', size=3, storage_config_id='remote')
        self.foreign = Attachment.objects.create(owner_id=str(self.other.id), storage_path='foreign.jpg', original_name='foreign.jpg', mime_type='image/jpeg', size=3)
        self.service = StorageMigrationService(self.user)

    def test_preview_counts_only_current_account_and_target(self):
        self.assertEqual(self.service.get_migration_preview(None), {'total': 2, 'need_migrate': 1, 'already_on_target': 1})
        self.assertEqual(self.service.get_migration_preview('new'), {'total': 2, 'need_migrate': 2, 'already_on_target': 0})

    def test_success_updates_metadata_only_after_target_write(self):
        source = Mock(get_file=Mock(return_value=b'abc'))
        target = Mock(save_file=Mock(return_value=SimpleNamespace(storage_path='new-path.jpg')))
        with patch.object(self.service, '_get_engine', side_effect=lambda config: target if config is None else source):
            result = self.service.migrate(None)
        self.remote.refresh_from_db(); self.foreign.refresh_from_db()
        self.assertEqual(result['migrated'], 1)
        self.assertEqual(result['skipped'], 1)
        self.assertEqual(self.remote.storage_path, 'new-path.jpg')
        self.assertEqual(self.remote.storage_config_id, '')
        self.assertEqual(self.foreign.storage_path, 'foreign.jpg')
        target.save_file.assert_called_once_with(content=b'abc', original_name='remote.jpg', storage_path='remote.jpg')

    def test_failed_read_or_write_preserves_original_metadata(self):
        for stage in ['read', 'write']:
            with self.subTest(stage=stage):
                service = StorageMigrationService(self.user)
                source = Mock(get_file=Mock(return_value=b'abc'))
                target = Mock(save_file=Mock(return_value=SimpleNamespace(storage_path='new.jpg')))
                if stage == 'read': source.get_file.side_effect = OSError('missing source')
                else: target.save_file.side_effect = OSError('target unavailable')
                with patch.object(service, '_get_engine', side_effect=lambda config: target if config is None else source):
                    result = service.migrate(None)
                self.remote.refresh_from_db()
                self.assertEqual(result['failed'], 1)
                self.assertEqual(result['migrated'], 0)
                self.assertEqual(self.remote.storage_path, 'remote.jpg')
                self.assertEqual(self.remote.storage_config_id, 'remote')
                self.assertEqual(len(result['errors']), 1)

    def test_invalid_target_fails_before_copying_any_attachment(self):
        with self.assertRaises(ValueError):
            self.service.migrate('999999')
        self.local.refresh_from_db()
        self.assertEqual(self.local.storage_path, 'local.jpg')

    def test_s3_constructor_sets_private_defaults_and_optional_endpoint(self):
        settings = Mock(get_s3_config=Mock(return_value={'access_key_id': 'test-access', 'secret_access_key': 'test-secret', 'bucket_name': 'bucket', 'endpoint_url': 'https://s3.example.com', 'custom_domain': 'cdn.example.com'}))
        with patch('storages.backends.s3boto3.S3Boto3Storage') as constructor:
            self.service._build_s3_storage(settings)
        self.assertEqual(constructor.call_args.kwargs['default_acl'], 'private')
        self.assertTrue(constructor.call_args.kwargs['querystring_auth'])
        self.assertEqual(constructor.call_args.kwargs['endpoint_url'], 'https://s3.example.com')
        self.assertEqual(constructor.call_args.kwargs['custom_domain'], 'cdn.example.com')
