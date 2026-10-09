# ChewyBBTalk 后端

原生 FastAPI + Uvicorn，使用 Pydantic、SQLAlchemy 2、Alembic 和 SQLAdmin。
Django、DRF、SimpleJWT 和 chewy-attachment 已从代码和运行依赖移除。

## 本地运行

```bash
cd backend
uv sync --frozen
uv run python -m chewy_api.cli migrate
uv run python -m chewy_api.cli init
uv run dev
```

生产入口（先迁移，再启动 worker）：

```bash
uv run uvicorn chewy_api.app:app --host 0.0.0.0 --port 8020 --no-proxy-headers
```

`BACKEND_HOST`、`BACKEND_PORT` 调整开发监听地址。根目录 `start_backend.sh`
加载 `.env`，支持 `dev`、`prod`、`test` 参数。Docker、Supervisor、浏览器测试使用同一 ASGI 入口。

## 已有实例升级

先一起备份数据库、附件、`DATA_DIR` 和 `SECRET_KEY`。保持已有 `DATABASE_URL`、
`MEDIA_ROOT`、`DATA_DIR`、`SECRET_KEY`，执行 `uv sync --frozen` 及
`uv run python -m chewy_api.cli migrate`，再启动新服务。迁移期间停止旧服务。

Alembic 直接接管业务表，不复制或删除已有记录。旧数据库须已完成
`0009_password_recovery`；字段不完整时会在修改业务表前拒绝迁移。
更早版本先用旧版程序完成数据库升级，再执行原生迁移。空数据库直接创建完整表结构。

保留原有 PBKDF2/scrypt 密码、JWT 和刷新令牌黑名单、记录/标签/评论 ID、附件路径及
S3 加密密钥。**旧 Cookie 会话和管理后台需要重新登录**；JWT 客户端可继续使用有效令牌。
已有数据库中的旧框架元数据和审计表保持原样，不再被框架使用，不属于运行依赖。
本地默认路径仍指向 `backend/chewy_space/`，用于沿用既有数据库、媒体和数据目录，
该目录不再包含应用代码。回退应恢复升级前的配套数据备份和旧代码。

`/admin/` 改由 SQLAdmin 提供，支持账号资料及权限管理、业务数据只读查询。
账号创建使用 CLI；记录、附件等修改经过账号 API，保证可见性、提交回执和文件操作一致。

## 管理命令

```bash
uv run python -m chewy_api.cli --help
uv run python -m chewy_api.cli create-user alice --email alice@example.com
uv run python -m chewy_api.cli create-user operator --admin
uv run python -m chewy_api.cli encrypt-storage-secrets
uv run python -m chewy_api.cli backup --user-id 1 --keep 14 --dry-run
uv run python -m chewy_api.cli backup --user-id 1 --keep 14
uv run python -m chewy_api.cli check
uv run python -m chewy_api.cli shell
```

`init` 不重置已有管理员密码。`ADMIN_USERNAME` 默认为 `admin`；未提供 `ADMIN_PASSWORD`
时生成随机密码，保存到受限文件 `DATA_DIR/credentials/initial-admin.json`。
仅 `CREATE_DEMO_USER=true` 时创建演示账号 `demo / demo123` 和数据。

`SECRET_KEY` 用于 JWT、Session 签名和 S3 密钥派生（`enc:v1:`）。未配置时自动生成并
持久化到 `DATA_DIR/.secret_key`。保持密钥稳定并纳入备份；`encrypt-storage-secrets`
可重复执行，将旧明文 S3 密钥回填为加密值。

## 环境变量

| 变量 | 用途 / 默认值 |
| --- | --- |
| `DATABASE_URL` | `sqlite:///db.sqlite3`；也支持 `postgresql://...`、`mysql://...` |
| `DATA_DIR` | 密钥、初始化凭据及备份的持久化目录 |
| `MEDIA_ROOT` | 附件根目录，实际文件在 `attachments/` 下 |
| `BACKUP_ROOT` | 可选覆盖 `DATA_DIR/backups` |
| `SECRET_KEY` | 稳定签名和加密密钥 |
| `ALLOWED_HOSTS` | 逗号分隔的允许主机，默认 `*` |
| `CORS_ALLOWED_ORIGINS` | 逗号分隔的允许客户端来源 |
| `CORS_ORIGIN_ALLOW_ALL` | 默认关闭 |
| `SESSION_COOKIE_SECURE` | HTTPS 部署开启 |
| `REGISTRATION_ENABLED` | 默认关闭；不影响已有账号登录 |
| `AUTH_LOGIN_RATE` | `30/minute` |
| `AUTH_REGISTRATION_RATE` | `5/minute` |
| `AUTH_REFRESH_RATE` | `120/minute` |
| `ATTACHMENT_MAX_FILE_SIZE` | 默认 10 MiB |
| `IMPORT_MAX_FILE_SIZE` | 默认 512 MiB，同时约束 ZIP 解压总大小 |
| `TIME_ZONE` | 默认 `Asia/Shanghai` |

限流器按直接连接 IP 在每个 worker 内计数，成功与失败请求均计入，重启重置。
配置为空可关闭该限制；超过限制返回 429 和 `Retry-After`。应用不信任任意转发 IP 头。
需要跨 worker 配额时，在可信反向代理设置统一限流。沿用 `X-Forwarded-Proto: https`
识别 HTTPS 外部链接的约定；入口代理应覆盖此头，来源 IP 不随转发头改写。
邮件恢复默认关闭，SMTP 配置见 [移动端发布说明](../mobile/RELEASE_READINESS.md)。

## 接口和数据

沿用 `/api/v1/bbtalk/`、`/api/v1/attachments/files/` 路径及客户端契约，支持
JSON 后缀、分页、持久幂等回执、条件编辑、桌面 PKCE 授权、密码恢复和附件 Range。
Swagger：`/api/schema/swagger-ui/`；ReDoc：`/api/schema/redoc/`；
OpenAPI：`/api/schema/`；存活检查：`/healthz`。

附件经鉴权读取，不直接公开媒体目录。S3 下载使用签名重定向。
备份不导出存储密钥；完整 ZIP 包含 SHA-256 清单，跨账号还原重映射 ID 并保留时间戳，
文件恢复失败会回滚。仍有附件的存储配置须先迁移附件才能删除；迁移保留原文件。

## 结构与测试

`chewy_api/` 包含应用、路由、模型、认证、存储、备份、CLI 和 Alembic 迁移。
`tests/fixtures/legacy.sql` 是合成旧数据库，用于在未安装 Django 时验证兼容升级。

```bash
uv run pytest
uv run coverage run -m pytest
uv run coverage json
uv run coverage report
node ../scripts/check-coverage.mjs backend
uv run python benchmark_feed.py --sizes 1000 10000 --repeats 10
```

默认测试使用临时 SQLite。设置指向独立测试库的 `TEST_DATABASE_URL`，再执行
`uv run pytest tests/test_concurrency.py` 可验证 PostgreSQL 行锁；CI 使用 PostgreSQL 16。
在 `frontend/` 执行 `npm run test:e2e` 会启动独立临时原生后端。

SQLite 显式开启事务，使保存点参与外层回滚，参见
[SQLAlchemy SQLite 事务文档](https://docs.sqlalchemy.org/en/20/dialects/sqlite.html#serializable-isolation-savepoints-transactional-ddl)。
