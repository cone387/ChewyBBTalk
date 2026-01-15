"""
Django settings for chewy_space project.

配置加载方式：
1. settings.py (基础配置)
2. 通过环境变量 CHEWYBBTALK_SETTINGS_MODULE 指定额外配置模块进行覆盖

使用示例：
- export CHEWYBBTALK_SETTINGS_MODULE=configs.dev_settings
- export CHEWYBBTALK_SETTINGS_MODULE=configs.prod_settings
- export CHEWYBBTALK_SETTINGS_MODULE=local_settings

配置模块会被导入并覆盖当前配置（类似 Django 的 from module import *）
"""

import os
from pathlib import Path

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# ==========================================
# 基础配置（默认配置）
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
    'corsheaders',
    'django_filters',
    'drf_spectacular',
    'bbtalk',
    'chewy_attachment.django_app',
]

# 自定义用户模型
AUTH_USER_MODEL = 'bbtalk.User'

# 认证后端（仅保留 Django 默认，用于 admin 等场景）
AUTHENTICATION_BACKENDS = [
    'django.contrib.auth.backends.ModelBackend',
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

STATIC_URL = 'static/'

# Default primary key field type
# https://docs.djangoproject.com/en/5.2/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# CORS
_cors_origins = os.getenv('CORS_ALLOWED_ORIGINS', 'https://localhost:4010,http://localhost:4010,http://localhost:4011,http://localhost:3000,http://127.0.0.1:4010')
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
        'bbtalk.authentication.OIDCAuthentication',  # OIDC JWT 认证
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

# Authelia OIDC 配置
# Authelia 作为 OIDC Provider 的 issuer URL
AUTHELIA_ISSUER_URL = os.getenv('AUTHELIA_ISSUER_URL', 'http://authelia:9091/authelia')

# Media files
MEDIA_URL = os.getenv('MEDIA_URL', '/media/')
MEDIA_ROOT = os.getenv('MEDIA_ROOT', str(BASE_DIR / 'media'))

# Static files (collected)
STATIC_ROOT = os.getenv('STATIC_ROOT', str(BASE_DIR / 'staticfiles'))

# ChewyAttachment 配置
CHEWY_ATTACHMENT = {
    # 文件存储根目录
    "STORAGE_ROOT": BASE_DIR / "media" / "attachments",
}


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


# ==========================================
# 加载自定义配置模块
# ==========================================

# 通过 CHEWYBBTALK_SETTINGS_MODULE 环境变量指定配置模块
# 例如: export CHEWYBBTALK_SETTINGS_MODULE=configs.dev_settings
CUSTOM_SETTINGS_MODULE = os.getenv('CHEWYBBTALK_SETTINGS_MODULE')

if CUSTOM_SETTINGS_MODULE:
    try:
        # 动态导入指定的配置模块
        import importlib
        custom_module = importlib.import_module(CUSTOM_SETTINGS_MODULE)
        
        # 将模块中的所有大写变量导入到当前作用域
        for setting in dir(custom_module):
            if setting.isupper():
                locals()[setting] = getattr(custom_module, setting)
        
        print(f"✓ Loaded custom settings from: {CUSTOM_SETTINGS_MODULE}")
    except ImportError as e:
        import sys
        print(f"Warning: Failed to import {CUSTOM_SETTINGS_MODULE}: {e}", file=sys.stderr)
    except Exception as e:
        import sys
        print(f"Warning: Error loading custom settings: {e}", file=sys.stderr)
