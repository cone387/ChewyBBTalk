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

    def test_candidate_stop_timeout_does_not_prevent_original_restart(self):
        value = self.fixture()
        value.backup_and_clone.side_effect = RuntimeError('copy rejected')
        with patch.object(ops.subprocess, 'run', side_effect=ops.subprocess.TimeoutExpired(
            ['docker', 'stop', 'candidate'], 60
        )), self.assertRaisesRegex(RuntimeError, 'copy rejected'):
            value.execute()
        value.docker.assert_any_call('start', 'old', quiet=True)
        value.publish.assert_not_called()

    def rehearsal_fixture(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        directory = Path(temporary.name).resolve() / 'deployment'
        directory.mkdir()
        run_id = 'review_run_123'
        backup = directory.parent / 'migration-backups' / run_id
        backup.mkdir(parents=True)
        (backup / 'verify.json').write_text('{"ok":true}', encoding='utf8')
        info = {
            'Config': {'Env': ['DATABASE_URL=postgresql://user:password@db/chewy_bbtalk_native_' + run_id]},
            'Mounts': [{'Type': 'bind', 'Source': str(directory.parent / ('chewy-bbtalk-data-' + run_id)),
                        'Destination': '/app/data'}],
            'HostConfig': {'PortBindings': {'4010/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '4011'}]}},
        }
        return run_id, directory, backup, info

    def test_stop_rehearsal_only_stops_verified_isolated_candidate(self):
        run_id, directory, backup, info = self.rehearsal_fixture()
        with patch.object(ops.Path, 'cwd', return_value=directory), \
                patch.object(ops.subprocess, 'check_output', return_value=json.dumps([info]).encode()) as inspect, \
                patch.object(ops.subprocess, 'run') as run:
            ops.stop_rehearsal(run_id)
        name = 'chewy-bbtalk-check-' + run_id
        inspect.assert_called_once_with(['docker', 'inspect', name])
        run.assert_called_once_with(['docker', 'stop', '--time', '30', name],
                                   check=True, timeout=60, stdout=ops.subprocess.DEVNULL)
        self.assertTrue((backup / 'verify.json').is_file())

    def test_stop_rehearsal_refuses_missing_verification_or_completed_cutover(self):
        for state in ('unverified', 'cutover_complete'):
            with self.subTest(state=state):
                run_id, directory, backup, _ = self.rehearsal_fixture()
                if state == 'unverified':
                    (backup / 'verify.json').unlink()
                else:
                    (backup / 'CUTOVER_COMPLETE').touch()
                with patch.object(ops.Path, 'cwd', return_value=directory), \
                        patch.object(ops.subprocess, 'check_output') as inspect, \
                        patch.object(ops.subprocess, 'run') as run, \
                        self.assertRaisesRegex(RuntimeError, 'verified rehearsal'):
                    ops.stop_rehearsal(run_id)
                inspect.assert_not_called()
                run.assert_not_called()

    def test_stop_rehearsal_refuses_mismatched_database_or_data(self):
        for mismatch in ('database', 'missing_database', 'source', 'destination', 'extra_mount'):
            with self.subTest(mismatch=mismatch):
                run_id, directory, _, info = self.rehearsal_fixture()
                if mismatch == 'database':
                    info['Config']['Env'] = ['DATABASE_URL=postgresql://user:password@db/original']
                elif mismatch == 'missing_database':
                    info['Config']['Env'] = []
                elif mismatch == 'source':
                    info['Mounts'][0]['Source'] = str(directory / 'production-data')
                elif mismatch == 'destination':
                    info['Mounts'][0]['Destination'] = '/production-data'
                else:
                    info['Mounts'].append(dict(info['Mounts'][0]))
                with patch.object(ops.Path, 'cwd', return_value=directory), \
                        patch.object(ops.subprocess, 'check_output', return_value=json.dumps([info]).encode()), \
                        patch.object(ops.subprocess, 'run') as run, \
                        self.assertRaisesRegex(RuntimeError, 'identity mismatch'):
                    ops.stop_rehearsal(run_id)
                run.assert_not_called()

    def test_stop_rehearsal_refuses_public_or_unexpected_ports(self):
        for bindings in (
            {'4010/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '4011'}]},
            {'4010/tcp': [{'HostIp': '', 'HostPort': '4011'}]},
            {'4010/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '4010'}]},
            {'4010/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '4011'}], '8020/tcp': []},
            {'4010/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '4011'},
                          {'HostIp': '0.0.0.0', 'HostPort': '4011'}]},
            {},
        ):
            with self.subTest(bindings=bindings):
                run_id, directory, _, info = self.rehearsal_fixture()
                info['HostConfig']['PortBindings'] = bindings
                with patch.object(ops.Path, 'cwd', return_value=directory), \
                        patch.object(ops.subprocess, 'check_output', return_value=json.dumps([info]).encode()), \
                        patch.object(ops.subprocess, 'run') as run, \
                        self.assertRaisesRegex(RuntimeError, 'port|binding|isolated'):
                    ops.stop_rehearsal(run_id)
                run.assert_not_called()

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
