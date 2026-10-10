
from chewy_api.core import config


def clean_environment(monkeypatch, tmp_path):
    monkeypatch.setattr(config, 'BACKEND_DIR', tmp_path)
    for key in ('DATA_DIR', 'MEDIA_ROOT', 'DATABASE_URL', 'SECRET_KEY'):
        monkeypatch.delenv(key, raising=False)


def test_fresh_install_writes_only_to_var(monkeypatch, tmp_path):
    clean_environment(monkeypatch, tmp_path)
    settings = config.Settings()
    assert settings.data_dir == tmp_path/'var/data'
    assert settings.media_root == tmp_path/'var/media'
    assert settings.database_url == 'sqlite:///' + (tmp_path/'var/db.sqlite3').as_posix()
    assert (tmp_path/'var/data/.secret_key').is_file()
    assert not (tmp_path/'chewy_space').exists()


def test_existing_database_and_secret_keep_original_paths(monkeypatch, tmp_path):
    clean_environment(monkeypatch, tmp_path)
    legacy = tmp_path/'chewy_space'
    (legacy/'data').mkdir(parents=True)
    (legacy/'db.sqlite3').write_bytes(b'existing database sentinel')
    (legacy/'data/.secret_key').write_text('existing-signing-key')
    settings = config.Settings()
    assert settings.secret_key == 'existing-signing-key'
    assert settings.data_dir == legacy/'data'
    assert settings.media_root == legacy/'media'
    assert settings.database_url == 'sqlite:///' + (legacy/'db.sqlite3').as_posix()
    assert (legacy/'db.sqlite3').read_bytes() == b'existing database sentinel'
    assert not (tmp_path/'var').exists()


def test_existing_secret_or_media_alone_is_detected(monkeypatch, tmp_path):
    clean_environment(monkeypatch, tmp_path)
    legacy = tmp_path/'chewy_space'
    (legacy/'media').mkdir(parents=True)
    assert config.default_runtime_root() == legacy
    (legacy/'media').rmdir()
    (legacy/'data').mkdir()
    (legacy/'data/.secret_key').write_text('persisted-key')
    assert config.default_runtime_root() == legacy


def test_explicit_paths_override_discovery(monkeypatch, tmp_path):
    clean_environment(monkeypatch, tmp_path)
    selected = tmp_path/'selected'
    monkeypatch.setenv('DATA_DIR', str(selected/'data'))
    monkeypatch.setenv('MEDIA_ROOT', str(selected/'media'))
    monkeypatch.setenv('DATABASE_URL', 'sqlite:///' + (selected/'db.sqlite3').as_posix())
    monkeypatch.setenv('SECRET_KEY', 'explicit-key')
    settings = config.Settings()
    assert settings.data_dir == selected/'data'
    assert settings.media_root == selected/'media'
    assert settings.database_url == 'sqlite:///' + (selected/'db.sqlite3').as_posix()
    assert not (tmp_path/'var').exists()


def test_existing_custom_relative_database_is_preserved(monkeypatch, tmp_path):
    clean_environment(monkeypatch, tmp_path)
    legacy = tmp_path/'chewy_space'
    legacy.mkdir()
    (legacy/'custom.sqlite3').touch()
    settings = config.Settings(database_url='sqlite:///custom.sqlite3', secret_key='explicit')
    assert settings.database_url == 'sqlite:///' + (legacy/'custom.sqlite3').as_posix()


def test_postgresql_aliases_load_the_installed_driver(monkeypatch, tmp_path):
    from chewy_api.db.session import database
    clean_environment(monkeypatch, tmp_path)
    for scheme in ('postgres', 'postgresql', 'postgresql+psycopg2'):
        settings = config.Settings(database_url=scheme+'://test:test@localhost/test', secret_key='test')
        assert settings.database_url == 'postgresql+psycopg2://test:test@localhost/test'
        engine, _ = database(settings)
        try:
            assert engine.dialect.driver == 'psycopg2'
        finally:
            engine.dispose()
