"""Keep infrastructure and reusable services independent of HTTP composition."""

import ast
import os
import runpy
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

import application


def test_backend_uses_flat_layout():
    root = Path(application.__file__).resolve().parent
    assert root == Path(__file__).resolve().parents[2]
    assert (root / 'main.py').is_file()
    for directory in (
        'api',
        'services',
        'models',
        'schemas',
        'core',
        'database',
        'storage',
        'backups',
        'admin',
        'cli',
    ):
        assert (root / directory / '__init__.py').is_file()


def test_services_and_infrastructure_do_not_import_routes():
    package = Path(application.__file__).resolve().parent
    for directory in ('core', 'database', 'models', 'services', 'storage', 'backups', 'schemas'):
        for path in (package / directory).rglob('*.py'):
            tree = ast.parse(path.read_text(encoding='utf8'))
            imports = []
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom):
                    imports.append(node.module or '')
                elif isinstance(node, ast.Import):
                    imports.extend(alias.name for alias in node.names)
            forbidden = ('api', 'application', 'main', 'cli', 'fastapi')
            assert not any(
                module == name or module.startswith(name + '.')
                for module in imports
                for name in forbidden
            ), path


def test_importing_factory_and_cli_does_not_create_runtime_files(tmp_path):
    env = {**os.environ, 'DATA_DIR': str(tmp_path / 'data'), 'MEDIA_ROOT': str(tmp_path / 'media')}
    result = subprocess.run(
        [sys.executable, '-c', 'import application; import cli.commands'],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert list(tmp_path.iterdir()) == []


def test_asgi_and_cli_entrypoints():
    with patch('application.create_app', return_value='test-app') as factory:
        namespace = runpy.run_module('main')
        assert namespace['app'] == 'test-app'
        factory.assert_called_once_with()
    with patch('cli.commands.main') as command:
        runpy.run_module('cli', run_name='__main__')
        command.assert_called_once_with()
