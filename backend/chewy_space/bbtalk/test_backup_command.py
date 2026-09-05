import io
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.core.management import call_command, CommandError
from django.test import TestCase

from .models import User


class BackupDataCommandTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='backup-user')

    def test_creates_per_user_zip_atomically(self):
        with tempfile.TemporaryDirectory() as output_dir:
            with patch('bbtalk.management.commands.backup_data.DataExporter') as exporter_cls:
                exporter_cls.return_value.export_to_zip.return_value = io.BytesIO(b'backup-bytes')

                call_command('backup_data', output_dir=output_dir, keep=7)

            files = list((Path(output_dir) / str(self.user.id)).glob('*.zip'))
            self.assertEqual(len(files), 1)
            self.assertEqual(files[0].read_bytes(), b'backup-bytes')
            self.assertFalse(list(Path(output_dir).rglob('*.tmp')))

    def test_keep_removes_old_backups_for_selected_user(self):
        with tempfile.TemporaryDirectory() as output_dir:
            user_dir = Path(output_dir) / str(self.user.id)
            user_dir.mkdir(parents=True)
            old_file = user_dir / 'old.zip'
            old_file.write_bytes(b'old')

            with patch('bbtalk.management.commands.backup_data.DataExporter') as exporter_cls:
                exporter_cls.return_value.export_to_zip.return_value = io.BytesIO(b'new')
                call_command('backup_data', output_dir=output_dir, keep=1)

            files = list(user_dir.glob('*.zip'))
            self.assertEqual(len(files), 1)
            self.assertNotEqual(files[0].name, 'old.zip')

    def test_dry_run_does_not_write_files(self):
        with tempfile.TemporaryDirectory() as output_dir:
            with patch('bbtalk.management.commands.backup_data.DataExporter') as exporter_cls:
                call_command('backup_data', output_dir=output_dir, dry_run=True)

            exporter_cls.assert_not_called()
            self.assertFalse(list(Path(output_dir).rglob('*')))

    def test_user_id_limits_backup_scope(self):
        other_user = User.objects.create(username='other-backup-user')
        with tempfile.TemporaryDirectory() as output_dir:
            with patch('bbtalk.management.commands.backup_data.DataExporter') as exporter_cls:
                exporter_cls.return_value.export_to_zip.return_value = io.BytesIO(b'one-user')
                call_command('backup_data', output_dir=output_dir, user_id=self.user.id)

            self.assertTrue((Path(output_dir) / str(self.user.id)).exists())
            self.assertFalse((Path(output_dir) / str(other_user.id)).exists())
            exporter_cls.assert_called_once()
            exporter_cls.assert_called_with(self.user)

    def test_unknown_user_id_is_rejected(self):
        with tempfile.TemporaryDirectory() as output_dir:
            with self.assertRaises(CommandError):
                call_command('backup_data', output_dir=output_dir, user_id=99999)
