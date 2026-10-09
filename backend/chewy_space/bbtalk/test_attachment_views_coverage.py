"""Coverage for bbtalk.attachment_views: range parsing, engine selection, preview branches."""
import tempfile
from unittest.mock import Mock, patch

from django.core.files.storage import Storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from chewy_attachment.core.storage import DjangoStorageEngine, FileStorageEngine

from .attachment_views import AttachmentViewSet, parse_range_header
from .models import Attachment, User, UserStorageSettings

PNG_BYTES = b'\x89PNG\r\n\x1a\n' + b'\x00' * 16


class ParseRangeHeaderTests(TestCase):
    def test_valid_range_forms(self):
        self.assertEqual(parse_range_header('bytes=0-1023', 2000), (0, 1023))
        self.assertEqual(parse_range_header('bytes=1000-', 2000), (1000, 1999))
        self.assertEqual(parse_range_header('bytes=-500', 2000), (1500, 1999))
        self.assertEqual(parse_range_header('bytes=-5000', 2000), (0, 1999))
        self.assertEqual(parse_range_header('bytes=0-99999', 100), (0, 99))

    def test_malformed_headers_return_none(self):
        for header in ('', 'items=0-1', 'bytes=1,2-3', 'bytes-nodash', 'bytes=-', 'bytes=-0',
                       'bytes=a-b', 'bytes=5-3', 'bytes=-abc', 'bytes=100-'):
            with self.subTest(header=header):
                self.assertIsNone(parse_range_header(header, 100))

    def test_out_of_range_start_raises(self):
        with self.assertRaises(ValueError):
            parse_range_header('bytes=150-200', 100)


class CloudUrlStorage(Storage):
    def url(self, name):
        return 'https://bucket.example.test/signed/' + name


def attachment_test_settings(root):
    return override_settings(CHEWY_ATTACHMENT={'STORAGE_ENGINE': 'file', 'STORAGE_ROOT': root})


class AttachmentEngineSelectionTests(TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.settings_override = attachment_test_settings(self.directory.name)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.user = User.objects.create(username='engine-owner')
        self.other = User.objects.create(username='engine-other')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.configured = UserStorageSettings.objects.create(
            user=self.user, name='s3 cfg', storage_type='s3',
            s3_access_key_id='key', s3_secret_access_key='secret', s3_bucket_name='bucket',
            s3_region_name='eu-west-1', s3_endpoint_url='https://minio.example.test',
            s3_custom_domain='cdn.example.test')
        self.incomplete = UserStorageSettings.objects.create(
            user=self.user, name='incomplete', storage_type='s3', s3_access_key_id='key')
        self.view = AttachmentViewSet()

    def test_user_s3_engine_is_built_from_configuration(self):
        engine = self.view.get_storage_engine(str(self.configured.id))
        self.assertIsInstance(engine, DjangoStorageEngine)
        self.assertEqual(engine.storage.bucket_name, 'bucket')
        self.assertEqual(engine.storage.custom_domain, 'cdn.example.test')
        self.assertEqual(engine.storage.endpoint_url, 'https://minio.example.test')
        upload_engine, config_id = self.view.get_storage_engine_for_upload(str(self.configured.id))
        self.assertIsInstance(upload_engine, DjangoStorageEngine)
        self.assertEqual(upload_engine.storage.bucket_name, 'bucket')
        self.assertEqual(config_id, str(self.configured.id))

    def test_unknown_or_incomplete_config_falls_back_and_then_raises(self):
        from chewy_attachment.core.exceptions import StorageException
        # The user engine builder declines (missing keys) and the default
        # provider does not know the id, so the fallback raises.
        with self.assertRaises(StorageException):
            self.view.get_storage_engine(str(self.incomplete.id))
        with self.assertRaises(StorageException):
            self.view.get_storage_engine('424242')
        with self.assertRaises(StorageException):
            self.view.get_storage_engine_for_upload(str(self.incomplete.id))
        # Empty config id keeps the legacy default engine.
        self.assertNotIsInstance(self.view.get_storage_engine(''), DjangoStorageEngine)

    def test_engine_construction_failure_falls_back(self):
        from chewy_attachment.core.exceptions import StorageException
        with patch('storages.backends.s3boto3.S3Boto3Storage', side_effect=RuntimeError('no storages')):
            with self.assertRaises(StorageException):
                self.view.get_storage_engine(str(self.configured.id))
            with self.assertRaises(StorageException):
                self.view.get_storage_engine_for_upload(str(self.configured.id))

    def test_upload_rejects_storage_config_owned_by_another_user(self):
        foreign = UserStorageSettings.objects.create(
            user=self.other, name='foreign', storage_type='s3',
            s3_access_key_id='k', s3_secret_access_key='s', s3_bucket_name='b')
        response = self.client.post('/api/v1/attachments/files/', {
            'file': SimpleUploadedFile('a.png', PNG_BYTES, content_type='image/png'),
            'storage_config_id': str(foreign.id)}, format='multipart')
        self.assertEqual(response.status_code, 403)
        self.assertIn('无权', response.data['detail'])

    def test_upload_with_owned_config_id_uses_requested_engine(self):
        local = FileStorageEngine(self.directory.name)
        with patch.object(AttachmentViewSet, 'get_storage_engine_for_upload',
                          return_value=(local, str(self.configured.id))) as engine_call:
            response = self.client.post('/api/v1/attachments/files/', {
                'file': SimpleUploadedFile('a.png', PNG_BYTES, content_type='image/png'),
                'storage_config_id': str(self.configured.id)}, format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['storage_config_id'], str(self.configured.id))
        engine_call.assert_called_once_with(str(self.configured.id))

    def test_auto_config_lookup_swallows_errors_and_returns_none(self):
        with patch('bbtalk.models.UserStorageSettings') as model:
            model.objects.filter.side_effect = RuntimeError('db down')
            self.assertIsNone(self.view._get_user_storage_config_id(self.user))
        active_local = UserStorageSettings.objects.create(
            user=self.user, name='active local', storage_type='local', is_active=True)
        self.assertIsNone(self.view._get_user_storage_config_id(self.user))
        active_local.delete()
        UserStorageSettings.objects.filter(pk=self.incomplete.pk).update(is_active=True)
        self.assertIsNone(self.view._get_user_storage_config_id(self.user))
        UserStorageSettings.objects.filter(pk=self.configured.pk).update(is_active=True)
        self.assertEqual(self.view._get_user_storage_config_id(self.user), str(self.configured.id))


class AttachmentPreviewRangeTests(TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.settings_override = attachment_test_settings(self.directory.name)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.user = User.objects.create(username='range-owner')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        FileStorageEngine(self.directory.name).save_file(b'0123456789', 'range.bin', storage_path='range.bin')
        self.attachment = Attachment.objects.create(
            id='018f0000-0000-7000-8000-000000000002', original_name='range.bin',
            storage_path='range.bin', mime_type='application/octet-stream', size=10,
            owner_id=str(self.user.id))
        self.url = f'/api/v1/attachments/files/{self.attachment.id}/preview/'

    def test_range_requests_stream_slices(self):
        response = self.client.get(self.url, HTTP_RANGE='bytes=2-5')
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.content, b'2345')
        self.assertEqual(response['Content-Range'], 'bytes 2-5/10')
        self.assertEqual(response['Content-Length'], '4')
        self.assertEqual(response['Accept-Ranges'], 'bytes')
        self.assertIn('inline', response['Content-Disposition'])
        suffix = self.client.get(self.url, HTTP_RANGE='bytes=-3')
        self.assertEqual(suffix.status_code, 206)
        self.assertEqual(suffix.content, b'789')

    def test_invalid_and_unsatisfiable_ranges_return_416(self):
        malformed = self.client.get(self.url, HTTP_RANGE='bytes=zzz')
        self.assertEqual(malformed.status_code, 416)
        self.assertEqual(malformed['Content-Range'], 'bytes */10')
        # start within a syntactically valid pair but beyond EOF raises ValueError
        unsatisfiable = self.client.get(self.url, HTTP_RANGE='bytes=10-50')
        self.assertEqual(unsatisfiable.status_code, 416)
        self.assertEqual(unsatisfiable['Content-Range'], 'bytes */10')

    def test_range_request_denied_by_permission_checker(self):
        # The queryset normally hides inaccessible files, so exercise the
        # explicit permission branch with a public file denied at the checker.
        Attachment.objects.filter(pk=self.attachment.pk).update(is_public=True)
        anonymous = APIClient()
        with patch('chewy_attachment.core.permissions.PermissionChecker.can_download',
                   return_value=False):
            denied = anonymous.get(self.url, HTTP_RANGE='bytes=0-3')
        self.assertEqual(denied.status_code, 403)
        self.assertIn('permission', denied.data['detail'])

    def test_cloud_engine_redirects_range_request(self):
        with patch.object(AttachmentViewSet, 'get_storage_engine',
                          return_value=DjangoStorageEngine(CloudUrlStorage())):
            response = self.client.get(self.url, HTTP_RANGE='bytes=0-3')
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response['Location'], 'https://bucket.example.test/signed/range.bin')

    def test_s3_client_engine_redirects_range_request(self):
        engine = Mock(spec=['s3_client', 'get_file_url'])
        engine.get_file_url.return_value = 'https://s3.example.test/pre-signed/range.bin'
        with patch.object(AttachmentViewSet, 'get_storage_engine', return_value=engine):
            response = self.client.get(self.url, HTTP_RANGE='bytes=0-3')
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response['Location'], 'https://s3.example.test/pre-signed/range.bin')

    def test_missing_local_file_maps_to_404(self):
        engine = Mock(spec=['get_file_path'])
        engine.get_file_path.side_effect = OSError('gone')
        with patch.object(AttachmentViewSet, 'get_storage_engine', return_value=engine):
            response = self.client.get(self.url, HTTP_RANGE='bytes=0-3')
        self.assertEqual(response.status_code, 404)

    def test_plain_preview_keeps_accept_ranges_header(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Accept-Ranges'], 'bytes')
        response.close()
