import json
import uuid
import zipfile
from io import BytesIO
from unittest.mock import Mock, patch

from django.test import TestCase

from .backup_integrity import verify_archive
from .data_export import DataExporter
from .data_import import DataImporter, ImportError, validate_import_file
from .models import Attachment, BBTalk, User


class BackupIntegrityTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='integrity-source')
        self.target = User.objects.create(username='integrity-target')
        self.record = BBTalk.objects.create(user=self.user, content='keep pinned', is_pinned=True)
        Attachment.objects.create(id=uuid.uuid4(), original_name='note.txt', storage_path='backup/note.txt',
                                  mime_type='text/plain', size=5, owner_id=str(self.user.id))

    def export(self):
        with patch('chewy_attachment.django_app.storage.get_storage_engine_for_attachment', return_value=Mock(get_file=Mock(return_value=b'hello'))):
            return DataExporter(self.user).export_to_zip(include_attachments=True)

    def test_complete_export_has_verified_manifest_and_pinned_field(self):
        with zipfile.ZipFile(self.export()) as archive:
            self.assertTrue(verify_archive(archive))
            self.assertTrue(json.loads(archive.read('data.json'))['bbtalks'][0]['is_pinned'])

    def test_unreadable_attachment_fails_export(self):
        with patch('chewy_attachment.django_app.storage.get_storage_engine_for_attachment', return_value=Mock(get_file=Mock(side_effect=OSError('missing')))):
            with self.assertRaisesMessage(ValueError, '未生成完整备份'):
                DataExporter(self.user).export_to_zip(include_attachments=True)

    def test_missing_referenced_metadata_cannot_claim_complete_backup(self):
        self.record.attachments = [{'uid': 'missing-attachment', 'url': '/stale'}]
        self.record.save()
        with self.assertRaisesMessage(ValueError, '附件元信息缺失'):
            self.export()

    def test_corrupt_and_missing_members_fail_before_import_writes(self):
        for corruption in ('missing', 'changed', 'data'):
            with self.subTest(corruption=corruption):
                modified = BytesIO()
                with zipfile.ZipFile(self.export()) as source, zipfile.ZipFile(modified, 'w') as target:
                    for name in source.namelist():
                        if name.startswith('attachments/') and corruption == 'missing':
                            continue
                        content = source.read(name)
                        if (name.startswith('attachments/') and corruption == 'changed') or (name == 'data.json' and corruption == 'data'):
                            content += b'changed'
                        target.writestr(name, content)
                modified.seek(0)
                self.assertFalse(validate_import_file(modified)['valid'])
                with patch('chewy_attachment.django_app.storage.get_storage_engine_for_upload') as storage:
                    with self.assertRaises(ImportError):
                        DataImporter(self.target).import_from_file(modified)
                    storage.assert_not_called()
                self.assertFalse(BBTalk.objects.filter(user=self.target).exists())

    def test_legacy_archive_does_not_claim_verified_completeness(self):
        buffer = BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr('data.json', json.dumps({'version': '1.0', 'bbtalks': []}))
        buffer.seek(0)
        with zipfile.ZipFile(buffer) as archive:
            self.assertFalse(verify_archive(archive))
