import io
import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch
from django.core.management import call_command
from django.test import TestCase
from bbtalk.models import User, Identity

class InitializationTests(TestCase):
    def test_random_credential_is_private_and_not_logged_or_rotated(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {
            'DATA_DIR': directory, 'ADMIN_USERNAME': 'firstadmin', 'ADMIN_PASSWORD': '', 'CREATE_DEMO_USER': '',
        }):
            output = io.StringIO()
            call_command('init_system', stdout=output)
            path = Path(directory) / 'credentials' / 'initial-admin.json'
            credential = json.loads(path.read_text(encoding='utf-8'))
            password = credential['password']
            self.assertGreaterEqual(len(password), 32)
            self.assertNotIn(password, output.getvalue())
            identity = Identity.objects.get(identifier='firstadmin')
            self.assertTrue(identity.check_password(password))
            self.assertFalse(User.objects.filter(username='demo').exists())
            if os.name != 'nt':
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
                self.assertEqual(path.parent.stat().st_mode & 0o777, 0o700)
            with patch.dict(os.environ, {'ADMIN_PASSWORD': 'different-explicit-password'}):
                call_command('init_system', stdout=io.StringIO())
            identity.refresh_from_db()
            self.assertTrue(identity.check_password(password))
            self.assertEqual(json.loads(path.read_text(encoding='utf-8')), credential)

    def test_explicit_password_does_not_create_credential_file_or_log_password(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {
            'DATA_DIR': directory, 'ADMIN_USERNAME': 'explicitadmin',
            'ADMIN_PASSWORD': 'explicit-strong-password', 'CREATE_DEMO_USER': '',
        }):
            output = io.StringIO()
            call_command('init_system', stdout=output)
            self.assertTrue(Identity.objects.get(identifier='explicitadmin').check_password('explicit-strong-password'))
            self.assertNotIn('explicit-strong-password', output.getvalue())
            self.assertFalse((Path(directory) / 'credentials').exists())
