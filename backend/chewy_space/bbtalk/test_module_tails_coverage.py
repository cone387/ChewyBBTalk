"""Coverage for remaining branches in status_views, backups, secret_encryption, admin, backup_views."""
import json
import os
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .backups import backup_lock, backup_root, create_backup, read_status, user_directory
from .models import BBTalk, Tag, User, UserStorageSettings
from .secret_encryption import ENCRYPTED_PREFIX, decrypt_secret, encrypt_secret


class SecretEncryptionEdgeTests(TestCase):
    def test_empty_values_round_trip_unchanged(self):
        self.assertEqual(encrypt_secret(''), '')
        self.assertEqual(encrypt_secret(None), '')
        self.assertEqual(decrypt_secret(''), '')
        self.assertEqual(decrypt_secret(None), '')
        plaintext = 'already-plain'
        self.assertEqual(decrypt_secret(plaintext), plaintext)

    def test_already_encrypted_values_are_not_double_encrypted(self):
        token = ENCRYPTED_PREFIX + 'opaque-token'
        self.assertEqual(encrypt_secret(token), token)

    def test_tampered_ciphertext_raises_helpful_error(self):
        with self.assertRaisesMessage(ValueError, '无法解密'):
            decrypt_secret(ENCRYPTED_PREFIX + 'not-a-valid-fernet-token')


class StorageCheckBranchTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='check-owner')
        self.root = Path(tempfile.mkdtemp())

    def test_incomplete_active_s3_reports_configuration_error(self):
        UserStorageSettings.objects.create(
            user=self.user, storage_type='s3', is_active=True,
            s3_access_key_id='key')  # missing secret and bucket
        from .status_views import storage_check
        result = storage_check(self.user)
        self.assertEqual(result['mode'], 's3')
        self.assertEqual(result['status'], 'error')
        self.assertIn('不完整', result['message'])

    def test_server_s3_mode_uses_global_settings(self):
        UserStorageSettings.objects.all().delete()
        from . import status_views
        with override_settings(USE_S3_STORAGE=True, AWS_ACCESS_KEY_ID='global-key',
                               CHEWY_ATTACHMENT={'STORAGE_ENGINE': 's3', 'STORAGE_ROOT': self.root},
                               AWS_SECRET_ACCESS_KEY='global-secret',
                               AWS_STORAGE_BUCKET_NAME='global-bucket',
                               AWS_S3_REGION_NAME='global-region',
                               AWS_S3_ENDPOINT_URL=None):
            with patch('boto3.client') as factory:
                result = status_views.storage_check(self.user)
        self.assertEqual(result['mode'], 'server_s3')
        self.assertEqual(result['status'], 'ok')
        factory.assert_called_once_with(
            's3', aws_access_key_id='global-key', aws_secret_access_key='global-secret',
            region_name='global-region', endpoint_url=None,
            config=factory.call_args.kwargs['config'])
        factory.return_value.list_objects_v2.assert_called_once_with(Bucket='global-bucket', MaxKeys=1)

    def test_unsupported_engine_reports_unknown(self):
        from . import status_views
        with override_settings(CHEWY_ATTACHMENT={'STORAGE_ENGINE': 'azure'}):
            result = status_views.storage_check(self.user)
        self.assertEqual(result, {'mode': 'server', 'status': 'unknown',
                                  'message': '当前服务器存储引擎不支持此检查，请联系管理员'})

    def test_admin_disk_diagnostics_failure_is_reported(self):
        user = User.objects.create(username='disk-admin', is_staff=True)
        client = APIClient()
        client.force_authenticate(user)
        with override_settings(CHEWY_ATTACHMENT={'STORAGE_ENGINE': 'file', 'STORAGE_ROOT': self.root}):
            with patch('bbtalk.status_views.shutil.disk_usage', side_effect=OSError('no access')):
                data = client.get('/api/v1/bbtalk/settings/status/').data
        self.assertEqual(data['diagnostics']['attachment_disk']['status'], 'error')


class BackupsHelperBranchTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='backup-helper')

    def test_backup_root_honors_environment_override(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {'BACKUP_ROOT': directory}):
                self.assertEqual(backup_root(), Path(directory).resolve())

    def test_lock_file_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)
            with patch.object(Path, 'is_symlink', return_value=True):
                with self.assertRaisesMessage(ValueError, '备份锁不可用'):
                    with backup_lock(target):
                        pass

    def test_create_backup_requires_positive_keep(self):
        with self.assertRaisesMessage(ValueError, '保留数量'):
            create_backup(self.user, keep=0)

    def test_status_file_symlink_and_corruption_are_handled(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)
            self.assertIsNone(read_status(target))
            (target / '.status.json').write_text('{not json', encoding='utf-8')
            result = read_status(target)
            self.assertEqual(result['status'], 'unknown')
            with patch.object(Path, 'is_symlink', return_value=True):
                with self.assertRaisesMessage(ValueError, '备份状态不可用'):
                    read_status(target)

    def test_cleanup_failure_records_warning_but_keeps_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {'BACKUP_ROOT': directory}):
                current = Mock()
                stale = Mock()
                stale.unlink.side_effect = OSError('locked')
                with patch('bbtalk.backups.zip_files', return_value=[current, stale]):
                    path, deleted = create_backup(self.user, keep=1)
                self.assertTrue(path.exists())
                self.assertEqual(deleted, 0)
                status = read_status(user_directory(self.user))
                self.assertEqual(status['status'], 'success')
                self.assertIn('清理失败', status['message'])

    def test_interrupted_running_status_is_preserved_when_recheck_disagrees(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {'BACKUP_ROOT': directory}):
                directory_path = user_directory(self.user)
                directory_path.mkdir(parents=True)
                (directory_path / '.status.json').write_text(
                    json.dumps({'status': 'running'}), encoding='utf-8')
                with patch('bbtalk.backups.read_status',
                           side_effect=[{'status': 'running'}, {'status': 'success'}]):
                    from .backups import list_backups
                    data = list_backups(self.user)
                self.assertEqual(data['latest']['status'], 'success')
                self.assertEqual(data['items'], [])


class BackupDownloadErrorBranchTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='download-owner')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_unreadable_backup_file_maps_to_503(self):
        fake_path = Mock()
        fake_path.open.side_effect = OSError('sharing violation')
        fake_path.name = 'bbtalk-test.zip'
        with patch('bbtalk.backup_views.backup_path', return_value=fake_path):
            response = self.client.get('/api/v1/bbtalk/data/backups/bbtalk-test.zip/')
        self.assertEqual(response.status_code, 503)
        self.assertIn('稍后重试', response.data['error'])


class AdminBehaviorTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='admin-editor', is_staff=True)

    def test_save_model_assigns_request_user_on_create_only(self):
        from django.contrib.admin import AdminSite
        from .admin import BBTalkAdmin, BaseAdmin, TagAdmin
        request = Mock(user=self.user)
        tag = Tag(name='admin-created', color='#123456', user=self.user)
        BaseAdmin.save_model(TagAdmin(Tag, AdminSite()), request, tag, Mock(), False)
        self.assertEqual(tag.user, self.user)
        self.assertTrue(tag.pk)
        other = User.objects.create(username='admin-other')
        request_two = Mock(user=other)
        BaseAdmin.save_model(TagAdmin(Tag, AdminSite()), request_two, tag, Mock(), True)
        tag.refresh_from_db()
        self.assertEqual(tag.user, self.user)  # unchanged on updates

    def test_formatted_tags_helper(self):
        record = BBTalk.objects.create(user=self.user, content='admin content')
        record.tags.add(Tag.objects.create(user=self.user, name='one'))
        record.tags.add(Tag.objects.create(user=self.user, name='two'))
        from .admin import BBTalkAdmin
        rendered = BBTalkAdmin.formated_tags(object(), record)
        self.assertEqual(sorted(rendered.split(', ')), ['one', 'two'])
