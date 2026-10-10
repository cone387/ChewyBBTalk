from core import config, environment


def test_root_env_preserves_process_values_and_literal_secrets(monkeypatch, tmp_path):
    for name in ('ADMIN_PASSWORD', 'VITE_SITE_NAME'):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv('BACKEND_PORT', '9999')
    path = tmp_path / '.env'
    path.write_text(
        'BACKEND_PORT=8123\nADMIN_PASSWORD=p${HOME}#literal\nVITE_SITE_NAME=My Notes\n',
        encoding='utf8',
    )
    monkeypatch.chdir(tmp_path.parent)
    environment.load_environment(path)
    assert config.os.getenv('BACKEND_PORT') == '9999'
    assert config.os.getenv('ADMIN_PASSWORD') == 'p${HOME}#literal'
    assert config.os.getenv('VITE_SITE_NAME') == 'My Notes'
    environment.load_environment(tmp_path / 'missing.env')


def test_relative_paths_use_config_root_not_working_directory(monkeypatch, tmp_path):
    monkeypatch.setattr(config, 'ROOT_DIR', tmp_path)
    monkeypatch.setenv('BACKUP_ROOT', 'state/backups')
    monkeypatch.chdir(tmp_path.parent)
    settings = config.Settings(
        data_dir='state/data',
        media_root='state/media',
        database_url='sqlite:///:memory:',
        secret_key='test',
    )
    assert settings.data_dir == tmp_path / 'state/data'
    assert settings.media_root == tmp_path / 'state/media'
    assert settings.backup_root == tmp_path / 'state/backups'
    from backups.service import backup_root

    assert backup_root(settings) == tmp_path / 'state/backups'
    assert backup_root(settings, tmp_path / 'explicit') == tmp_path / 'explicit'


def test_blank_paths_keep_safe_defaults(monkeypatch, tmp_path):
    monkeypatch.setattr(config, 'BACKEND_DIR', tmp_path)
    for name in ('DATA_DIR', 'MEDIA_ROOT', 'DATABASE_URL', 'BACKUP_ROOT'):
        monkeypatch.setenv(name, '')
    settings = config.Settings(secret_key='test')
    assert settings.data_dir == tmp_path / 'var/data'
    assert settings.media_root == tmp_path / 'var/media'
    assert settings.backup_root == tmp_path / 'var/data/backups'
    assert settings.database_url == 'sqlite:///' + (tmp_path / 'var/db.sqlite3').as_posix()
