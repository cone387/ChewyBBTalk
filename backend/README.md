# ChewyBBTalk 后端

## 说明

后端代码直接复制自主项目的相关模块:

```bash
# 需要复制的模块
cp -r ../backend/chewy_space/bbtalk ./chewy_space/
cp -r ../backend/chewy_space/tags ./chewy_space/
cp -r ../backend/chewy_space/user_auth ./chewy_space/
cp -r ../backend/chewy_space/common ./chewy_space/
cp ../backend/chewy_space/manage.py ./chewy_space/
```

## Django 设置

确保 `settings.py` 中包含：

```python
INSTALLED_APPS = [
    ...
    'bbtalk',
    'tags',
    'user_auth',
    'common',
    'corsheaders',
    'rest_framework',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    ...
]

CORS_ALLOWED_ORIGINS = [
    "http://localhost:4001",  # 前端开发服务器
]
```

## API 路由

在 `urls.py` 中:

```python
urlpatterns = [
    path('admin/', admin.site.urls),
    path('v1/bbtalk/', include('bbtalk.urls')),
    path('v1/tags/', include('tags.urls')),
    path('v1/auth/', include('user_auth.urls')),
]
```

## 数据库迁移

```bash
python manage.py makemigrations
python manage.py migrate
```

## 运行

```bash
python manage.py runserver
```
