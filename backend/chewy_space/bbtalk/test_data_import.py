import json
import zipfile
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import TestCase

from .data_import import DataImporter, ImportError, validate_import_file
from .models import Attachment, BBTalk, Comment, Tag, User, UserStorageSettings


def archive(data=None, members=None):
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, 'w') as output:
        if data is not None:
            output.writestr('data.json', json.dumps(data))
        for name, content in (members or {}).items():
            output.writestr(name, content)
    buffer.seek(0)
    return buffer


class DataImportTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='import-target')
        self.other = User.objects.create(username='other-account')

    def test_json_validation_counts_and_rewinds_input(self):
        data = {'version': '1.0', 'tags': [{}], 'bbtalks': [{}, {}], 'comments': [], 'export_time': '2026-01-01'}
        source = BytesIO(json.dumps(data).encode())
        result = validate_import_file(source)
        self.assertTrue(result['valid'])
        self.assertEqual(result['preview']['tags_count'], 1)
        self.assertEqual(result['preview']['bbtalks_count'], 2)
        self.assertFalse(result['complete_backup'])
        self.assertEqual(source.tell(), 0)

    def test_rejects_corrupt_unsupported_and_non_list_payloads(self):
        for payload in [b'\xff', b'bad json', b'[]', b'{}', b'{"version":"2.0"}', b'{"version":"1.0","tags":{}}']:
            with self.subTest(payload=payload):
                result = validate_import_file(BytesIO(payload))
                self.assertFalse(result['valid'])
                self.assertTrue(result['error'])

    def test_missing_zip_data_and_invalid_json_do_not_write_records(self):
        for source in [archive(members={'readme.txt': b'hello'}), archive(members={'data.json': b'bad json'})]:
            with self.subTest(source=source):
                self.assertFalse(validate_import_file(source)['valid'])
                with self.assertRaises(ImportError):
                    DataImporter(self.user).import_from_file(source)
        self.assertFalse(BBTalk.objects.filter(user=self.user).exists())

    def test_json_file_import_rejects_non_utf8_and_malformed_data(self):
        for content in [b'\xff', b'not-json']:
            with self.subTest(content=content), self.assertRaises(ImportError):
                DataImporter(self.user).import_from_file(BytesIO(content))

    def test_requires_object_and_version_before_import(self):
        for payload in [[], {}, 'text']:
            with self.subTest(payload=payload), self.assertRaises(ImportError):
                DataImporter(self.user).import_from_dict(payload)

    def test_tag_reuse_and_overwrite_are_account_scoped(self):
        own = Tag.objects.create(user=self.user, name='same', color='#111111', sort_order=1)
        other = Tag.objects.create(user=self.other, name='same', color='#333333')
        payload = {'version': '1.0', 'tags': [{'uid': 'old-tag', 'name': 'same', 'color': '#222222', 'sort_order': 2}]}
        importer = DataImporter(self.user)
        self.assertEqual(importer.import_from_dict(payload)['tags_skipped'], 1)
        own.refresh_from_db()
        self.assertEqual(own.color, '#111111')
        self.assertEqual(importer.tag_mapping['old-tag'].pk, own.pk)
        DataImporter(self.user, {'overwrite_tags': True}).import_from_dict(payload)
        own.refresh_from_db(); other.refresh_from_db()
        self.assertEqual(own.color, '#222222')
        self.assertEqual(own.sort_order, 2)
        self.assertEqual(other.color, '#333333')

    def test_duplicate_record_reuses_target_and_maps_comments(self):
        existing = BBTalk.objects.create(user=self.user, content='duplicate')
        result = DataImporter(self.user, {'skip_duplicates': True}).import_from_dict({
            'version': '1.0', 'bbtalks': [{'uid': 'original', 'content': 'duplicate'}],
            'comments': [{'bbtalk_uid': 'original', 'content': ' recovered comment '},
                         {'bbtalk_uid': 'missing', 'content': 'orphan'},
                         {'bbtalk_uid': 'original', 'content': ' '}],
        })
        self.assertEqual(result['bbtalks_skipped'], 1)
        self.assertEqual(result['comments_created'], 1)
        self.assertEqual(result['comments_skipped'], 2)
        self.assertEqual(Comment.objects.get(user=self.user).bbtalk_id, existing.pk)
        self.assertEqual(Comment.objects.get(user=self.user).content, 'recovered comment')

    def test_uid_conflicts_do_not_overwrite_another_account(self):
        original = BBTalk.objects.create(user=self.other, uid='conflicting-id', content='private original')
        importer = DataImporter(self.user)
        importer.import_from_dict({'version': '1.0', 'bbtalks': [{'uid': original.uid, 'content': 'imported', 'is_pinned': True}]})
        imported = BBTalk.objects.get(user=self.user)
        original.refresh_from_db()
        self.assertNotEqual(imported.uid, original.uid)
        self.assertTrue(imported.is_pinned)
        self.assertEqual(original.content, 'private original')
        self.assertEqual(importer.uid_mapping[original.uid], imported)

    def test_storage_import_is_opt_in_and_never_activates_or_restores_a_secret(self):
        payload = {'version': '1.0', 'storage_settings': [{'name': 'restored', 's3_bucket_name': 'bucket', 's3_secret_access_key': 'must-not-restore'}]}
        DataImporter(self.user).import_from_dict(payload)
        self.assertFalse(UserStorageSettings.objects.filter(user=self.user).exists())
        importer = DataImporter(self.user, {'import_storage_settings': True})
        self.assertEqual(importer.import_from_dict(payload)['storage_settings_created'], 1)
        restored = UserStorageSettings.objects.get(user=self.user)
        self.assertFalse(restored.is_active)
        self.assertFalse(restored.get_s3_config().get('secret_access_key'))
        result = DataImporter(self.user, {'import_storage_settings': True}).import_from_dict(payload)
        self.assertEqual(result['storage_settings_created'], 0)

    def test_invalid_individual_entries_are_reported_and_valid_entries_continue(self):
        result = DataImporter(self.user).import_from_dict({
            'version': '1.0', 'tags': [{'name': 'missing uid'}, {'uid': 'tag', 'name': 'valid'}],
            'bbtalks': [{'uid': 'missing-content'}, {'uid': 'valid-record', 'content': 'valid', 'tags': ['tag']}],
        })
        self.assertEqual(len(result['errors']), 2)
        self.assertEqual(result['tags_created'], 1)
        self.assertEqual(result['bbtalks_created'], 1)
        self.assertEqual(list(BBTalk.objects.get(uid='valid-record').tags.values_list('name', flat=True)), ['valid'])

    def test_invalid_timestamps_do_not_leave_partially_created_rows(self):
        result = DataImporter(self.user).import_from_dict({
            'version': '1.0',
            'tags': [{'uid': 'bad-tag', 'name': 'invalid', 'create_time': 'not-a-date'}, {'uid': 'good-tag', 'name': 'valid'}],
            'bbtalks': [{'uid': 'bad-record', 'content': 'invalid', 'create_time': 'not-a-date'}, {'uid': 'good-record', 'content': 'valid'}],
            'comments': [{'bbtalk_uid': 'good-record', 'content': 'invalid', 'create_time': 'not-a-date'}, {'bbtalk_uid': 'good-record', 'content': 'valid'}],
        })
        self.assertEqual(len(result['errors']), 3)
        self.assertFalse(Tag.objects.filter(user=self.user, name='invalid').exists())
        self.assertFalse(BBTalk.objects.filter(uid='bad-record').exists())
        self.assertFalse(Comment.objects.filter(user=self.user, content='invalid').exists())
        self.assertEqual(result['tags_created'], 1)
        self.assertEqual(result['bbtalks_created'], 1)
        self.assertEqual(result['comments_created'], 1)

    def test_fatal_import_failure_rolls_back_database_and_saved_files(self):
        storage = Mock()
        importer = DataImporter(self.user)
        importer.saved_files.append((storage, 'copied-file'))
        with patch.object(importer, '_import_comments', side_effect=RuntimeError('fatal')):
            with self.assertRaises(ImportError):
                importer.import_from_dict({'version': '1.0', 'tags': [{'uid': 'tag', 'name': 'rolled-back'}], 'comments': []})
        self.assertFalse(Tag.objects.filter(user=self.user).exists())
        storage.delete_file.assert_called_once_with('copied-file')
        self.assertEqual(importer.saved_files, [])

    def test_cleanup_failure_does_not_prevent_remaining_file_cleanup(self):
        first = Mock(delete_file=Mock(side_effect=OSError('unreachable')))
        second = Mock()
        DataImporter._cleanup_files([(first, 'a'), (second, 'b')])
        second.delete_file.assert_called_once_with('b')

    def test_unsafe_archive_attachment_paths_are_rejected(self):
        for path in ['', '/root/file', '../outside', 'folder/../../outside', '..\\outside']:
            with self.subTest(path=path), self.assertRaises(ImportError):
                DataImporter._validate_attachment_path(path)
        self.assertEqual(DataImporter._validate_attachment_path('folder\\file.txt'), 'folder/file.txt')

    def test_zip_import_restores_attachment_metadata_and_record_references(self):
        storage = Mock()
        storage.save_file.return_value = SimpleNamespace(storage_path='new/file.txt', mime_type='text/plain', size=5)
        data = {'version': '1.0', 'attachments': [{'id': 'old-file', 'storage_path': 'old/file.txt', 'original_name': 'note.txt'}],
                'bbtalks': [{'uid': 'with-file', 'content': 'attached', 'attachments': [{'uid': 'old-file'}, None]}]}
        importer = DataImporter(self.user)
        with patch.object(importer, '_get_import_storage', return_value=(storage, None)):
            result = importer.import_from_file(archive(data, {'attachments/old/file.txt': b'hello'}))
        self.assertEqual(result['attachments_created'], 1)
        attachment = Attachment.objects.get(owner_id=str(self.user.id))
        self.assertEqual(attachment.storage_path, 'new/file.txt')
        self.assertFalse(attachment.is_public)
        references = BBTalk.objects.get(uid='with-file').attachments
        self.assertEqual(references[0]['uid'], str(attachment.id))
        self.assertEqual(references[0]['type'], 'file')
        self.assertIsNone(references[1])

    def test_missing_or_failed_attachments_are_counted_without_false_success(self):
        storage = Mock(save_file=Mock(side_effect=OSError('disk full')))
        importer = DataImporter(self.user)
        data = {'version': '1.0', 'attachments': [{'id': 'absent', 'storage_path': 'absent'}, {'id': 'failed', 'storage_path': 'present'}]}
        with patch.object(importer, '_get_import_storage', return_value=(storage, None)):
            result = importer.import_from_file(archive(data, {'attachments/present': b'hello'}))
        self.assertEqual(result['attachments_created'], 0)
        self.assertTrue(result['errors'])
        self.assertFalse(Attachment.objects.filter(owner_id=str(self.user.id)).exists())
