# ChewyBBTalk 后端

基于 Django 5.2 + Django REST Framework 的 BBTalk（碎碎念）后端服务。

## 技术栈

- **Python**: >= 3.13
- **框架**: Django 5.2 + Django REST Framework
- **认证**: Authelia（通过反向代理）
- **存储**: 本地存储
- **数据库**: SQLite (开发) / PostgreSQL (生产)
- **包管理**: uv

## 项目结构

```
backend/
├── chewy_space/
│   ├── bbtalk/          # BBTalk 核心模块（含标签、认证）
│   │   ├── models.py      # BBTalk、Tag、BaseModel
│   │   ├── views.py       # API 视图
│   │   ├── serializers.py # 序列化器
│   │   ├── authentication.py  # Keycloak 认证
│   │   └── admin.py       # Admin 配置
│   ├── media/           # 媒体文件模块
│   ├── chewy_space/     # Django 配置
│   └── manage.py
├── pyproject.toml       # 项目依赖配置
└── Dockerfile
```

## 本地开发

### 安装依赖

```bash
# 安装 uv (如果尚未安装)
curl -LsSf https://astral.sh/uv/install.sh | sh

# 安装项目依赖
cd backend
uv sync
```

### 运行方式

项目通过 `DJANGO_SETTINGS_MODULE` 环境变量指定配置文件运行：

```bash
cd chewy_space

# 开发环境
DJANGO_SETTINGS_MODULE=configs.dev_settings uv run python manage.py runserver

# 生产环境
DJANGO_SETTINGS_MODULE=configs.prod_settings uv run gunicorn chewy_space.wsgi:application
```

### 数据库迁移

```bash
DJANGO_SETTINGS_MODULE=configs.dev_settings uv run python manage.py migrate
```

## API 路由

| 路径 | 说明 |
|------|------|
| `/api/v1/bbtalk/` | BBTalk CRUD 接口 |
| `/api/v1/bbtalk/tags/` | 标签管理接口 |
| `/api/v1/bbtalk/public/` | 公开 BBTalk 接口（无需登录） |
| `/api/v1/bbtalk/user/me/` | 当前用户信息 |
| `/api/v1/media/` | 媒体文件上传接口 |
| `/api/schema/swagger-ui/` | Swagger API 文档 |
| `/admin/` | Django Admin |

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `DJANGO_SETTINGS_MODULE` | Django 配置模块 | `chewy_space.settings` |
| `DEBUG` | 调试模式 | `True` |
| `SECRET_KEY` | Django Secret Key | - |
| `ALLOWED_HOSTS` | 允许的主机 | `*` |
| `DATABASE_URL` | 数据库连接 | SQLite |
| `AUTHELIA_SESSION_SECRET` | Authelia Session 密钥 | - |
| `AUTHELIA_ENCRYPTION_KEY` | Authelia 加密密钥 | - |

## 认证说明

项目使用 Authelia 认证，特点：

- **反向代理认证**：通过 Nginx + Authelia 统一认证
- **HTTP 请求头**：用户信息通过 `Remote-User`、`Remote-Email`、`Remote-Groups` 传递
- **轻量级用户对象**：`AutheliaUser` 类只在内存中，不存数据库
- **开发模式**：支持测试请求头 `X-User-Id`、`X-Username`（DEBUG=True 时）

## Docker 部署

```bash
# 构建镜像
docker build -t bbtalk-backend .

# 运行容器
docker run -p 8000:8000 -e DJANGO_SETTINGS_MODULE=configs.prod_settings bbtalk-backend
```
