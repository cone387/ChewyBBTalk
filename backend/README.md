# ChewyBBTalk 后端

基于 Django 5.2 + Django REST Framework 的 BBTalk（碎碎念）后端服务。

## 技术栈

- **Python**: >= 3.13
- **框架**: Django 5.2 + Django REST Framework
- **认证**: Authelia（通过反向代理 + 数据库用户）
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
│   │   ├── authentication.py  # Authelia 认证
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
uv run python chewy_space/manage.py runserver 0.0.0.0:8000
```

### 运行测试

```bash
cd backend
uv run python chewy_space/manage.py test bbtalk
```

## API 路由

| 路径 | 说明 | 认证 |
|------|------|------|
| `/api/v1/bbtalk/` | BBTalk CRUD | 需要 |
| `/api/v1/bbtalk/{uid}/` | BBTalk 详情（按 uid） | 需要 |
| `/api/v1/bbtalk/tags/` | 标签管理 | 需要 |
| `/api/v1/bbtalk/public/` | 公开 BBTalk 列表 | 不需要 |
| `/api/v1/bbtalk/user/me/` | 当前用户信息 | 需要 |
| `/api/v1/attachments/files/` | 附件上传/管理 | 需要 |
| `/api/schema/swagger-ui/` | Swagger API 文档 | 不需要 |
| `/api/schema/redoc/` | ReDoc API 文档 | 不需要 |
| `/admin/` | Django Admin | 需要（Authelia） |

## 认证说明

### Authelia 认证

项目使用 Authelia 作为统一认证服务：

**生产环境**（通过反向代理）：
- Authelia 认证后，Nginx 注入以下请求头：
  - `Remote-User`: 用户名
  - `Remote-Email`: 邮箱
  - `Remote-Name`: 显示名称
  - `Remote-Groups`: 用户组（逗号分隔）

**开发环境**（DEBUG=True）：
- 支持测试请求头模拟认证：
  - `X-Authelia-User-Id`: 用户 ID（必填）
  - `X-Username`: 用户名（必填）
  - `X-Email`: 邮箱
  - `X-Groups`: 用户组（如 `admin,users`）

### 测试 API

```bash
# 使用测试请求头
curl -X GET "http://localhost:8000/api/v1/bbtalk/" \
  -H "X-Authelia-User-Id: test123" \
  -H "X-Username: testuser"

# 获取当前用户
curl -X GET "http://localhost:8000/api/v1/bbtalk/user/me/" \
  -H "X-Authelia-User-Id: test123" \
  -H "X-Username: testuser"

# 创建 BBTalk
curl -X POST "http://localhost:8000/api/v1/bbtalk/" \
  -H "X-Authelia-User-Id: test123" \
  -H "X-Username: testuser" \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello World!", "visibility": "public"}'
```

### 访问 Admin

开发环境使用浏览器扩展（如 ModHeader）添加请求头：

```
X-Authelia-User-Id: admin
X-Username: admin
X-Groups: admin
```

然后访问 http://localhost:8000/admin/

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
docker run -p 8000:8000 \
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
- authelia_user_id: CharField (唯一，关联 Authelia)
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
- context: JSONField (上下文信息)
```

### Tag

```python
- name: CharField
- user: ForeignKey → User
- color: CharField (HEX 颜色)
- sort_order: IntegerField
```
