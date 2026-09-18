import base64
import tempfile
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.files.storage import Storage
from rest_framework.test import APIClient
from chewy_attachment.core.storage import DjangoStorageEngine
from .models import User, Attachment, BBTalk
from .attachment_views import AttachmentViewSet

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=')


class DesktopAttachmentTests(TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        from django.conf import settings
        self.settings = override_settings(CHEWY_ATTACHMENT={**settings.CHEWY_ATTACHMENT, 'STORAGE_ROOT': self.directory.name})
        self.settings.enable()
        self.addCleanup(self.settings.disable)
        self.user = User.objects.create(username='desktop-media')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def upload(self):
        response = self.client.post('/api/v1/attachments/files/', {'file': SimpleUploadedFile('screenshot.png', PNG, content_type='image/png'), 'is_public': 'false'}, format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data['id']

    def test_upload_hydration_private_public_range_and_delete(self):
        uid = self.upload()
        preview = f'/api/v1/attachments/files/{uid}/preview/'
        response = self.client.get(preview)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b''.join(response.streaming_content), PNG)
        response.close()
        response = self.client.get(preview, HTTP_RANGE='bytes=0-7')
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.content, PNG[:8])
        post = self.client.post('/api/v1/bbtalk/', {'content': 'screenshot', 'attachments': [{'uid': uid}], 'visibility': 'private'}, format='json')
        self.assertEqual(post.status_code, 201, post.data)
        media = post.data['attachments'][0]
        self.assertEqual(media['type'], 'image')
        self.assertTrue(media['url'].endswith(preview))
        self.assertEqual(media['filename'], 'screenshot.png')
        anonymous = APIClient()
        self.assertIn(anonymous.get(preview).status_code, (403, 404))
        path = f"/api/v1/bbtalk/{post.data['uid']}/"
        self.assertEqual(self.client.patch(path, {'visibility': 'public'}, format='json').status_code, 200)
        response = anonymous.get(preview)
        self.assertEqual(response.status_code, 200)
        response.close()
        self.assertEqual(self.client.patch(path, {'visibility': 'private'}, format='json').status_code, 200)
        self.assertIn(anonymous.get(preview).status_code, (403, 404))
        self.client.patch(path, {'visibility': 'public'}, format='json')
        self.client.delete(path)
        self.assertIn(anonymous.get(preview).status_code, (403, 404))

    def test_other_owner_cannot_attach_file(self):
        uid = self.upload()
        self.client.force_authenticate(User.objects.create(username='other-media'))
        self.assertEqual(self.client.post('/api/v1/bbtalk/', {'content': 'steal', 'attachments': [{'uid': uid}]}, format='json').status_code, 400)

    def test_visibility_migration_repairs_existing_rows_and_preserves_shared_files(self):
        from importlib import import_module
        from django.apps import apps
        private_uid, shared_uid, standalone_uid = self.upload(), self.upload(), self.upload()
        BBTalk.objects.create(user=self.user, content='private', visibility='private', attachments=[{'uid': private_uid}, {'uid': shared_uid}])
        BBTalk.objects.create(user=self.user, content='public', visibility='public', attachments=[{'uid': shared_uid}])
        Attachment.objects.filter(pk__in=[private_uid, shared_uid, standalone_uid]).update(is_public=True)
        migration = import_module('bbtalk.migrations.0008_attachment_post_visibility')
        migration.align_visibility(apps, None)
        self.assertFalse(Attachment.objects.get(pk=private_uid).is_public)
        self.assertTrue(Attachment.objects.get(pk=shared_uid).is_public)
        self.assertTrue(Attachment.objects.get(pk=standalone_uid).is_public)

    def test_s3_inherited_path_redirects_instead_of_opening_local_file(self):
        class CloudStorage(Storage):
            def url(self, name): return 'https://bucket.example.test/signed/' + name
        item = Attachment(storage_path='image.png')
        view = AttachmentViewSet()
        with patch.object(view, 'get_storage_engine', return_value=DjangoStorageEngine(CloudStorage())):
            response = view._serve_file(item, 'inline')
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response['Location'], 'https://bucket.example.test/signed/image.png')

    def test_shared_file_stays_public_until_last_public_reference_removed(self):
        uid = self.upload()
        first = BBTalk.objects.create(user=self.user, content='first', visibility='public', attachments=[{'uid': uid}])
        second = BBTalk.objects.create(user=self.user, content='second', visibility='public', attachments=[{'uid': uid}])
        first.delete()
        self.assertTrue(Attachment.objects.get(pk=uid).is_public)
        second.visibility = 'private'
        second.save()
        self.assertFalse(Attachment.objects.get(pk=uid).is_public)
