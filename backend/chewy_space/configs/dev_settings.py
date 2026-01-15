"""
开发环境配置
使用方式：export CHEWYBBTALK_SETTINGS_MODULE=configs.dev_settings

仅包含开发环境特定的敏感配置和覆盖项
"""
import pathlib

BASE_DIR = pathlib.Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent.parent  # 项目根目录

# 开启调试模式
DEBUG = True

# 允许所有主机访问（开发环境）
ALLOWED_HOSTS = ['*']

# 开发数据库配置 - 存储到项目根目录的 data/dev/
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': PROJECT_ROOT / 'data' / 'dev' / 'db.sqlite3',
    }
}

# Media 文件存储 - 存储到项目根目录的 data/dev/media/
MEDIA_ROOT = str(PROJECT_ROOT / 'data' / 'dev' / 'media')
MEDIA_URL = '/media/'

# ChewyAttachment 配置 - 附件存储到 data/dev/media/attachments/
CHEWY_ATTACHMENT = {
    "STORAGE_ROOT": PROJECT_ROOT / 'data' / 'dev' / 'media' / 'attachments',
}
