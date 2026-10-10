"""Native administration commands: python -m chewy_api.cli --help."""

import argparse
import code
import getpass
import json
import os
import secrets
import subprocess
import sys
from datetime import timedelta

from sqlalchemy import select, text

from chewy_api.core.config import Settings
from chewy_api.db.models import BBTalk, Comment, StorageConfig, Tag, User, now
from chewy_api.db.session import database
from chewy_api.db.upgrade import upgrade
from chewy_api.services.security import create_user, encrypt_secret


def initial_credential(settings, username):
    directory = settings.data_dir / 'credentials'
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if directory.is_symlink():
        raise ValueError('凭据目录不能是符号链接')
    if os.name == 'nt':
        account = os.environ.get('USERNAME')
        if not account:
            raise ValueError('无法确定凭据文件所有者')
        if domain := os.environ.get('USERDOMAIN'):
            account = domain + '\\' + account
        subprocess.run(
            [
                'icacls',
                str(directory),
                '/inheritance:r',
                '/grant:r',
                f'{account}:(OI)(CI)F',
                '/grant:r',
                '*S-1-5-18:(OI)(CI)F',
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
    else:
        directory.chmod(0o700)
    path = directory / 'initial-admin.json'
    if path.is_symlink():
        raise ValueError('凭据文件不能是符号链接')
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        if os.name != 'nt':
            path.chmod(0o600)
        saved = json.loads(path.read_text(encoding='utf8'))
        if (
            saved.get('username') != username
            or not isinstance(saved.get('password'), str)
            or len(saved['password']) < 24
        ):
            raise ValueError('已有初始化凭据不匹配，请核对凭据文件后重试')
        return saved['password'], path
    password = secrets.token_urlsafe(32)
    with os.fdopen(descriptor, 'w', encoding='utf8') as output:
        json.dump({'username': username, 'password': password}, output)
        output.flush()
        os.fsync(output.fileno())
    return password, path


def initialize(db, settings):
    username = os.getenv('ADMIN_USERNAME', 'admin')
    if not db.scalar(select(User).where(User.username == username)):
        password, path = os.getenv('ADMIN_PASSWORD', ''), None
        if not password:
            password, path = initial_credential(settings, username)
        create_user(
            db,
            username,
            password,
            email=os.getenv('ADMIN_EMAIL', 'admin@example.com'),
            is_staff=True,
            is_superuser=True,
        )
        db.commit()
        print(f'已创建管理员: {username}')
        if path:
            print(f'初始密码已保存到受限文件: {path}')
    else:
        print('管理员已存在，保留现有凭据')
    if os.getenv('CREATE_DEMO_USER', '').lower() in {'1', 'true', 'yes'} and not db.scalar(
        select(User.id).where(User.username == 'demo')
    ):
        from chewy_api.cli.seed_data import DEMO_BBTALKS, DEMO_COMMENTS, DEMO_TAGS

        user = create_user(
            db, 'demo', 'demo123', email='demo@example.com', display_name='Demo User'
        )
        tags = {row['name']: Tag(user_id=user.id, **row) for row in DEMO_TAGS}
        db.add_all(tags.values())
        records = []
        for row in DEMO_BBTALKS:
            stamp = now() - timedelta(hours=row['hours_ago'])
            record = BBTalk(
                user_id=user.id,
                content=row['content'],
                visibility=row['visibility'],
                is_pinned=row.get('is_pinned', False),
                context=row.get('context', {}),
                create_time=stamp,
                update_time=stamp,
            )
            record.tags = [tags[name] for name in row['tags']]
            db.add(record)
            db.flush()
            records.append(record)
        for row in DEMO_COMMENTS:
            db.add(
                Comment(
                    user_id=user.id,
                    bbtalk_id=records[row['bbtalk_index']].id,
                    content=row['content'],
                )
            )
        db.commit()
        print('已创建 Demo 账号和演示数据')


def main(argv=None):
    parser = argparse.ArgumentParser(description='ChewyBBTalk 原生后端管理')
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ('migrate', 'init', 'check', 'encrypt-storage-secrets', 'shell'):
        commands.add_parser(name)
    backup = commands.add_parser('backup')
    backup.add_argument('--user-id', type=int)
    backup.add_argument('--keep', type=int, default=7)
    backup.add_argument('--output-dir')
    backup.add_argument('--dry-run', action='store_true')
    user_parser = commands.add_parser('create-user')
    user_parser.add_argument('username')
    user_parser.add_argument('--email', default='')
    user_parser.add_argument('--admin', action='store_true')
    options = parser.parse_args(argv)
    settings = Settings()
    engine, sessions = database(settings)
    try:
        if options.command == 'migrate':
            upgrade(engine)
            print('数据库迁移完成')
            return
        with sessions() as db:
            if options.command == 'check':
                db.execute(text('SELECT 1'))
                print('数据库连接正常')
            elif options.command == 'init':
                initialize(db, settings)
            elif options.command == 'encrypt-storage-secrets':
                for config in db.scalars(select(StorageConfig)):
                    config.s3_secret_access_key = encrypt_secret(
                        config.s3_secret_access_key, settings
                    )
                db.commit()
                print('存储密钥加密完成')
            elif options.command == 'create-user':
                create_user(
                    db,
                    options.username,
                    getpass.getpass('密码: '),
                    email=options.email,
                    is_staff=options.admin,
                    is_superuser=options.admin,
                )
                db.commit()
                print('用户创建完成')
            elif options.command == 'shell':
                code.interact(local={'db': db, 'settings': settings})
            elif options.command == 'backup':
                from chewy_api.backups.service import create_backup

                if options.keep < 1:
                    parser.error('--keep 必须大于等于 1')
                users = select(User)
                if options.user_id:
                    users = users.where(User.id == options.user_id)
                for user in db.scalars(users):
                    if options.dry_run:
                        print(f'[预览] 将备份用户 {user.username}，保留 {options.keep} 份')
                    else:
                        path, deleted = create_backup(
                            user, db, settings, options.output_dir, options.keep
                        )
                        print(f'已创建备份: {path}；清理 {deleted} 份')
    finally:
        engine.dispose()


def dev():
    import uvicorn

    uvicorn.run(
        'chewy_api.main:app',
        host=os.getenv('BACKEND_HOST', '0.0.0.0'),
        port=int(os.getenv('BACKEND_PORT', '8020')),
        reload=True,
        proxy_headers=False,
    )


def migrate():
    main(['migrate', *sys.argv[1:]])


def init():
    main(['init', *sys.argv[1:]])


def test():
    import pytest

    raise SystemExit(pytest.main(['tests', *sys.argv[1:]]))


if __name__ == '__main__':
    main()
