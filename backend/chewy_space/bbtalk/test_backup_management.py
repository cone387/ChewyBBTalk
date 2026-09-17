import json
import os
import tempfile
import zipfile
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .backups import backup_lock, backup_path, create_backup, list_backups, user_directory, write_status
from .data_import import DataImporter, ImportError
from .models import Attachment, BBTalk, Comment, Tag, User


class BackupManagementTests(TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        environment = patch.dict(os.environ, {'BACKUP_ROOT': str(self.root / 'backups')})
        environment.start()
        self.addCleanup(environment.stop)
        configuration = override_settings(CHEWY_ATTACHMENT={'STORAGE_ENGINE': 'file', 'STORAGE_ROOT': self.root / 'files'})
        configuration.enable()
        self.addCleanup(configuration.disable)
        self.user = User.objects.create(username='backup-source')
        self.other = User.objects.create(username='backup-target')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = '/api/v1/bbtalk/data/backups/'

    def test_create_list_download_and_account_isolation(self):
        BBTalk.objects.create(user=self.user, content='private source')
        BBTalk.objects.create(user=self.other, content='other account secret')
        created = self.client.post(self.url)
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data['latest']['status'], 'success')
        filename = created.data['items'][0]['filename']
        downloaded = self.client.get(self.url + filename + '/')
        with zipfile.ZipFile(BytesIO(b''.join(downloaded.streaming_content))) as archive:
            data = json.loads(archive.read('data.json'))
            self.assertEqual([record['content'] for record in data['bbtalks']], ['private source'])
        downloaded.close()
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.url).data['items'], [])
        self.assertEqual(self.client.get(self.url + filename + '/').status_code, 404)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(self.url).status_code, (401, 403))
        self.assertIn(self.client.post(self.url).status_code, (401, 403))

    def test_busy_task_is_not_started_again_and_interrupted_state_is_visible(self):
        directory = user_directory(self.user)
        with backup_lock(directory):
            write_status(directory, {'status': 'running'})
            self.assertEqual(self.client.post(self.url).status_code, 409)
            self.assertEqual(self.client.get(self.url).data['latest']['status'], 'running')
        self.assertEqual(self.client.get(self.url).data['latest']['status'], 'interrupted')
        self.assertEqual(self.client.post(self.url).status_code, 201)

    def test_failure_preserves_existing_backup_and_records_safe_error(self):
        path, _ = create_backup(self.user)
        original = path.read_bytes()
        with patch('bbtalk.data_export.DataExporter.export_to_zip', side_effect=OSError('secret endpoint details')):
            failed = self.client.post(self.url)
        self.assertEqual(failed.status_code, 500)
        state = self.client.get(self.url).data
        self.assertEqual(state['latest']['status'], 'failed')
        self.assertNotIn('secret endpoint details', str(state))
        self.assertEqual(path.read_bytes(), original)
        self.assertEqual(len(state['items']), 1)
        self.assertFalse(list(path.parent.glob('*.tmp')))

    def test_download_rejects_paths_and_symlinks(self):
        for filename in ('../private.zip', '/private.zip', '..\\private.zip'):
            with self.assertRaises(FileNotFoundError):
                backup_path(self.user, filename)
        directory = user_directory(self.user)
        directory.mkdir(parents=True)
        private = self.root / 'private.zip'
        private.write_bytes(b'not a backup')
        try:
            (directory / 'linked.zip').symlink_to(private)
        except OSError:
            self.skipTest('OS does not permit symlink creation')
        self.assertEqual(self.client.get(self.url + 'linked.zip/').status_code, 404)
        self.assertEqual(list_backups(self.user)['items'], [])

    def test_real_file_roundtrip_preserves_fields_and_ownership(self):
        from chewy_attachment.django_app.storage import get_storage_engine

        storage = get_storage_engine()
        saved = storage.save_file(content=b'real file bytes', original_name='restore.txt')
        attachment = Attachment.objects.create(original_name='restore.txt', storage_path=saved.storage_path,
                                              owner_id=str(self.user.id), size=saved.size, mime_type='text/plain')
        tag = Tag.objects.create(user=self.user, name='restore-tag', color='#123456')
        record = BBTalk.objects.create(user=self.user, content='restore-body', visibility='friends', is_pinned=True,
                                       context={'location': {'latitude': 12, 'longitude': 34}},
                                       attachments=[{'uid': str(attachment.id), 'url': '/old-url', 'type': 'file'}])
        record.tags.add(tag)
        comment = Comment.objects.create(user=self.user, bbtalk=record, content='restore-comment')
        timestamp = datetime(2024, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
        for model, instance in ((Tag, tag), (BBTalk, record), (Comment, comment)):
            model.objects.filter(pk=instance.pk).update(create_time=timestamp, update_time=timestamp)
        backup, _ = create_backup(self.user)
        with backup.open('rb') as handle:
            stats = DataImporter(self.other).import_from_file(handle)
        self.assertEqual(stats['errors'], [])
        self.assertEqual(stats['attachments_created'], 1)
        restored = BBTalk.objects.get(user=self.other)
        self.assertEqual(restored.content, record.content)
        self.assertEqual(restored.visibility, 'friends')
        self.assertTrue(restored.is_pinned)
        self.assertEqual(restored.context, record.context)
        self.assertEqual(restored.create_time, timestamp)
        self.assertEqual(restored.update_time, timestamp)
        self.assertEqual(restored.tags.get().name, tag.name)
        self.assertEqual(restored.tags.get().color, tag.color)
        self.assertEqual(restored.tags.get().create_time, timestamp)
        restored_comment = Comment.objects.get(user=self.other)
        self.assertEqual(restored_comment.bbtalk_id, restored.pk)
        self.assertEqual(restored_comment.content, comment.content)
        self.assertEqual(restored_comment.create_time, timestamp)
        restored_attachment = Attachment.objects.get(owner_id=str(self.other.id))
        self.assertNotEqual(restored_attachment.id, attachment.id)
        self.assertEqual(restored.attachments[0]['uid'], str(restored_attachment.id))
        self.assertEqual(storage.get_file(restored_attachment.storage_path), b'real file bytes')

    def test_late_unsafe_attachment_rolls_back_database_and_written_files(self):
        payload = {'version': '1.0', 'attachments': [
            {'id': 'valid', 'original_name': 'valid.txt', 'storage_path': 'valid.txt', 'size': 5},
            {'id': 'unsafe', 'original_name': 'unsafe.txt', 'storage_path': '../unsafe.txt'},
        ]}
        buffer = BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr('data.json', json.dumps(payload))
            archive.writestr('attachments/valid.txt', b'hello')
        buffer.seek(0)
        with self.assertRaises(ImportError):
            DataImporter(self.other).import_from_file(buffer)
        self.assertFalse(Attachment.objects.filter(owner_id=str(self.other.id)).exists())
        self.assertEqual([path for path in (self.root / 'files').rglob('*') if path.is_file()], [])
