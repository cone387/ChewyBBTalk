import os
import tempfile
from pathlib import Path
from uuid import uuid4

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from bbtalk.data_export import DataExporter
from bbtalk.models import User


class Command(BaseCommand):
    help = '为用户创建包含附件的 ZIP 备份，并清理超出保留数量的旧备份'

    def add_arguments(self, parser):
        parser.add_argument('--user-id', type=int, help='只备份指定用户')
        parser.add_argument('--output-dir', help='备份根目录，默认 DATA_DIR/backups')
        parser.add_argument('--keep', type=int, default=7, help='每个用户保留的备份数量（默认 7）')
        parser.add_argument('--dry-run', action='store_true', help='只显示计划，不写入或删除文件')

    def handle(self, *args, **options):
        keep = options['keep']
        if keep < 1:
            raise CommandError('--keep 必须大于等于 1')

        users = User.objects.order_by('id')
        if options.get('user_id') is not None:
            users = users.filter(pk=options['user_id'])
            if not users.exists():
                raise CommandError(f"用户不存在: {options['user_id']}")

        output_root = self._get_output_root(options.get('output_dir'))
        dry_run = options['dry_run']
        created = 0
        deleted = 0
        failed = 0

        for user in users:
            user_dir = output_root / str(user.id)
            if dry_run:
                existing = len(list(user_dir.glob('*.zip'))) if user_dir.exists() else 0
                self.stdout.write(
                    f'[预演] 用户 {user.username}：将创建 1 个备份，当前 {existing} 个，保留 {keep} 个'
                )
                continue

            user_dir.mkdir(parents=True, exist_ok=True)
            filename = f"bbtalk-{timezone.localtime().strftime('%Y%m%d-%H%M%S-%f')}.zip"
            target = user_dir / filename
            temp_path: Path | None = None
            try:
                payload = DataExporter(user).export_to_zip(include_attachments=True).getvalue()
                fd, temp_name = tempfile.mkstemp(prefix=f'.{filename}.', suffix='.tmp', dir=user_dir)
                temp_path = Path(temp_name)
                with os.fdopen(fd, 'wb') as handle:
                    handle.write(payload)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(temp_path, target)
                temp_path = None
                created += 1
                deleted += self._prune(user_dir, keep)
                self.stdout.write(f'已创建备份: {target}')
            except Exception as exc:
                failed += 1
                self.stderr.write(self.style.ERROR(f'用户 {user.username} 备份失败: {exc}'))
            finally:
                if temp_path and temp_path.exists():
                    temp_path.unlink()

        if dry_run:
            self.stdout.write(self.style.SUCCESS('预演完成，未写入或删除任何文件'))
        else:
            self.stdout.write(self.style.SUCCESS(f'备份完成：创建 {created} 个，删除 {deleted} 个'))
            if failed:
                raise CommandError(f'有 {failed} 个用户备份失败')

    @staticmethod
    def _get_output_root(output_dir: str | None) -> Path:
        if output_dir:
            return Path(output_dir).expanduser().resolve()
        data_dir = os.getenv('DATA_DIR') or str(getattr(settings, 'BASE_DIR', Path.cwd()) / 'data')
        return (Path(data_dir) / 'backups').resolve()

    @staticmethod
    def _prune(user_dir: Path, keep: int) -> int:
        backups = sorted(
            (path for path in user_dir.glob('*.zip') if path.is_file()),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        deleted = 0
        for path in backups[keep:]:
            path.unlink()
            deleted += 1
        return deleted
