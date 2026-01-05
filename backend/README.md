# ChewyBBTalk 后端

基于 Django 5.2 + Django REST Framework 的 BBTalk（碎碎念）后端服务。

## 技术栈

- **Python**: >= 3.13
- **框架**: Django 5.2 + Django REST Framework
- **认证**: Keycloak JWT / API Key
- **存储**: 七牛云 / 本地存储
- **数据库**: SQLite (开发) / PostgreSQL (生产)
- **包管理**: uv

## 项目结构

```
backend/
├── chewy_space/
│   ├── bbtalk/          # BBTalk 碎碎念模块
│   ├── tags/            # 标签管理模块
│   ├── media/           # 媒体文件模块
│   ├── user_auth/       # 用户认证模块 (Keycloak + API Key)
│   ├── common/          # 公共模块 (软删除等)
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

### 数据库迁移

```bash
cd chewy_space
uv run python manage.py migrate
```

### 运行开发服务器

```bash
uv run python manage.py runserver
```

### 创建超级用户

```bash
uv run python manage.py createsuperuser
```

## API 路由

| 路径 | 说明 |
|------|------|
| `/api/v1/bbtalk/` | BBTalk CRUD 接口 |
| `/api/v1/tags/` | 标签管理接口 |
| `/api/v1/media/` | 媒体文件上传接口 |
| `/api/auth/` | 用户认证接口 |
| `/api/schema/swagger-ui/` | Swagger API 文档 |
| `/admin/` | Django Admin |

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `DEBUG` | 调试模式 | `True` |
| `SECRET_KEY` | Django Secret Key | - |
| `ALLOWED_HOSTS` | 允许的主机 | `*` |
| `DATABASE_URL` | 数据库连接 | SQLite |
| `KEYCLOAK_URL` | Keycloak 地址 | - |
| `KEYCLOAK_REALM` | Keycloak Realm | - |
| `QINIU_ACCESS_KEY` | 七牛云 Access Key | - |
| `QINIU_SECRET_KEY` | 七牛云 Secret Key | - |
| `QINIU_BUCKET_NAME` | 七牛云 Bucket 名称 | - |
| `QINIU_BUCKET_DOMAIN` | 七牛云 Bucket 域名 | - |

## Docker 部署

```bash
# 构建镜像
docker build -t bbtalk-backend .

# 运行容器
docker run -p 8000:8000 bbtalk-backend
```
