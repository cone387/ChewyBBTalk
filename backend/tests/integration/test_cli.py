import json
from unittest.mock import patch

import pytest
from sqlalchemy import func, select

from cli import commands as cli
from models import BBTalk, Identity, StorageConfig, User
from services.security import check_password


def test_initialization_is_idempotent_and_demo_opt_in(app,monkeypatch,capsys):
    monkeypatch.setenv('ADMIN_USERNAME','native-admin')
    monkeypatch.setenv('ADMIN_PASSWORD','provided-password')
    with app.state.sessions() as db:
        cli.initialize(db,app.state.settings)
        monkeypatch.setenv('ADMIN_PASSWORD','must-not-reset')
        cli.initialize(db,app.state.settings)
        user=db.scalar(select(User).where(User.username=='native-admin'))
        identity=db.scalar(select(Identity).where(Identity.user_id==user.id))
        assert user.is_staff and user.is_superuser
        assert check_password('provided-password',identity.credential)
        assert not db.scalar(select(User).where(User.username=='demo'))
        monkeypatch.setenv('CREATE_DEMO_USER','true')
        cli.initialize(db,app.state.settings)
        count=db.scalar(select(func.count()).select_from(BBTalk))
        assert count>0
        cli.initialize(db,app.state.settings)
        assert db.scalar(select(func.count()).select_from(BBTalk))==count
    assert 'provided-password' not in capsys.readouterr().out


def test_generated_credential_reused_and_not_logged(app,monkeypatch,capsys):
    monkeypatch.delenv('ADMIN_PASSWORD',raising=False)
    monkeypatch.setenv('ADMIN_USERNAME','generated-admin')
    with app.state.sessions() as db:
        cli.initialize(db,app.state.settings)
        password,path=cli.initial_credential(app.state.settings,'generated-admin')
        assert len(password)>=24
        assert cli.initial_credential(app.state.settings,'generated-admin')==(password,path)
        assert json.loads(path.read_text())['password']==password
        with pytest.raises(ValueError): cli.initial_credential(app.state.settings,'another-user')
    assert password not in capsys.readouterr().out


def test_cli_commands_on_disposable_database(app,monkeypatch,capsys):
    monkeypatch.setattr(cli,'Settings',lambda:app.state.settings)
    cli.main(['check'])
    cli.main(['migrate'])
    monkeypatch.setenv('ADMIN_PASSWORD','cli-admin-password')
    cli.main(['init'])
    with patch('cli.commands.getpass.getpass',return_value='new-account-password'):
        cli.main(['create-user','cli-user','--admin','--email','cli@example.com'])
    with app.state.sessions() as db:
        user=db.scalar(select(User).where(User.username=='cli-user'))
        assert user.is_staff
        config=StorageConfig(user_id=user.id,name='plain',s3_secret_access_key='plaintext')
        db.add(config); db.commit(); config_id=config.id
    cli.main(['encrypt-storage-secrets'])
    with app.state.sessions() as db:
        assert db.get(StorageConfig,config_id).s3_secret_access_key.startswith('enc:v1:')
    cli.main(['backup','--user-id',str(app.state.owner_id),'--dry-run'])
    cli.main(['backup','--dry-run'])
    cli.main(['backup','--user-id',str(app.state.owner_id),'--keep','1'])
    with pytest.raises(SystemExit): cli.main(['backup','--keep','0'])
    with patch('cli.commands.code.interact') as shell:
        cli.main(['shell']); assert 'db' in shell.call_args.kwargs['local']


def test_config_paths_and_secret_reuse(tmp_path,monkeypatch):
    from core.config import Settings, secret_key
    monkeypatch.delenv('SECRET_KEY',raising=False)
    first=secret_key(tmp_path)
    assert first==secret_key(tmp_path)
    (tmp_path/'.secret_key').write_text('')
    with pytest.raises(RuntimeError): secret_key(tmp_path)
    monkeypatch.setenv('SECRET_KEY','explicit')
    assert secret_key(tmp_path)=='explicit'
    assert Settings(database_url='postgres://u:p@host/db').database_url.startswith('postgresql+psycopg2://')
    assert Settings(database_url='mysql://u:p@host/db').database_url.startswith('mysql+pymysql://')
    assert Settings(database_url='sqlite:///:memory:').database_url=='sqlite:///:memory:'
    from sqlalchemy import inspect

    from database.session import database
    from database.upgrade import upgrade
    engine,_=database(Settings(database_url='sqlite:///:memory:'))
    try:
        upgrade(engine)
        assert 'cb_users' in inspect(engine).get_table_names()
    finally:
        engine.dispose()


def test_credential_permissions_and_symlink_guards(app,monkeypatch):
    import os
    from pathlib import Path
    from types import SimpleNamespace
    with patch.object(Path,'is_symlink',return_value=True):
        with pytest.raises(ValueError): cli.initial_credential(app.state.settings,'guarded')
    with patch.object(Path,'is_symlink',side_effect=[False,True]):
        with pytest.raises(ValueError): cli.initial_credential(app.state.settings,'guarded')
    # Exercise POSIX permission calls without changing pathlib's host platform.
    posix=SimpleNamespace(**vars(os));posix.name='posix'
    with patch.object(cli,'os',posix):
        password,path=cli.initial_credential(app.state.settings,'guarded')
        assert cli.initial_credential(app.state.settings,'guarded')==(password,path)
    windows=SimpleNamespace(**vars(os));windows.name='nt'
    monkeypatch.delenv('USERNAME',raising=False)
    with patch.object(cli,'os',windows):
        with pytest.raises(ValueError): cli.initial_credential(app.state.settings,'guarded')


def test_installed_entrypoints_forward_arguments(monkeypatch):
    monkeypatch.setattr(cli.sys,'argv',['command','--example'])
    with patch.object(cli,'main') as main:
        cli.migrate();main.assert_called_with(['migrate','--example'])
        cli.init();main.assert_called_with(['init','--example'])
    with patch('uvicorn.run') as run:
        cli.dev();assert run.call_args.args==('main:app',)
        assert run.call_args.kwargs['reload'] is True
        monkeypatch.setenv('WEB_CONCURRENCY', '3')
        monkeypatch.setenv('BACKEND_PORT', '8123')
        cli.main(['serve'])
        assert run.call_args.kwargs['workers'] == 3
        assert run.call_args.kwargs['port'] == 8123
        assert run.call_args.kwargs['reload'] is False
    with patch('pytest.main',return_value=0) as run:
        with pytest.raises(SystemExit) as result: cli.test()
        assert result.value.code==0 and run.call_args.args[0]==['tests','--example']
