import os
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from .backups import create_backup, user_directory, write_status
from .models import User, UserStorageSettings


class RuntimeStatusTests(TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        config = override_settings(CHEWY_ATTACHMENT={'STORAGE_ENGINE': 'file', 'STORAGE_ROOT': self.root / 'files'})
        config.enable()
        self.addCleanup(config.disable)
        env = patch.dict(os.environ, {'BACKUP_ROOT': str(self.root / 'backups')})
        env.start()
        self.addCleanup(env.stop)
        self.user = User.objects.create(username='status-owner')
        self.other = User.objects.create(username='status-other')
        self.client = APIClient()
        self.url = '/api/v1/bbtalk/settings/status/'
        self.client.force_authenticate(self.user)

    def test_real_local_check_backup_and_account_isolation(self):
        create_backup(self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Cache-Control'], 'no-store')
        self.assertEqual(response.data['storage']['status'], 'ok')
        self.assertEqual(list((self.root / 'files').iterdir()), [])
        self.assertEqual(response.data['backup']['status'], 'success')
        self.assertEqual(response.data['backup']['count'], 1)
        self.assertNotIn('diagnostics', response.data)
        self.assertNotIn(str(self.root), str(response.data))
        self.client.force_authenticate(self.other)
        other = self.client.get(self.url).data
        self.assertEqual(other['backup']['count'], 0)
        self.assertEqual(other['backup']['status'], 'none')
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(self.url).status_code, (401, 403))

    def test_admin_diagnostics_are_server_authorized(self):
        self.assertNotIn('diagnostics', self.client.get(self.url + '?is_staff=true').data)
        self.user.is_staff = True
        self.user.save()
        data = self.client.get(self.url).data
        self.assertEqual(data['diagnostics']['database']['status'], 'ok')
        self.assertGreater(data['diagnostics']['attachment_disk']['free_bytes'], 0)
        with patch('bbtalk.status_views.connection.cursor', side_effect=OSError('private db path')):
            from .status_views import database_check
            self.assertEqual(database_check(), {'status': 'error', 'message': '数据库查询检查失败，请检查服务配置'})

    def test_check_failures_are_independent_and_do_not_expose_exception_details(self):
        with patch('bbtalk.status_views.local_storage_check', side_effect=OSError('secret endpoint key')):
            data = self.client.get(self.url).data
        self.assertEqual(data['storage']['status'], 'error')
        self.assertEqual(data['backup']['status'], 'none')
        with patch('bbtalk.status_views.list_backups', side_effect=OSError('secret endpoint key')):
            data = self.client.get(self.url).data
        self.assertEqual(data['storage']['status'], 'ok')
        self.assertEqual(data['backup']['status'], 'error')
        self.assertNotIn('secret', str(data))
        create_backup(self.user)
        write_status(user_directory(self.user), {'status': 'failed', 'message': 'secret internal path'})
        backup = self.client.get(self.url).data['backup']
        self.assertEqual(backup['status'], 'failed')
        self.assertEqual(backup['count'], 1)
        self.assertNotIn('secret', str(backup))

    def test_only_active_own_s3_is_checked_with_bounded_read_operation(self):
        UserStorageSettings.objects.create(user=self.other, is_active=True, s3_access_key_id='other-key')
        with patch('boto3.client') as factory:
            self.assertEqual(self.client.get(self.url).data['storage']['mode'], 'server')
            factory.assert_not_called()
            UserStorageSettings.objects.create(user=self.user, is_active=True,
                s3_access_key_id='own-key', s3_secret_access_key='own-secret', s3_bucket_name='own-bucket')
            response = self.client.get(self.url)
            self.assertEqual(response.data['storage']['status'], 'ok')
            factory.return_value.list_objects_v2.assert_called_once_with(Bucket='own-bucket', MaxKeys=1)
            factory.return_value.close.assert_called_once()
            self.assertEqual(factory.call_args.kwargs['config'].read_timeout, 3)
            self.assertNotIn('own-key', str(response.data))
            self.assertNotIn('own-secret', str(response.data))
            self.assertNotIn('own-bucket', str(response.data))
            factory.return_value.list_objects_v2.side_effect = OSError('secret endpoint')
            data = self.client.get(self.url).data
            self.assertEqual(data['storage']['status'], 'error')
            self.assertNotIn('secret endpoint', str(data))
