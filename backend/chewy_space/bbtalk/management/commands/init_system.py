"""
初始化系统管理命令
创建默认管理员账号和 demo 演示账号
"""
import os
import json
import secrets
import subprocess
from pathlib import Path
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from datetime import timedelta
from bbtalk.models import User, Identity, Tag, BBTalk, Comment


DEMO_TAGS = [
    {'name': '日常', 'color': '#3B82F6'},
    {'name': '读书', 'color': '#8B5CF6'},
    {'name': '美食', 'color': '#F59E0B'},
    {'name': '旅行', 'color': '#10B981'},
    {'name': '技术', 'color': '#6366F1'},
    {'name': '随想', 'color': '#EC4899'},
]

DEMO_BBTALKS = [
    {
        'content': '今天天气真好，适合出门走走。午后阳光透过树叶洒下来，心情格外舒畅。',
        'tags': ['日常'],
        'visibility': 'public',
        'hours_ago': 2,
        'context': {
            'source': {'client': 'ChewyBBTalk Mobile', 'version': '1.2.0', 'platform': 'mobile'},
            'location': {'latitude': 30.2741, 'longitude': 120.1551},
        },
    },
    {
        'content': '读完了《人类简史》，对"认知革命"这个概念印象深刻。人类之所以能够大规模协作，靠的是共同相信虚构的故事——国家、宗教、金钱，都是这样的"故事"。',
        'tags': ['读书', '随想'],
        'visibility': 'public',
        'hours_ago': 8,
        'context': {
            'source': {'client': 'ChewyBBTalk Web', 'version': '1.0', 'platform': 'web'},
        },
    },
    {
        'content': '试了一家新开的拉面馆，豚骨汤底浓郁，叉烧入口即化，溏心蛋完美。下次还来！',
        'tags': ['美食'],
        'visibility': 'public',
        'hours_ago': 26,
        'context': {
            'source': {'client': 'ChewyBBTalk Mobile', 'version': '1.2.0', 'platform': 'mobile'},
            'location': {'latitude': 31.2304, 'longitude': 121.4737},
        },
    },
    {
        'content': '周末去了趟西湖，断桥上人不多，远处山色朦胧，很有水墨画的感觉。\n\n> 欲把西湖比西子，淡妆浓抹总相宜。',
        'tags': ['旅行'],
        'visibility': 'public',
        'hours_ago': 50,
        'context': {
            'source': {'client': 'ChewyBBTalk Mobile', 'version': '1.2.0', 'platform': 'mobile'},
            'location': {'latitude': 30.2590, 'longitude': 120.1388},
        },
    },
    {
        'content': '刚用 React Native + Expo 搭了一个碎碎念 App，热重载体验很好，写起来跟 web 开发差不多。EAS Build 直接出包也省了不少配环境的时间。',
        'tags': ['技术'],
        'visibility': 'public',
        'hours_ago': 72,
        'context': {
            'source': {'client': 'ChewyBBTalk Web', 'version': '1.0', 'platform': 'web'},
        },
    },
    {
        'content': '有时候觉得记录本身就是一种力量。不需要多完美的文字，只要把那一刻的感受留下来，以后翻看时就像打开了一个时间胶囊。',
        'tags': ['随想'],
        'visibility': 'public',
        'hours_ago': 96,
        'is_pinned': True,
        'context': {
            'source': {'client': 'ChewyBBTalk Mobile', 'version': '1.1.0', 'platform': 'mobile'},
        },
    },
    {
        'content': '学到一个新的 Markdown 技巧：\n\n```python\n# 列表推导式真的很优雅\nresult = [x**2 for x in range(10) if x % 2 == 0]\n```\n\nPython 的语法糖用起来太舒服了。',
        'tags': ['技术'],
        'visibility': 'public',
        'hours_ago': 120,
        'context': {
            'source': {'client': 'ChewyBBTalk Web', 'version': '1.0', 'platform': 'web'},
        },
    },
    {
        'content': '今天做了番茄炒蛋盖饭，简单但治愈。秘诀是鸡蛋要先炒嫩一点捞出来，番茄多炒一会儿出汁，最后合在一起翻几下就好。',
        'tags': ['美食', '日常'],
        'visibility': 'public',
        'hours_ago': 144,
        'context': {
            'source': {'client': 'ChewyBBTalk Mobile', 'version': '1.2.0', 'platform': 'mobile'},
            'location': {'latitude': 39.9042, 'longitude': 116.4074},
        },
    },
    {
        'content': '这是一条私密碎碎念，只有自己能看到。有些想法不需要分享，写下来给未来的自己看就好。',
        'tags': ['随想'],
        'visibility': 'private',
        'hours_ago': 168,
        'context': {
            'source': {'client': 'ChewyBBTalk Mobile', 'version': '1.2.0', 'platform': 'mobile'},
        },
    },
    {
        'content': '整理了一下书单，接下来想读：\n\n- 《百年孤独》\n- 《思考，快与慢》\n- 《设计模式》\n- 《刀锋》\n\n一个月一本，不贪多。',
        'tags': ['读书'],
        'visibility': 'public',
        'hours_ago': 200,
        'context': {
            'source': {'client': 'ChewyBBTalk Mobile', 'version': '1.1.0', 'platform': 'mobile'},
            'location': {'latitude': 30.5728, 'longitude': 104.0668},
        },
    },
]

DEMO_COMMENTS = [
    {'bbtalk_index': 0, 'content': '确实，春天的阳光最舒服了'},
    {'bbtalk_index': 1, 'content': '这本书确实很值得一读，推荐再看看《未来简史》'},
    {'bbtalk_index': 2, 'content': '看起来好好吃！在哪里呀'},
    {'bbtalk_index': 5, 'content': '说得好，记录即生活'},
]


class Command(BaseCommand):
    help = '初始化系统，创建默认管理员账号和 demo 演示账号'

    def handle(self, *args, **options):
        self.stdout.write('开始初始化系统...')
        self.create_admin_user()
        if os.getenv('CREATE_DEMO_USER', '').lower() in ('1', 'true', 'yes'):
            self.create_demo_user()
        self.stdout.write(self.style.SUCCESS('系统初始化完成！'))

    def create_admin_user(self):
        username = os.getenv('ADMIN_USERNAME', 'admin')
        email = os.getenv('ADMIN_EMAIL', 'admin@example.com')
        password = os.getenv('ADMIN_PASSWORD', '')

        try:
            with transaction.atomic():
                if User.objects.filter(username=username).exists():
                    self.stdout.write(self.style.WARNING(f'管理员账号 "{username}" 已存在，跳过创建'))
                    return

                credential_path = None
                if not password:
                    password, credential_path = self.initial_credential(username)

                user = User.objects.create(
                    username=username,
                    email=email,
                    display_name=username,
                    is_active=True,
                    is_staff=True,
                    is_superuser=True,
                )
                identity = Identity.objects.create(
                    user=user,
                    identity_type='password',
                    identifier=username,
                    is_verified=True,
                    is_primary=True,
                )
                identity.set_password(password)
                identity.save()

                self.stdout.write(self.style.SUCCESS(f'成功创建管理员账号: {username}'))
                self.stdout.write(f'  邮箱: {email}')
                if credential_path:
                    self.stdout.write(f'  初始密码已保存到受限文件: {credential_path}')
                else:
                    self.stdout.write('  使用显式提供的 ADMIN_PASSWORD，密码不会写入日志')
                self.stdout.write(self.style.WARNING('首次登录后请修改初始密码并移除凭据文件'))
        except Exception as e:
            raise CommandError(f'创建管理员账号失败: {str(e)}') from e

    def initial_credential(self, username):
        directory = Path(os.getenv('DATA_DIR', str(settings.BASE_DIR / 'data'))) / 'credentials'
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        if directory.is_symlink():
            raise CommandError('凭据目录不能是符号链接')
        if os.name == 'nt':
            account = os.environ.get('USERNAME')
            if not account:
                raise CommandError('无法确定凭据文件所有者')
            domain = os.environ.get('USERDOMAIN')
            account = f'{domain}{chr(92)}{account}' if domain else account
            subprocess.run(['icacls', str(directory), '/inheritance:r',
                            '/grant:r', f'{account}:(OI)(CI)F',
                            '/grant:r', '*S-1-5-18:(OI)(CI)F'],
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        else:
            directory.chmod(0o700)
        path = directory / 'initial-admin.json'
        if path.is_symlink():
            raise CommandError('凭据文件不能是符号链接')
        try:
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            if os.name != 'nt':
                path.chmod(0o600)
            saved = json.loads(path.read_text(encoding='utf-8'))
            if saved.get('username') != username or not isinstance(saved.get('password'), str) or len(saved['password']) < 24:
                raise CommandError('已有初始化凭据不匹配，请核对凭据文件后重试')
            return saved['password'], path
        password = secrets.token_urlsafe(32)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            json.dump({'username': username, 'password': password}, output, ensure_ascii=False)
            output.flush()
            os.fsync(output.fileno())
        return password, path

    def create_demo_user(self):
        username = 'demo'
        email = 'demo@example.com'
        password = 'demo123'

        try:
            with transaction.atomic():
                if User.objects.filter(username=username).exists():
                    self.stdout.write(self.style.WARNING(f'Demo 账号 "{username}" 已存在，跳过创建'))
                    return

                user = User.objects.create(
                    username=username,
                    email=email,
                    display_name='Demo User',
                    is_active=True,
                    is_staff=False,
                    is_superuser=False,
                )
                identity = Identity.objects.create(
                    user=user,
                    identity_type='password',
                    identifier=username,
                    is_verified=True,
                    is_primary=True,
                )
                identity.set_password(password)
                identity.save()

                self.stdout.write(self.style.SUCCESS(f'成功创建 Demo 账号: {username}'))
                self.stdout.write(f'  邮箱: {email}')
                self.stdout.write(f'  密码: {password}')

                self._create_demo_data(user)
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'创建 Demo 账号失败: {str(e)}'))

    def _create_demo_data(self, user):
        now = timezone.now()

        # Create tags
        tag_map = {}
        for t in DEMO_TAGS:
            tag = Tag.objects.create(user=user, name=t['name'], color=t['color'])
            tag_map[t['name']] = tag

        # Create BBTalks
        created_bbtalks = []
        for item in DEMO_BBTALKS:
            ts = now - timedelta(hours=item['hours_ago'])
            bbtalk = BBTalk.objects.create(
                user=user,
                content=item['content'],
                visibility=item['visibility'],
                is_pinned=item.get('is_pinned', False),
                context=item.get('context', {}),
            )
            bbtalk.create_time = ts
            bbtalk.update_time = ts
            bbtalk.save(update_fields=['create_time', 'update_time'])
            for tag_name in item['tags']:
                if tag_name in tag_map:
                    bbtalk.tags.add(tag_map[tag_name])
            created_bbtalks.append(bbtalk)

        # Create comments
        for c in DEMO_COMMENTS:
            bbtalk = created_bbtalks[c['bbtalk_index']]
            Comment.objects.create(user=user, bbtalk=bbtalk, content=c['content'])

        self.stdout.write(
            f'  已创建 {len(DEMO_TAGS)} 个标签, '
            f'{len(DEMO_BBTALKS)} 条碎碎念, '
            f'{len(DEMO_COMMENTS)} 条评论'
        )