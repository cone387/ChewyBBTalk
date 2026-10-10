"""Coverage for backup_integrity.verify_archive manifest validation branches."""
import json
import zipfile
from io import BytesIO
from unittest import TestCase

from chewy_api.backups.integrity import attachment_member, fingerprint, verify_archive


def build_archive(members, duplicates=()):
    """members: name -> bytes; duplicates: names written twice to force duplicates."""
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, 'w') as archive:
        for name, content in members.items():
            archive.writestr(name, content)
        for name in duplicates:
            archive.writestr(name, members[name])
    buffer.seek(0)
    return zipfile.ZipFile(buffer)


def valid_payload():
    data = {
        'attachments': [{'id': 'a1', 'storage_path': 'f.bin'}],
        'bbtalks': [{'attachments': [{'uid': 'a1'}]}],
    }
    data_bytes = json.dumps(data).encode('utf-8')
    file_bytes = b'file-content'
    manifest = {
        'version': 1,
        'complete': True,
        'members': {
            'data.json': fingerprint(data_bytes),
            'attachments/f.bin': fingerprint(file_bytes),
        },
    }
    members = {
        'data.json': data_bytes,
        'attachments/f.bin': file_bytes,
        'manifest.json': json.dumps(manifest).encode('utf-8'),
    }
    return members


class AttachmentMemberTests(TestCase):
    def test_unsafe_paths_are_rejected(self):
        for bad in ('', None, '/absolute/path', 'C:/drive', '../escape', 'a/../b'):
            with self.subTest(path=bad):
                with self.assertRaisesRegex(ValueError, '不安全'):
                    attachment_member(bad)

    def test_safe_paths_are_namespaced(self):
        self.assertEqual(attachment_member('a/b/c.png'), 'attachments/a/b/c.png')
        self.assertEqual(attachment_member('a\\b\\c.png'), 'attachments/a/b/c.png')


class VerifyArchiveTests(TestCase):
    def test_valid_complete_archive_passes(self):
        with build_archive(valid_payload()) as archive:
            self.assertTrue(verify_archive(archive))

    def test_missing_manifest_is_legacy_not_verified(self):
        members = valid_payload()
        members.pop('manifest.json')
        with build_archive(members) as archive:
            self.assertFalse(verify_archive(archive))

    def test_corrupt_manifest_json_raises(self):
        members = valid_payload()
        members['manifest.json'] = b'not-json'
        with build_archive(members) as archive:
            with self.assertRaisesRegex(ValueError, '清单'):
                verify_archive(archive)

    def test_manifest_shape_is_validated(self):
        cases = []
        members = valid_payload()
        members['manifest.json'] = b'[]'
        cases.append(members)  # not a dict
        members = valid_payload()
        members['manifest.json'] = json.dumps({'version': 2, 'complete': True, 'members': {}}).encode()
        cases.append(members)  # unsupported version
        members = valid_payload()
        members['manifest.json'] = json.dumps({'version': 1, 'complete': False, 'members': {}}).encode()
        cases.append(members)  # not marked complete
        members = valid_payload()
        members['manifest.json'] = json.dumps({'version': 1, 'complete': True, 'members': {}}).encode()
        cases.append(members)  # members missing data.json
        for case in cases:
            with self.subTest(manifest=case['manifest.json']):
                with build_archive(case) as archive:
                    with self.assertRaises(ValueError):
                        verify_archive(archive)

    def test_duplicate_member_names_are_rejected(self):
        members = valid_payload()
        with build_archive(members, duplicates=('data.json',)) as archive:
            with self.assertRaisesRegex(ValueError, '重复'):
                verify_archive(archive)

    def test_unsafe_member_path_in_manifest_is_rejected(self):
        members = valid_payload()
        manifest = json.loads(members['manifest.json'])
        members['evil.txt'] = b'x'
        manifest['members']['evil.txt'] = fingerprint(b'x')
        members['manifest.json'] = json.dumps(manifest).encode()
        with build_archive(members) as archive:
            with self.assertRaisesRegex(ValueError, '不安全路径'):
                verify_archive(archive)

    def test_member_fingerprint_mismatch_is_rejected(self):
        members = valid_payload()
        manifest = json.loads(members['manifest.json'])
        manifest['members']['attachments/f.bin'] = {'size': 1, 'sha256': '0' * 64}
        members['manifest.json'] = json.dumps(manifest).encode()
        with build_archive(members) as archive:
            with self.assertRaisesRegex(ValueError, '校验失败'):
                verify_archive(archive)

    def test_invalid_data_payload_shape_is_rejected(self):
        members = valid_payload()
        members['data.json'] = b'"just a string"'
        manifest = json.loads(members['manifest.json'])
        manifest['members']['data.json'] = fingerprint(b'"just a string"')
        members['manifest.json'] = json.dumps(manifest).encode()
        with build_archive(members) as archive:
            with self.assertRaises(ValueError):
                verify_archive(archive)
        members = valid_payload()
        members['data.json'] = json.dumps({'attachments': 'not-a-list'}).encode()
        manifest = json.loads(members['manifest.json'])
        manifest['members']['data.json'] = fingerprint(members['data.json'])
        members['manifest.json'] = json.dumps(manifest).encode()
        with build_archive(members) as archive:
            with self.assertRaises(ValueError):
                verify_archive(archive)

    def test_members_must_match_attachment_metadata(self):
        members = valid_payload()
        # Manifest lists the attachment member but the archive omits the file:
        # reading it raises KeyError which is reported as a corrupted manifest.
        members.pop('attachments/f.bin')
        with build_archive(members) as archive:
            with self.assertRaises(ValueError):
                verify_archive(archive)
        members = valid_payload()
        members['attachments/f.bin'] = b'changed content'
        with build_archive(members) as archive:
            with self.assertRaisesRegex(ValueError, '校验失败'):
                verify_archive(archive)
        # Metadata references a different path than the manifest contains.
        members = valid_payload()
        data = json.loads(members['data.json'])
        data['attachments'][0]['storage_path'] = 'other.bin'
        members['data.json'] = json.dumps(data).encode('utf-8')
        manifest = json.loads(members['manifest.json'])
        manifest['members']['data.json'] = fingerprint(members['data.json'])
        members['manifest.json'] = json.dumps(manifest).encode('utf-8')
        with build_archive(members) as archive:
            with self.assertRaisesRegex(ValueError, '不一致'):
                verify_archive(archive)
