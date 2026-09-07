# ChewyBBTalk 后端

Django 5.2 + DRF 的碎碎念后端服务。

## 本地开发

```bash
# 安装依赖
cd backend
uv sync

# 数据库迁移
uv run python chewy_space/manage.py migrate

# 初始化管理员（未指定 ADMIN_PASSWORD 时生成受限凭据文件）
uv run python chewy_space/manage.py init_system

# 将历史明文 S3 密钥回填为加密值（可重复执行，不修改管理员密码）
uv run python chewy_space/manage.py encrypt_storage_secrets

# 创建所有用户的 ZIP 备份（默认写入 DATA_DIR/backups，每用户保留 7 份）
uv run python chewy_space/manage.py backup_data

# 只备份指定用户并保留 14 份；可先用 --dry-run 预览
uv run python chewy_space/manage.py backup_data --user-id 1 --keep 14 --dry-run

# 启动开发服务器
uv run python chewy_space/manage.py runserver 0.0.0.0:8020
```

或者用项目根目录的脚本一键启动：

```bash
./start_backend.sh
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | 数据库连接 | `sqlite:///db.sqlite3` |
| `DEBUG` | 调试模式 | `True` |
| `SECRET_KEY` | Django Secret Key | 自动生成并持久化 |
| `ALLOWED_HOSTS` | 允许的主机 | `*` |
| `ADMIN_USERNAME` | 初始管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 初始管理员密码 | 留空时随机生成，保存到 DATA_DIR/credentials/initial-admin.json |

S3 Secret Access Key 会以 `enc:v1:` 格式加密存储，密钥由 `SECRET_KEY` 派生。请保持生产环境的 `SECRET_KEY` 稳定；历史明文配置可按上面的命令手动回填，管理员密码策略不受影响。

支持 SQLite、PostgreSQL、MySQL，通过 `DATABASE_URL` 切换：

```bash
# PostgreSQL
DATABASE_URL=postgresql://user:pass@localhost:5432/chewybbtalk

# MySQL
DATABASE_URL=mysql://user:pass@localhost:3306/chewybbtalk
```

## API 文档

启动后访问 Swagger UI 查看完整 API 文档：

- http://localhost:8020/api/schema/swagger-ui/
- http://localhost:8020/api/schema/redoc/

## 项目结构

```
backend/
├── chewy_space/
│   ├── bbtalk/            # 核心业务模块
│   │   ├── models.py        # User、BBTalk、Tag、Attachment 模型
│   │   ├── views.py         # API 视图
│   │   ├── serializers.py   # 序列化器
│   │   ├── authentication.py # JWT + Session 认证
│   │   ├── storage_provider.py # 用户自定义 S3 存储
│   │   ├── data_export.py   # 数据导出
│   │   └── data_import.py   # 数据导入
│   ├── chewy_space/       # Django 配置
│   │   ├── settings.py      # 统一配置（环境变量驱动）
│   │   └── urls.py          # 路由
│   └── manage.py
├── pyproject.toml         # 依赖配置
└── Dockerfile
```

## 运行测试

```bash
uv run python chewy_space/manage.py test bbtalk
```


### 注册与认证请求限制

自助注册默认关闭，包括升级后未配置此项的实例；已有账号仍可登录。
需要开放注册时，在根目录 `.env` 设置 `REGISTRATION_ENABLED=true` 并重启服务。
Web 登录页读取服务端策略，关闭时展示管理员联系提示；策略读取失败可重试，不阻止已有账号登录。

`AUTH_LOGIN_RATE=30/minute`、`AUTH_REGISTRATION_RATE=5/minute`、`AUTH_REFRESH_RATE=120/minute`
分别控制登录（JWT 与旧登录接口共享额度）、注册和令牌刷新请求；成功与失败请求均计数。
达到限制返回 HTTP 429、中文原因、`Retry-After` 秒数和 `retry_after` 字段。
设置某项为空可关闭该项限制，修改后需重启服务。

默认使用 Django 进程内缓存，按直接连接 IP 计数；多个 worker 的额度独立，重启会重置，
不是全局严格配额。应用不信任客户端提供的 `X-Forwarded-For`，反向代理后的访问可能共享代理 IP 额度。
部署时按并发和用户规模调整额度；需要跨 worker 或真实来源 IP 的统一限制时，
在可信入口代理配置对应限流，或另行配置共享缓存及可信代理策略。
