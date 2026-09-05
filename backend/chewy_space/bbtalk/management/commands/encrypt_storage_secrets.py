from django.core.management.base import BaseCommand

from bbtalk.models import UserStorageSettings
from bbtalk.secret_encryption import is_encrypted


class Command(BaseCommand):
    help = '将用户存储配置中的旧明文 S3 密钥加密（可重复执行）'

    def handle(self, *args, **options):
        encrypted_count = 0
        for setting in UserStorageSettings.objects.exclude(s3_secret_access_key='').iterator():
            if is_encrypted(setting.s3_secret_access_key):
                continue
            setting.save(update_fields={'s3_secret_access_key'})
            encrypted_count += 1

        self.stdout.write(self.style.SUCCESS(f'已加密 {encrypted_count} 条存储密钥'))
