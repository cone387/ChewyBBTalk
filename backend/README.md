# ChewyBBTalk 后端

基于 Django 5.2 + Django REST Framework 的 BBTalk（碎碎念）后端服务。

## 技术栈

- **Python**: >= 3.13
- **框架**: Django 5.2 + Django REST Framework
- **附件**: chewy-attachment >= 0.3.0
- **数据库**: SQLite (开发) / PostgreSQL (生产)
- **包管理**: uv

## 项目结构

```
backend/
├── chewy_space/
│   ├── bbtalk/              # BBTalk 核心模块
│   │   ├── models.py          # User、Tag、BBTalk 模型
│   │   ├── views.py           # API 视图
│   │   ├── serializers.py     # 序列化器
│   │   ├── admin.py           # Admin 配置
│   │   └── tests.py           # 单元测试
│   ├── chewy_space/         # Django 配置
│   │   └── settings.py        # 统一配置（支持动态覆盖）
│   ├── configs/             # 环境配置（不提交 git）
│   │   └── dev_settings.py    # 开发环境敏感配置
│   └── manage.py
├── pyproject.toml           # 项目依赖配置
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

### 一键启动

使用项目根目录的启动脚本：

```bash
# 开发环境（默认）
./start_backend.sh

# 或显式指定环境
./start_backend.sh dev
./start_backend.sh prod
./start_backend.sh test
```

### 手动运行

```bash
cd backend

# 设置环境变量
export CHEWYBBTALK_SETTINGS_MODULE=configs.dev_settings

# 运行迁移
uv run python chewy_space/manage.py migrate

# 启动开发服务器
uv run python chewy_space/manage.py runserver 0.0.0.0:8020
```

### 运行测试

```bash
cd backend
uv run python chewy_space/manage.py test bbtalk
```

## API 路由

### BBTalk 接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/v1/bbtalk/` | 获取当前用户的 BBTalk 列表 | 需要 |
| POST | `/api/v1/bbtalk/` | 创建 BBTalk | 需要 |
| GET | `/api/v1/bbtalk/{uid}/` | 获取单条 BBTalk | 需要 |
| PUT | `/api/v1/bbtalk/{uid}/` | 更新 BBTalk | 需要 |
| DELETE | `/api/v1/bbtalk/{uid}/` | 删除 BBTalk | 需要 |
| GET | `/api/v1/bbtalk/public/` | 公开 BBTalk 列表 | 不需要 |
| GET | `/api/v1/bbtalk/public/{uid}/` | 获取公开 BBTalk 详情 | 不需要 |

### 标签接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/v1/bbtalk/tags/` | 获取标签列表（只返回有 BBTalk 的标签） | 需要 |
| POST | `/api/v1/bbtalk/tags/` | 创建标签（已存在则返回现有） | 需要 |
| GET | `/api/v1/bbtalk/tags/{uid}/` | 获取标签详情 | 需要 |
| PUT | `/api/v1/bbtalk/tags/{uid}/` | 更新标签 | 需要 |
| DELETE | `/api/v1/bbtalk/tags/{uid}/` | 删除标签 | 需要 |

### 用户接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/v1/bbtalk/user/me/` | 获取当前用户信息 | 需要 |

### 附件接口（chewy-attachment）

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/v1/attachments/files/` | 上传附件 | 需要 |
| GET | `/api/v1/attachments/files/` | 获取附件列表 | 需要 |
| GET | `/api/v1/attachments/files/{uid}/` | 获取附件详情 | 需要 |
| DELETE | `/api/v1/attachments/files/{uid}/` | 删除附件 | 需要 |

### 其他

| 路径 | 说明 | 认证 |
|------|------|------|
| `/api/schema/swagger-ui/` | Swagger API 文档 | 不需要 |
| `/api/schema/redoc/` | ReDoc API 文档 | 不需要 |

## 认证说明



**认证流程**（Authorization Code Flow with PKCE）：
2. 登录成功后获取 id_token（JWT）
3. 前端通过 `Authorization: Bearer <id_token>` 请求后端
4. 后端验证 JWT 签名并提取用户信息

### 测试 API

```bash
# 使用 JWT token
curl -X GET "http://localhost:8020/api/v1/bbtalk/" \
  -H "Authorization: Bearer <your_jwt_token>"

# 获取当前用户
curl -X GET "http://localhost:8020/api/v1/bbtalk/user/me/" \
  -H "Authorization: Bearer <your_jwt_token>"

# 创建 BBTalk
curl -X POST "http://localhost:8020/api/v1/bbtalk/" \
  -H "Authorization: Bearer <your_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Hello World!",
    "visibility": "public",
    "post_tags": "日常,随想"
  }'

# 获取公开 BBTalk（无需认证）
curl -X GET "http://localhost:8020/api/v1/bbtalk/public/"

# 获取标签列表
curl -X GET "http://localhost:8020/api/v1/bbtalk/tags/" \
  -H "Authorization: Bearer <your_jwt_token>"
```

### 访问 Admin

Admin 后台需要单独配置管理员账号。

访问 http://localhost:8020/admin/

## 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `CHEWYBBTALK_SETTINGS_MODULE` | 自定义配置模块 | - |
| `DEBUG` | 调试模式 | `True` |
| `SECRET_KEY` | Django Secret Key | 随机生成 |
| `ALLOWED_HOSTS` | 允许的主机 | `*` |
| `DATABASE_URL` | 数据库连接 | SQLite |
| `CORS_ALLOWED_ORIGINS` | CORS 允许源 | localhost |

### 配置文件

1. **settings.py**：基础配置（非敏感信息）
2. **configs/dev_settings.py**：开发环境敏感配置
3. **configs/prod_settings.py**：生产环境敏感配置

配置加载顺序：
```
settings.py → CHEWYBBTALK_SETTINGS_MODULE 指定的模块覆盖
```

### 创建配置文件

```python
# backend/chewy_space/configs/dev_settings.py
import pathlib

BASE_DIR = pathlib.Path(__file__).resolve().parent.parent

DEBUG = True
ALLOWED_HOSTS = ['*']

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}
```

## Docker 部署

```bash
# 构建镜像
docker build -t bbtalk-backend .

# 运行容器
docker run -p 8020:8020 \
  -e CHEWYBBTALK_SETTINGS_MODULE=configs.prod_settings \
  -v ./configs:/app/chewy_space/configs:ro \
  bbtalk-backend
```

## 数据模型

### User（自定义用户模型）

```python
- id: BigAutoField (主键)
- username: CharField (唯一)
- email: EmailField
- display_name: CharField
- avatar: URLField
- groups: JSONField (用户组列表)
- is_active: BooleanField
- is_staff: BooleanField
- last_login: DateTimeField
```

### BBTalk

```python
- uid: CharField (22位唯一标识，用于 URL)
- user: ForeignKey → User
- content: TextField (支持 Markdown)
- visibility: CharField (public/private/friends)
- tags: ManyToManyField → Tag
- attachments: JSONField (附件元信息)
- context: JSONField (上下文信息，如设备、IP)
- create_time: DateTimeField
- update_time: DateTimeField
```

### Tag

```python
- uid: CharField (唯一标识)
- name: CharField
- user: ForeignKey → User
- color: CharField (HEX 颜色)
- sort_order: IntegerField
- create_time: DateTimeField
- update_time: DateTimeField
```

## API 响应格式

### BBTalk 响应示例

```json
{
  "uid": "abc123xyz",
  "user": 1,
  "content": "今天天气真好！",
  "visibility": "public",
  "tags": [
    {"uid": "tag1", "name": "日常", "color": "#3498db", "sort_order": 0}
  ],
  "attachments": [
    {"uid": "file1", "url": "/media/xxx.jpg", "type": "image"}
  ],
  "context": {"device": {"ip": "127.0.0.1", "ua": "..."}},
  "create_time": "2024-01-01T12:00:00Z",
  "update_time": "2024-01-01T12:00:00Z"
}
```

### 当前用户响应示例

```json
{
  "id": 1,
  "username": "testuser",
  "email": "test@example.com",
  "display_name": "Test User",
  "avatar": null
}
```

### 标签响应示例

```json
{
  "uid": "tag1",
  "name": "日常",
  "color": "#3498db",
  "sort_order": 0,
  "bbtalk_count": 5,
  "create_time": "2024-01-01T12:00:00Z",
  "update_time": "2024-01-01T12:00:00Z"
}
```
