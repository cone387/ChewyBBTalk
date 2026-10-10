"""Exercise host backups with a root .env and a fake container runtime."""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
BASH = os.environ.get('BASH_BIN') or shutil.which('bash')


@unittest.skipUnless(BASH, 'Bash is required')
class BackupEnvironmentTests(unittest.TestCase):
    def test_root_configuration_is_loaded_from_another_working_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            scripts = root / 'scripts'
            scripts.mkdir()
            for name in ('backup-host.sh', 'deploy-env.sh'):
                (scripts / name).write_text(
                    (ROOT / 'scripts' / name).read_text(encoding='utf8'),
                    encoding='utf8', newline='\n',
                )
            (root / '.env').write_text(
                'BACKUP_CONTAINER=configured-backend\nBACKUP_KEEP=9\n'
                'BACKUP_USER_ID=42\nBACKUP_DRY_RUN=true\nSECRET_KEY=$(exit 77)\n',
                encoding='utf8',
            )
            docker = scripts / 'docker'
            docker.write_text(
                '#!/usr/bin/env bash\n'
                'if [[ "$1" == inspect ]]; then echo true; '
                'elif [[ "$1" == exec && "$3" == sh ]]; then exit 0; '
                'else printf "%s\\n" "$*"; fi\n',
                newline='\n',
            )
            docker.chmod(0o755)
            env = {key: value for key, value in os.environ.items() if not key.startswith('BACKUP_')}
            env['PATH'] = str(scripts) + os.pathsep + env['PATH']
            result = subprocess.run(
                [BASH, str(scripts / 'backup-host.sh')], cwd=ROOT, env=env,
                capture_output=True, text=True, encoding='utf8', timeout=10,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('configured-backend python -m cli backup --keep 9 --user-id 42 --dry-run', result.stdout)
            self.assertNotIn('exit 77', result.stdout + result.stderr)
