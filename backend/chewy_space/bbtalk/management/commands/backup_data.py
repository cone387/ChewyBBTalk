from django.core.management.base import BaseCommand, CommandError
from bbtalk.backups import backup_root, create_backup, user_directory

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

        output_root = backup_root(options.get('output_dir'))
        dry_run = options['dry_run']
        created = 0
        deleted = 0
        failed = 0

        for user in users:
            user_dir = user_directory(user, output_root)
            if dry_run:
                existing = len(list(user_dir.glob('*.zip'))) if user_dir.exists() else 0
                self.stdout.write(
                    f'[预演] 用户 {user.username}：将创建 1 个备份，当前 {existing} 个，保留 {keep} 个'
                )
                continue

            try:
                target, pruned = create_backup(user, output_root, keep, exporter_class=DataExporter)
                created += 1
                deleted += pruned
                self.stdout.write(f'已创建备份: {target}')
            except Exception as exc:
                failed += 1
                self.stderr.write(self.style.ERROR(f'用户 {user.username} 备份失败: {exc}'))

        if dry_run:
            self.stdout.write(self.style.SUCCESS('预演完成，未写入或删除任何文件'))
        else:
            self.stdout.write(self.style.SUCCESS(f'备份完成：创建 {created} 个，删除 {deleted} 个'))
            if failed:
                raise CommandError(f'有 {failed} 个用户备份失败')
