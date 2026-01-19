"""
初始化系统管理命令
创建默认管理员账号
"""
import os
from django.core.management.base import BaseCommand
from django.db import transaction
from bbtalk.models import User, Identity


class Command(BaseCommand):
    help = '初始化系统，创建默认管理员账号'

    def handle(self, *args, **options):
        """执行初始化"""
        self.stdout.write('开始初始化系统...')
        
        # 创建默认管理员账号
        self.create_admin_user()
        
        self.stdout.write(
            self.style.SUCCESS('系统初始化完成！')
        )

    def create_admin_user(self):
        """创建默认管理员账号"""
        username = os.getenv('ADMIN_USERNAME', 'admin')
        email = os.getenv('ADMIN_EMAIL', 'admin@example.com')
        password = os.getenv('ADMIN_PASSWORD', 'admin123')
        
        try:
            with transaction.atomic():
                # 检查用户是否已存在
                if User.objects.filter(username=username).exists():
                    self.stdout.write(
                        self.style.WARNING(f'管理员账号 "{username}" 已存在，跳过创建')
                    )
                    return
                
                # 创建用户
                user = User.objects.create(
                    username=username,
                    email=email,
                    display_name=username,
                    is_active=True,
                    is_staff=True,
                    is_superuser=True
                )
                
                # 创建密码身份
                identity = Identity.objects.create(
                    user=user,
                    identity_type='password',
                    identifier=username,
                    is_verified=True,
                    is_primary=True
                )
                identity.set_password(password)
                identity.save()
                
                self.stdout.write(
                    self.style.SUCCESS(f'成功创建管理员账号: {username}')
                )
                self.stdout.write(f'  邮箱: {email}')
                self.stdout.write(f'  密码: {password}')
                self.stdout.write(
                    self.style.WARNING('请及时修改默认密码！')
                )
                
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'创建管理员账号失败: {str(e)}')
            )