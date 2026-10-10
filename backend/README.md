# ChewyBBTalk 后端

原生 FastAPI + Uvicorn，使用 Pydantic、SQLAlchemy 2、Alembic 和 SQLAdmin。
Django、DRF、SimpleJWT 和 chewy-attachment 已从代码和运行依赖移除。

## 本地运行

```bash
cd backend
uv sync --frozen
uv run python -m cli migrate
uv run python -m cli init
uv run dev
```

生产入口（先迁移，再启动 worker）：

```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8020 --no-proxy-headers
```

`BACKEND_HOST`、`BACKEND_PORT` 调整开发监听地址。根目录 `start_backend.sh`
加载 `.env`，支持 `dev`、`prod`、`test` 参数。Docker、Supervisor、浏览器测试使用同一 ASGI 入口。

## 已有实例升级

先一起备份数据库、附件、`DATA_DIR` 和 `SECRET_KEY`。保持已有 `DATABASE_URL`、
`MEDIA_ROOT`、`DATA_DIR`、`SECRET_KEY`，执行 `uv sync --frozen` 及
`uv run python -m cli migrate`，再启动新服务。迁移期间停止旧服务。

Alembic 直接接管业务表，不复制或删除已有记录。旧数据库须已完成
`0009_password_recovery`；字段不完整时会在修改业务表前拒绝迁移。
更早版本先用旧版程序完成数据库升级，再执行原生迁移。空数据库直接创建完整表结构。

保留原有 PBKDF2/scrypt 密码、JWT 和刷新令牌黑名单、记录/标签/评论 ID、附件路径及
S3 加密密钥。**旧 Cookie 会话和管理后台需要重新登录**；JWT 客户端可继续使用有效令牌。
已有数据库中的旧框架元数据和审计表保持原样，不再被框架使用，不属于运行依赖。
直接运行后端命令且未指定路径时，本地数据统一放在 `backend/var/`，数据库为
`var/db.sqlite3`，密钥及备份在 `var/data/`，附件在 `var/media/`。不再自动读取旧项目目录。
`var/` 是本项目的本地运行目录约定，不属于 FastAPI 的强制结构；它不进入 Git、安装包或镜像。
旧本地实例升级前停止后端，将 `backend/chewy_space/` 中的 `db.sqlite3`、完整 `data/`
及 `media/` 迁入 `backend/var/`，保留 `.secret_key`，核验文件和数据库完整性后再删除旧目录。
如存在 SQLite 的 `-wal` 文件，须先正常关闭数据库并完成检查点，不能仅复制主数据库文件。
目标已有数据时先核对并备份，禁止直接覆盖。显式环境变量优先，已有绝对路径配置可继续使用。
安装 wheel 后，未配置环境变量时以启动工作目录为基础解析 `var/`；生产环境应设置绝对路径。
根目录启动脚本继续显式使用项目 `data/`，容器继续使用 `/app/data` 挂载卷。
回退应恢复升级前的配套数据备份和旧代码。

本次目录重组不改变数据库结构或 Alembic revision，也不使原生后端已签发的 Session/JWT 失效。
自定义 Uvicorn 启动配置需改为 `main:app`；管理命令改为 `python -m cli`。
安装包名为 `bbtalk-backend`，源码直接按职责放在 `backend/` 下，没有额外项目包或 `src/` 外层。

`/admin/` 改由 SQLAdmin 提供，支持账号资料及权限管理、业务数据只读查询。
账号创建使用 CLI；记录、附件等修改经过账号 API，保证可见性、提交回执和文件操作一致。

## 管理命令

```bash
uv run python -m cli --help
uv run python -m cli create-user alice --email alice@example.com
uv run python -m cli create-user operator --admin
uv run python -m cli encrypt-storage-secrets
uv run python -m cli backup --user-id 1 --keep 14 --dry-run
uv run python -m cli backup --user-id 1 --keep 14
uv run python -m cli check
uv run python -m cli shell
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
| `DATABASE_URL` | `sqlite:///db.sqlite3`；也支持 `postgresql://...`（明确使用 psycopg2）、`mysql://...` |
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

```text
backend/
├── main.py                 # Uvicorn 入口
├── application.py          # 应用工厂和组件装配
├── api/                    # HTTP 依赖、中间件、异常响应、分页和 OpenAPI
│   └── routes/             # 认证、记录、附件、备份、状态及公共页面
├── services/               # 账号、认证和记录的复用逻辑
├── models/                 # SQLAlchemy 数据库模型
├── schemas/                # 按业务划分的请求模型
├── core/                   # 环境配置和业务异常
├── database/               # 数据库连接、会话及迁移入口
│   └── migrations/         # Alembic 历史版本及冻结表结构
├── storage/                # 本地 / S3 驱动和账号存储配置
├── backups/                # 完整性校验、导入导出、锁和保留策略
├── admin/                  # SQLAdmin
├── cli/                    # 管理命令及演示数据
├── templates/              # 安装包内的公共页面模板
├── tests/
│   ├── unit/               # 纯逻辑、路径兼容及依赖边界
│   ├── integration/        # HTTP、数据库、并发和 CLI
│   └── fixtures/           # 合成的旧数据库
├── tools/                  # 浏览器测试服务器、性能基准
├── var/                    # 本地运行数据，不进入 Git 或镜像
├── pyproject.toml
├── uv.lock
└── Dockerfile
```

依赖方向：路由和 CLI 调用服务；服务使用数据库、配置和存储。`core`、`database`、`models`、
`services`、`storage`、`backups` 不导入路由或应用入口；架构测试持续检查这一边界。
`application.py` 导入无运行文件副作用，只有创建应用或运行命令时才解析运行配置。
迁移及模板随 wheel 一起发布，生产运行不依赖源码仓库或 `tools/`。

新增接口在 `api/routes/` 注册，并在 `api/router.py` 装配；通用记录规则放在 `services/`，
文件驱动放在 `storage/`。数据库结构调整应新增 Alembic revision，不修改冻结的 `schema_v1.py`。
执行 `uv sync --frozen` 安装依赖及项目，再从 `backend/` 运行命令和测试。

`tests/fixtures/legacy.sql` 是合成旧数据库，用于在未安装 Django 时验证兼容升级。

```bash
uv run pytest
uv run coverage run -m pytest
uv run coverage json
uv run coverage report
node ../scripts/check-coverage.mjs backend
uv run python tools/benchmark_feed.py --sizes 1000 10000 --repeats 10
```

默认测试使用临时 SQLite。设置指向独立测试库的 `TEST_DATABASE_URL`，再执行
`uv run pytest tests/integration/test_concurrency.py` 可验证 PostgreSQL 行锁；CI 使用 PostgreSQL 16。
在 `frontend/` 执行 `npm run test:e2e` 会启动独立临时原生后端。

SQLite 显式开启事务，使保存点参与外层回滚，参见
[SQLAlchemy SQLite 事务文档](https://docs.sqlalchemy.org/en/20/dialects/sqlite.html#serializable-isolation-savepoints-transactional-ddl)。
