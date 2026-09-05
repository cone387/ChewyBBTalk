import json
import uuid
import zipfile
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.core.management import call_command
from django.test import TestCase, override_settings

from .data_export import DataExporter
from .data_import import DataImporter, ImportError
from .models import Attachment, BBTalk, Comment, User, UserStorageSettings
from .serializers import UserStorageSettingsSerializer


@override_settings(SECRET_KEY='test-secret-key-for-storage-encryption')
class StorageSecretEncryptionTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='storage-user')

    def test_new_secret_is_encrypted_at_rest_and_decrypted_for_storage(self):
        setting = UserStorageSettings.objects.create(
            user=self.user,
            name='测试 S3',
            storage_type='s3',
            s3_access_key_id='access-key',
            s3_secret_access_key='plain-secret',
            s3_bucket_name='bucket',
        )

        setting.refresh_from_db()

        self.assertTrue(setting.s3_secret_access_key.startswith('enc:v1:'))
        self.assertEqual(setting.get_s3_config()['secret_access_key'], 'plain-secret')
        self.assertNotIn('s3_secret_access_key', UserStorageSettingsSerializer(setting).data)

    def test_legacy_plaintext_secret_remains_readable(self):
        setting = UserStorageSettings.objects.create(
            user=self.user,
            name='旧配置',
            storage_type='s3',
            s3_access_key_id='access-key',
            s3_secret_access_key='temporary-secret',
            s3_bucket_name='bucket',
        )
        UserStorageSettings.objects.filter(pk=setting.pk).update(
            s3_secret_access_key='legacy-plaintext'
        )
        setting.refresh_from_db()

        self.assertEqual(setting.get_s3_config()['secret_access_key'], 'legacy-plaintext')

    def test_backfill_command_encrypts_plaintext_idempotently(self):
        setting = UserStorageSettings.objects.create(
            user=self.user,
            name='待回填配置',
            storage_type='s3',
            s3_access_key_id='access-key',
            s3_secret_access_key='temporary-secret',
            s3_bucket_name='bucket',
        )
        UserStorageSettings.objects.filter(pk=setting.pk).update(
            s3_secret_access_key='legacy-plaintext'
        )

        call_command('encrypt_storage_secrets')
        setting.refresh_from_db()
        encrypted = setting.s3_secret_access_key

        call_command('encrypt_storage_secrets')
        setting.refresh_from_db()

        self.assertTrue(encrypted.startswith('enc:v1:'))
        self.assertEqual(setting.s3_secret_access_key, encrypted)
        self.assertEqual(setting.get_s3_config()['secret_access_key'], 'legacy-plaintext')


class DataPortabilityAttachmentTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='export-user')

    def test_zip_export_contains_attachment_bytes(self):
        attachment = Attachment.objects.create(
            id=uuid.uuid4(),
            original_name='note.txt',
            storage_path='2026/09/05/source.txt',
            mime_type='text/plain',
            size=5,
            owner_id=str(self.user.id),
        )

        engine = Mock()
        engine.get_file.return_value = b'hello'
        with patch(
            'chewy_attachment.django_app.storage.get_storage_engine_for_attachment',
            return_value=engine,
        ):
            exported = DataExporter(self.user).export_to_zip(include_attachments=True)

        with zipfile.ZipFile(exported) as archive:
            self.assertEqual(archive.read('attachments/2026/09/05/source.txt'), b'hello')

    def test_json_export_contains_comments(self):
        bbtalk = BBTalk.objects.create(user=self.user, content='有评论的内容')
        Comment.objects.create(user=self.user, bbtalk=bbtalk, content='备份评论')

        exported = json.loads(DataExporter(self.user).export_to_json())

        self.assertEqual(len(exported['comments']), 1)
        self.assertEqual(exported['comments'][0]['content'], '备份评论')
        self.assertEqual(exported['comments'][0]['bbtalk_uid'], bbtalk.uid)

    def test_zip_import_creates_attachment_and_rewrites_bbtalk_reference(self):
        old_attachment_id = str(uuid.uuid4())
        data = {
            'version': '1.0',
            'tags': [],
            'bbtalks': [{
                'uid': 'old-bbtalk',
                'content': '导入附件',
                'visibility': 'private',
                'tags': [],
                'attachments': [{
                    'uid': old_attachment_id,
                    'url': '/old/preview/',
                    'type': 'file',
                }],
                'context': {},
            }],
            'attachments': [{
                'id': old_attachment_id,
                'original_name': 'note.txt',
                'storage_path': '2026/09/05/source.txt',
                'mime_type': 'text/plain',
                'size': 5,
                'is_public': False,
                'storage_config_id': None,
            }],
        }
        archive_buffer = BytesIO()
        with zipfile.ZipFile(archive_buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('data.json', json.dumps(data))
            archive.writestr('attachments/2026/09/05/source.txt', b'hello')
        archive_buffer.seek(0)

        engine = Mock()
        engine.save_file.return_value = SimpleNamespace(
            storage_path='2026/09/05/imported.txt',
            size=5,
            mime_type='text/plain',
        )
        with patch(
            'chewy_attachment.django_app.storage.get_storage_engine_for_upload',
            return_value=(engine, None),
        ):
            stats = DataImporter(self.user).import_from_file(archive_buffer)

        self.assertEqual(stats['attachments_created'], 1)
        imported_attachment = Attachment.objects.get(owner_id=str(self.user.id))
        imported_bbtalk = BBTalk.objects.get(user=self.user)
        self.assertEqual(imported_attachment.storage_path, '2026/09/05/imported.txt')
        self.assertEqual(imported_bbtalk.attachments[0]['uid'], str(imported_attachment.id))
        self.assertEqual(
            imported_bbtalk.attachments[0]['url'],
            f'/api/v1/attachments/files/{imported_attachment.id}/preview/',
        )

    def test_json_import_restores_comments_for_imported_bbtalk(self):
        data = {
            'version': '1.0',
            'tags': [],
            'bbtalks': [{
                'uid': 'old-bbtalk',
                'content': '导入评论',
                'visibility': 'private',
                'tags': [],
                'attachments': [],
                'context': {},
            }],
            'comments': [{
                'uid': 'old-comment',
                'bbtalk_uid': 'old-bbtalk',
                'content': '恢复的评论',
            }],
        }

        stats = DataImporter(self.user).import_from_dict(data)

        self.assertEqual(stats['comments_created'], 1)
        self.assertEqual(Comment.objects.get(user=self.user).content, '恢复的评论')

    def test_zip_import_rejects_attachment_path_traversal(self):
        data = {
            'version': '1.0',
            'bbtalks': [],
            'attachments': [{
                'id': str(uuid.uuid4()),
                'original_name': 'secret.txt',
                'storage_path': '../secret.txt',
                'mime_type': 'text/plain',
                'size': 6,
            }],
        }
        archive_buffer = BytesIO()
        with zipfile.ZipFile(archive_buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('data.json', json.dumps(data))
            archive.writestr('attachments/../secret.txt', b'secret')
        archive_buffer.seek(0)

        with self.assertRaises(ImportError):
            DataImporter(self.user).import_from_file(archive_buffer)

    def test_zip_import_skips_missing_attachment_file(self):
        data = {
            'version': '1.0',
            'bbtalks': [],
            'attachments': [{
                'id': str(uuid.uuid4()),
                'original_name': 'missing.txt',
                'storage_path': '2026/09/05/missing.txt',
                'mime_type': 'text/plain',
                'size': 7,
            }],
        }
        archive_buffer = BytesIO()
        with zipfile.ZipFile(archive_buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('data.json', json.dumps(data))
        archive_buffer.seek(0)

        stats = DataImporter(self.user).import_from_file(archive_buffer)

        self.assertEqual(stats['attachments_created'], 0)
        self.assertEqual(stats['attachments_skipped'], 1)
