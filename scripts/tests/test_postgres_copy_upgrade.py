"""Safety checks for the production copy-and-switch orchestrator (no real server)."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

SPEC = importlib.util.spec_from_file_location('copy_upgrade', Path(__file__).parents[1] / 'postgres-copy-upgrade.py')
ops = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ops)


class CopyUpgradeSafetyTests(unittest.TestCase):
    def test_database_credentials_are_decoded_and_target_is_explicit(self):
        url = 'postgresql://name:p%40ss%3Aword@db:5433/original?sslmode=require'
        env = ops.database_env(url, 'separate_copy')
        self.assertEqual(env['PGPASSWORD'], 'p@ss:word')
        self.assertEqual(env['PGDATABASE'], 'separate_copy')
        self.assertEqual(env['PGSSLMODE'], 'require')
        self.assertEqual(ops.target_url(url, 'separate_copy'),
                         'postgresql://name:p%40ss%3Aword@db:5433/separate_copy?sslmode=require')

    def test_unsupported_connection_options_fail_closed(self):
        with self.assertRaises(RuntimeError):
            ops.database_env('postgresql://u:p@db/original?sslcert=/unmounted/file')

    def test_multiline_secret_rejected_without_echo(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaisesRegex(RuntimeError, '^Environment cannot') as caught:
                ops.env_file(Path(root) / 'env', {'SECRET_KEY': 'private\nnext'})
            self.assertNotIn('private', str(caught.exception))

    def test_manifest_detects_changed_content_and_extra_files(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)
            (path / '.hidden').write_text('first')
            first = ops.manifest(path)
            (path / '.hidden').write_text('other')
            self.assertNotEqual(first, ops.manifest(path))
            (path / 'extra').write_text('first')
            self.assertEqual(len(ops.manifest(path)), 2)

    def fixture(self, phase='cutover'):
        value = object.__new__(ops.Upgrade)
        value.args = Mock(phase=phase, image='test')
        value.root = Path(tempfile.gettempdir())
        value.old, value.candidate, value.legacy = 'old', 'candidate', 'retained'
        value.stopped = value.published = value.renamed = False
        for method in ('inspect', 'docker', 'worker_task', 'backup_and_clone', 'prepare_service', 'prepare_images', 'publish'):
            setattr(value, method, Mock())
        return value

    def test_failed_clone_restarts_original_before_publication(self):
        value = self.fixture()
        value.backup_and_clone.side_effect = RuntimeError('copy rejected')
        with patch.object(ops.subprocess, 'run'), self.assertRaisesRegex(RuntimeError, 'copy rejected'):
            value.execute()
        value.docker.assert_any_call('start', 'old', quiet=True)
        value.publish.assert_not_called()

    def test_rehearsal_never_stops_or_publishes_production(self):
        value = self.fixture('rehearse')
        value.execute()
        self.assertFalse(value.stopped)
        self.assertFalse(any(call.args[:2] == ('stop', 'old') for call in value.docker.call_args_list))
        value.publish.assert_not_called()

    def test_no_automatic_rollback_after_public_writes_possible(self):
        value = self.fixture()
        def publish_failure():
            value.published = True
            raise RuntimeError('public health failed')
        value.publish.side_effect = publish_failure
        with self.assertRaisesRegex(RuntimeError, 'public health failed'):
            value.execute()
        self.assertFalse(any(call.args[:2] == ('start', 'old') for call in value.docker.call_args_list))

    def test_staged_image_digest_and_content_ids_are_checked(self):
        with tempfile.TemporaryDirectory() as root:
            value = self.fixture()
            value.directory = Path(root)
            value.args.staged_images_run_id = 's20261012'
            directory = value.directory / '.tmp' / 'migration-images' / 's20261012'
            directory.mkdir(parents=True)
            (directory / 'READY').touch()
            mapping = {'image': 'test', 'image_id': 'sha256:' + 'a' * 64,
                       'postgres_image_id': 'sha256:' + 'b' * 64, 'revision': 'c' * 40}
            (directory / 'image-map.json').write_text(json.dumps(mapping))
            (directory / 'READY').write_text(ops.file_hash(directory / 'image-map.json'))
            value.docker.side_effect = [json.dumps([{'Id': 'a' * 64, 'Config': {
                'Labels': {'org.opencontainers.image.revision': 'c' * 40}}}]).encode(),
                json.dumps([{'Id': 'sha256:' + 'b' * 64}]).encode()]
            ops.Upgrade.prepare_images(value)
            self.assertEqual(value.runtime_image, 'a' * 64)
            self.assertEqual(value.pg_image, 'b' * 64)
            mapping['image'] = 'different-reference'
            (directory / 'image-map.json').write_text(json.dumps(mapping))
            (directory / 'READY').write_text(ops.file_hash(directory / 'image-map.json'))
            with self.assertRaisesRegex(RuntimeError, 'provenance differs'):
                ops.Upgrade.prepare_images(value)

    def test_staged_images_require_ready_marker(self):
        with tempfile.TemporaryDirectory() as root:
            value = self.fixture()
            value.directory = Path(root)
            value.args.staged_images_run_id = 's20261012'
            with self.assertRaisesRegex(RuntimeError, 'not been verified'):
                ops.Upgrade.prepare_images(value)
            value.docker.assert_not_called()

    def test_boot_does_not_initialize_or_migrate(self):
        self.assertNotIn('cli init', ops.BOOT)
        self.assertNotIn('cli migrate', ops.BOOT)
        self.assertIn('supervisord', ops.BOOT)


if __name__ == '__main__':
    unittest.main()
