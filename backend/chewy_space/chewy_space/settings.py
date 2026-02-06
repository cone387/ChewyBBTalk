"""
Django settings for chewy_space project.

所有配置从环境变量加载，统一在根目录的.env中设置
"""

import os
from pathlib import Path
from datetime import timedelta

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# ==========================================
# 基础配置
# ==========================================

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv('SECRET_KEY', 'django-insecure-h*i5n2b(7hc#-egwbmalofpz#r(e2z)4jpai@+0buu#c1&5z-i')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.getenv('DEBUG', 'True').lower() in ('true', '1', 'yes')

ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', '*').split(',')

# Proxy settings
USE_X_FORWARDED_HOST = os.getenv('USE_X_FORWARDED_HOST', 'True').lower() in ('true', '1', 'yes')
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt.token_blacklist',  # JWT Token 黑名单
    'corsheaders',
    'django_filters',
    'drf_spectacular',
    'storages',  # django-storages for S3 support
    'bbtalk',
    'chewy_attachment.django_app',
]

# 自定义用户模型
AUTH_USER_MODEL = 'bbtalk.User'

# 认证后端
AUTHENTICATION_BACKENDS = [
    'bbtalk.authentication.UserBackend',  # 自定义认证后端
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'chewy_space.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'chewy_space.wsgi.application'


# Database
# https://docs.djangoproject.com/en/5.2/ref/settings/#databases

def _parse_database_url(url: str) -> dict:
    """解析 DATABASE_URL 环境变量"""
    if url.startswith('sqlite:///'):
        db_path = url.replace('sqlite:///', '')
        return {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / db_path if not db_path.startswith('/') else db_path,
        }
    elif url.startswith(('postgresql://', 'postgres://')):
        from urllib.parse import urlparse
        parsed = urlparse(url)
        return {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': parsed.path[1:],
            'USER': parsed.username,
            'PASSWORD': parsed.password,
            'HOST': parsed.hostname,
            'PORT': parsed.port or 5432,
        }
    elif url.startswith('mysql://'):
        from urllib.parse import urlparse
        parsed = urlparse(url)
        return {
            'ENGINE': 'django.db.backends.mysql',
            'NAME': parsed.path[1:],
            'USER': parsed.username,
            'PASSWORD': parsed.password,
            'HOST': parsed.hostname,
            'PORT': parsed.port or 3306,
        }
    return {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }

DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///db.sqlite3')
DATABASES = {
    'default': _parse_database_url(DATABASE_URL)
}


# Password validation
# https://docs.djangoproject.com/en/5.2/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/5.2/topics/i18n/

LANGUAGE_CODE = os.getenv('LANGUAGE_CODE', 'zh-hans')

TIME_ZONE = os.getenv('TIME_ZONE', 'Asia/Shanghai')

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.2/howto/static-files/

STATIC_URL = '/static/'
STATIC_ROOT = os.getenv('STATIC_ROOT', str(BASE_DIR / 'staticfiles'))

# Media files
MEDIA_URL = os.getenv('MEDIA_URL', '/media/')
MEDIA_ROOT = os.getenv('MEDIA_ROOT', str(BASE_DIR / 'media'))

# Default primary key field type
# https://docs.djangoproject.com/en/5.2/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# CORS
_cors_origins = os.getenv('CORS_ALLOWED_ORIGINS', 'http://localhost:4010,http://localhost:3000,http://127.0.0.1:4010')
CORS_ALLOWED_ORIGINS = [origin.strip() for origin in _cors_origins.split(',') if origin.strip()]
CORS_ALLOW_CREDENTIALS = os.getenv('CORS_ALLOW_CREDENTIALS', 'True').lower() in ('true', '1', 'yes')
CORS_ORIGIN_ALLOW_ALL = os.getenv('CORS_ORIGIN_ALLOW_ALL', 'False').lower() in ('true', '1', 'yes')

# 允许的自定义请求头
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]

# REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',  # JWT 认证（主要）
        'bbtalk.authentication.SessionAuthentication',  # Session 认证（备用）
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 100,
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    # 测试时关闭验证，使测试更简单
    'TEST_REQUEST_DEFAULT_FORMAT': 'json',
}

# SimpleJWT 配置
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),  # Access Token 有效期 1 小时
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),  # Refresh Token 有效期 7 天
    'ROTATE_REFRESH_TOKENS': True,  # 刷新时轮换 Refresh Token
    'BLACKLIST_AFTER_ROTATION': True,  # 轮换后将旧 Token 加入黑名单
    'UPDATE_LAST_LOGIN': True,  # 更新最后登录时间
    
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'VERIFYING_KEY': None,
    'AUDIENCE': None,
    'ISSUER': None,
    'JWK_URL': None,
    'LEEWAY': 0,
    
    'AUTH_HEADER_TYPES': ('Bearer',),
    'AUTH_HEADER_NAME': 'HTTP_AUTHORIZATION',
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
    'USER_AUTHENTICATION_RULE': 'rest_framework_simplejwt.authentication.default_user_authentication_rule',
    
    'AUTH_TOKEN_CLASSES': ('rest_framework_simplejwt.tokens.AccessToken',),
    'TOKEN_TYPE_CLAIM': 'token_type',
    'TOKEN_USER_CLASS': 'rest_framework_simplejwt.models.TokenUser',
    
    'JTI_CLAIM': 'jti',
    
    'SLIDING_TOKEN_REFRESH_EXP_CLAIM': 'refresh_exp',
    'SLIDING_TOKEN_LIFETIME': timedelta(minutes=5),
    'SLIDING_TOKEN_REFRESH_LIFETIME': timedelta(days=1),
}

# DRF Spectacular (API 文档)
SPECTACULAR_SETTINGS = {
    'TITLE': 'ChewyBBTalk API',
    'DESCRIPTION': 'ChewyBBTalk 项目的 RESTful API 文档',
    'VERSION': '1.0.0',
    'TAGS_SORTER': 'alpha',
    'POSTPROCESSING_HOOKS': [
        'chewy_space.openapi_hooks.add_tags_by_path',
    ],
    'SERVE_INCLUDE_SCHEMA': False,
    'COMPONENT_SPLIT_PATCH': True,
    'COMPONENT_SPLIT_REQUEST': True,
}

# ==========================================
# S3 存储配置 (可选)
# ==========================================
# 如果配置了 S3，则使用 S3 存储；否则使用本地文件存储

# AWS/S3 兼容存储凭证
AWS_ACCESS_KEY_ID = os.getenv('AWS_ACCESS_KEY_ID')
AWS_SECRET_ACCESS_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
AWS_STORAGE_BUCKET_NAME = os.getenv('AWS_STORAGE_BUCKET_NAME')
AWS_S3_REGION_NAME = os.getenv('AWS_S3_REGION_NAME', 'us-east-1')

# S3 兼容服务端点 (用于 MinIO、阿里云 OSS 等)
AWS_S3_ENDPOINT_URL = os.getenv('AWS_S3_ENDPOINT_URL')

# S3 设置
AWS_S3_CUSTOM_DOMAIN = os.getenv('AWS_S3_CUSTOM_DOMAIN')  # CloudFront 或自定义域名
AWS_S3_OBJECT_PARAMETERS = {
    'CacheControl': 'max-age=86400',  # 1天缓存
}
AWS_DEFAULT_ACL = os.getenv('AWS_DEFAULT_ACL', 'private')  # 文件默认私有
AWS_S3_FILE_OVERWRITE = False  # 不覆盖同名文件
AWS_QUERYSTRING_AUTH = True  # 使用签名 URL
AWS_QUERYSTRING_EXPIRE = int(os.getenv('AWS_QUERYSTRING_EXPIRE', '3600'))  # 签名 URL 过期时间（秒）

# 判断是否启用 S3 存储
USE_S3_STORAGE = all([AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_STORAGE_BUCKET_NAME])

if USE_S3_STORAGE:
    # 使用 S3 作为媒体文件存储
    DEFAULT_FILE_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'
    
    # 媒体文件 URL
    if AWS_S3_CUSTOM_DOMAIN:
        MEDIA_URL = f'https://{AWS_S3_CUSTOM_DOMAIN}/'
    elif AWS_S3_ENDPOINT_URL:
        # S3 兼容服务 (MinIO, 阿里云 OSS 等)
        MEDIA_URL = f'{AWS_S3_ENDPOINT_URL}/{AWS_STORAGE_BUCKET_NAME}/'
    else:
        MEDIA_URL = f'https://{AWS_STORAGE_BUCKET_NAME}.s3.{AWS_S3_REGION_NAME}.amazonaws.com/'

# ChewyAttachment 配置
CHEWY_ATTACHMENT = {
    # 存储引擎: "file" 使用本地文件存储, "django" 使用 Django 存储系统 (支持 S3)
    "STORAGE_ENGINE": "django" if USE_S3_STORAGE else "file",
    
    # 文件存储根目录 (仅在 STORAGE_ENGINE="file" 时使用)
    "STORAGE_ROOT": Path(os.getenv('MEDIA_ROOT', str(BASE_DIR / 'media'))) / "attachments",
    
    # 文件大小限制 (默认 10MB)
    "MAX_FILE_SIZE": int(os.getenv('ATTACHMENT_MAX_FILE_SIZE', str(10 * 1024 * 1024))),
    
    # 允许的文件扩展名
    "ALLOWED_EXTENSIONS": [
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg",
        ".pdf", ".doc", ".docx", ".txt", ".zip",
        ".mp3", ".mp4", ".mov", ".avi",
    ],
}

# 使用自定义的 Attachment 模型
CHEWY_ATTACHMENT_MODEL = 'bbtalk.Attachment'

# Logging configuration
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[{levelname}] {asctime} {name} {message}',
            'style': '{',
        },
        'simple': {
            'format': '[{levelname}] {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'level': 'DEBUG',
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'bbtalk': {
            'handlers': ['console'],
            'level': 'DEBUG',
            'propagate': False,
        },
    },
}
