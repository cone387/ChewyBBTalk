"""Shared account-scoped backup operations for the CLI and authenticated API."""
import json
import logging
import os
import re
import tempfile
from contextlib import contextmanager
from pathlib import Path

from django.conf import settings
from django.utils import timezone

from .data_export import DataExporter

logger = logging.getLogger(__name__)


class BackupBusy(Exception):
    pass


def backup_root(output_dir=None):
    configured = output_dir or os.getenv('BACKUP_ROOT')
    if configured:
        return Path(configured).expanduser().resolve()
    return (Path(os.getenv('DATA_DIR') or Path(settings.BASE_DIR) / 'data') / 'backups').resolve()


def user_directory(user, output_dir=None):
    root = backup_root(output_dir)
    directory = root / str(user.pk)
    if directory.is_symlink() or directory.resolve().parent != root:
        raise ValueError('备份目录不可用')
    return directory


@contextmanager
def backup_lock(directory):
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / '.backup.lock'
    if path.is_symlink():
        raise ValueError('备份锁不可用')
    with path.open('a+b') as handle:
        if handle.tell() == 0:
            handle.write(b'0')
            handle.flush()
        handle.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            raise BackupBusy('当前账号已有备份正在创建') from exc
        try:
            yield
        finally:
            handle.seek(0)
            if os.name == 'nt':
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def atomic_write(path, payload):
    fd, temporary = tempfile.mkstemp(prefix='.' + path.name, suffix='.tmp', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def write_status(directory, state):
    atomic_write(directory / '.status.json', json.dumps(state).encode('utf-8'))


def read_status(directory):
    path = directory / '.status.json'
    if path.is_symlink():
        raise ValueError('备份状态不可用')
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError:
        return None
    except (ValueError, UnicodeError):
        return {'status': 'unknown', 'message': '无法读取最近备份状态，请重新核对'}


def zip_files(directory):
    return sorted((path for path in directory.glob('*.zip') if path.is_file() and not path.is_symlink()),
                  key=lambda path: path.stat().st_mtime, reverse=True)


def create_backup(user, output_dir=None, keep=7, exporter_class=DataExporter):
    if keep < 1:
        raise ValueError('备份保留数量必须大于等于 1')
    directory = user_directory(user, output_dir)
    with backup_lock(directory):
        state = {'status': 'running', 'started_at': timezone.now().isoformat()}
        write_status(directory, state)
        filename = f"bbtalk-{timezone.now().strftime('%Y%m%d-%H%M%S-%f')}.zip"
        target = directory / filename
        try:
            payload = exporter_class(user).export_to_zip(include_attachments=True).getvalue()
            atomic_write(target, payload)
        except Exception:
            logger.exception('用户 %s 备份创建失败', user.pk)
            write_status(directory, {**state, 'status': 'failed', 'finished_at': timezone.now().isoformat(),
                                     'message': '备份创建失败，请检查附件可用性、磁盘空间和服务器日志'})
            raise
        deleted = 0
        warning = None
        try:
            for path in zip_files(directory)[keep:]:
                path.unlink()
                deleted += 1
        except OSError:
            logger.exception('用户 %s 旧备份清理失败', user.pk)
            warning = '新备份已创建，但旧备份清理失败，请检查服务器磁盘与权限'
        write_status(directory, {**state, 'status': 'success', 'finished_at': timezone.now().isoformat(),
                                 'filename': filename, 'message': warning or '完整备份已创建'})
        return target, deleted


def list_backups(user):
    directory = user_directory(user)
    if not directory.exists():
        return {'items': [], 'latest': None}
    state = read_status(directory)
    if state and state.get('status') == 'running':
        try:
            with backup_lock(directory):
                state = read_status(directory)
                if state and state.get('status') == 'running':
                    state = {**state, 'status': 'interrupted', 'message': '上次备份已中断，可以重新创建'}
        except BackupBusy:
            pass
    items = [{'filename': path.name, 'size': path.stat().st_size,
              'created_at': timezone.datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.get_current_timezone()).isoformat()}
             for path in zip_files(directory)]
    return {'items': items, 'latest': state}


def backup_path(user, filename):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*\.zip', filename):
        raise FileNotFoundError()
    directory = user_directory(user)
    path = directory / filename
    if path.is_symlink() or path.resolve().parent != directory.resolve() or not path.is_file():
        raise FileNotFoundError()
    return path
