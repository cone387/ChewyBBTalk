"""Coverage for the init_system management command: admin credentials and demo seeding."""
import io
import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.core.management import CommandError, call_command
from django.test import TestCase

from bbtalk.models import BBTalk, Comment, Identity, Tag, User


class InitSystemCommandTests(TestCase):
    def run_command(self, env=None):
        output = io.StringIO()
        call_command('init_system', stdout=output)
        return output.getvalue()

    def env(self, directory, **overrides):
        values = {
            'DATA_DIR': directory,
            'ADMIN_USERNAME': 'admin',
            'ADMIN_EMAIL': 'admin@example.com',
            'ADMIN_PASSWORD': 'explicit-admin-password',
            'CREATE_DEMO_USER': '',
        }
        values.update(overrides)
        return values

    def test_demo_user_seeds_full_dataset_and_is_skipped_when_present(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, self.env(directory, ADMIN_USERNAME='seed-admin',
                                                  CREATE_DEMO_USER='true')):
                output = self.run_command()
                self.assertIn('Demo', output)
                demo = User.objects.get(username='demo')
                self.assertFalse(demo.is_staff)
                identity = Identity.objects.get(user=demo, identity_type='password')
                self.assertTrue(identity.check_password('demo123'))
                self.assertEqual(Tag.objects.filter(user=demo).count(), 6)
                records = BBTalk.objects.filter(user=demo)
                self.assertEqual(records.count(), 10)
                self.assertEqual(Comment.objects.filter(user=demo).count(), 4)
                pinned = records.filter(is_pinned=True).get()
                self.assertEqual(pinned.visibility, 'public')
                self.assertTrue(records.filter(visibility='private').exists())
                sample = records.first()
                # Demo content carries source context metadata.
                self.assertTrue(all('source' in (record.context or {}) for record in records))
                second = self.run_command()
                self.assertIn('已存在', second)
                self.assertEqual(BBTalk.objects.filter(user=demo).count(), 10)

    def test_demo_creation_failure_is_contained_and_rolled_back(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, self.env(directory, ADMIN_USERNAME='fail-admin',
                                                  CREATE_DEMO_USER='1')):
                with patch('bbtalk.management.commands.init_system.Tag.objects.create',
                           side_effect=RuntimeError('seeding exploded')):
                    output = self.run_command()
                self.assertIn('创建 Demo 账号失败', output)
                self.assertFalse(User.objects.filter(username='demo').exists())
                self.assertIn('系统初始化完成', output)

    def test_admin_creation_failure_raises_command_error(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, self.env(directory, ADMIN_USERNAME='boom-admin')):
                with patch('bbtalk.management.commands.init_system.User.objects.create',
                           side_effect=RuntimeError('db exploded')):
                    with self.assertRaisesMessage(CommandError, '创建管理员账号失败'):
                        self.run_command()
                self.assertFalse(User.objects.filter(username='boom-admin').exists())

    def test_existing_admin_is_skipped(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, self.env(directory, ADMIN_USERNAME='skip-admin')):
                self.assertIn('成功创建管理员账号', self.run_command())
                self.assertIn('已存在', self.run_command())
                self.assertEqual(User.objects.filter(username='skip-admin').count(), 1)

    def test_credential_directory_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, self.env(directory, ADMIN_USERNAME='symlink-admin',
                                                 ADMIN_PASSWORD='')):
                with patch.object(Path, 'is_symlink', return_value=True):
                    with self.assertRaisesMessage(CommandError, '创建管理员账号失败'):
                        self.run_command()

    def test_credential_file_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, self.env(directory, ADMIN_USERNAME='file-symlink-admin',
                                                 ADMIN_PASSWORD='')):
                with patch.object(Path, 'is_symlink', side_effect=[False, True]):
                    with self.assertRaisesMessage(CommandError, '凭据文件不能是符号链接'):
                        self.run_command()

    def test_windows_account_lookup_failure_is_rejected(self):
        if os.name != 'nt':
            self.skipTest('windows-only branch')
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, self.env(directory, ADMIN_USERNAME='acl-admin', ADMIN_PASSWORD='')):
                with patch.dict(os.environ, {'USERNAME': '', 'USERDOMAIN': ''}):
                    with self.assertRaisesMessage(CommandError, '创建管理员账号失败'):
                        self.run_command()

    def test_saved_credential_is_reused_for_matching_username(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = self.env(directory, ADMIN_USERNAME='reuse-admin', ADMIN_PASSWORD='')
            with patch.dict(os.environ, environment):
                first = io.StringIO()
                call_command('init_system', stdout=first)
                credential = json.loads(
                    (Path(directory) / 'credentials' / 'initial-admin.json').read_text(encoding='utf-8'))
                User.objects.get(username='reuse-admin').delete()
                self.run_command()
            identity = Identity.objects.get(identifier='reuse-admin')
            self.assertTrue(identity.check_password(credential['password']))
            self.assertEqual(
                json.loads((Path(directory) / 'credentials' / 'initial-admin.json').read_text(encoding='utf-8')),
                credential)

    def test_saved_credential_for_other_username_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, self.env(directory, ADMIN_USERNAME='first-admin', ADMIN_PASSWORD='')):
                self.run_command()
            with patch.dict(os.environ, self.env(directory, ADMIN_USERNAME='second-admin', ADMIN_PASSWORD='')):
                with self.assertRaisesMessage(CommandError, '已有初始化凭据不匹配'):
                    self.run_command()
            self.assertFalse(User.objects.filter(username='second-admin').exists())
