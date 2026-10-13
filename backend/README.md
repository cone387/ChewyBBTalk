# ChewyBBTalk 后端

原生 FastAPI + Uvicorn，使用 Pydantic、SQLAlchemy 2、Alembic、SQLAdmin 和 PyJWT。
应用运行不加载 Django、DRF、SimpleJWT 或 chewy-attachment；附件使用原生本地/S3 存储。
冻结迁移、旧数据库 fixture 与明确标注的历史材料仅用于升级兼容和追溯。

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

`BACKEND_HOST`、`BACKEND_PORT` 调整本地监听地址，`WEB_CONCURRENCY` 调整生产 worker 数量。
旧 `GUNICORN_WORKERS` 配置不再读取，已有部署需改为 `WEB_CONCURRENCY`。
所有后端入口（Uvicorn、CLI、`uv run dev`、`start_backend.sh`）均自动读取根目录 `.env`，
进程环境变量优先，不执行文件中的 shell 表达式。前端也使用同一文件，详见[统一配置说明](../docs/configuration.md)。
根目录脚本支持 `dev`、`prod`、`test` 参数。Docker、Supervisor、浏览器测试使用同一 ASGI 入口。

## 已有实例升级

服务器按[保留历史数据升级步骤](../docs/image-deployment.md#保留服务器历史数据升级)执行。
代码推送不会自动通过 SSH 更新生产容器；手动部署前必须完成完整备份和副本验证。

升级顺序：先停止旧后端、worker 和其他写入者，再一起备份完整数据库、附件、`DATA_DIR` 和
`SECRET_KEY`。账号导出不能替代升级前的完整数据库备份。先在隔离副本验证迁移与业务内容，
确认可恢复后，在停写期间保持已有 `DATABASE_URL`、`MEDIA_ROOT`、`DATA_DIR`、`SECRET_KEY`，
执行 `uv sync --frozen` 及 `uv run python -m cli migrate`，核验后再启动新服务。
运行中的旧服务不得连接已经升级的数据库；不要直接让新旧服务共用写入。

Alembic 接管业务表并升级结构，保持已有业务记录及其标识。旧数据库须已完成
`0009_password_recovery`；字段不完整时会在修改业务表前拒绝迁移。
更早版本先用旧版程序完成数据库升级，再执行原生迁移。空数据库直接创建完整表结构。

保留账号、原密码验证能力、令牌状态行、记录/标签/评论 ID、附件路径及 S3 加密密钥。
**API 3.0.0 是协议升级：Web、移动端、桌面端和外部客户端须同步更新，所有旧 JWT、刷新令牌、Cookie 和管理后台会话需要重新登录。**
原生结构整理会把旧框架元数据归档后移除旧表；具体版本与归档说明见下文。
直接运行后端命令且未指定路径时，本地数据统一放在 `backend/var/`，数据库为
`var/db.sqlite3`，密钥及备份在 `var/data/`，附件在 `var/media/`。不再自动读取旧项目目录。
`var/` 是本项目的本地运行目录约定，不属于 FastAPI 的强制结构；它不进入 Git、安装包或镜像。
旧本地实例升级前停止后端，将 `backend/chewy_space/` 中的 `db.sqlite3`、完整 `data/`
及 `media/` 迁入 `backend/var/`，保留 `.secret_key`，核验文件和数据库完整性后再删除旧目录。
如存在 SQLite 的 `-wal` 文件，须先正常关闭数据库并完成检查点，不能仅复制主数据库文件。
目标已有数据时先核对并备份，禁止直接覆盖。显式环境变量优先，已有绝对路径配置可继续使用。
安装 wheel 后，未配置环境变量时以启动工作目录为基础解析 `var/`；生产环境应设置绝对路径。
根目录启动脚本与直接运行后端统一使用 `backend/var/`。原先通过脚本使用项目 `data/` 的实例，
应在根 `.env` 显式设置原来的 `DATABASE_URL`、`DATA_DIR` 和 `MEDIA_ROOT`，避免切换到另一份数据。
容器继续使用 `/app/data` 挂载卷，宿主目录通过 `HOST_DATA_DIR` 设置。
`STATIC_ROOT` 和 `staticfiles` 卷不再是部署要求；已有静态目录不自动删除，确认没有其他应用使用后由维护者清理。
当前 Nginx 不公开 `/media/`，附件只通过鉴权 API 读取；历史数据库中的附件标识保留，客户端使用当前无尾斜杠 API URL。
回退应恢复升级前的配套数据备份和旧代码。

升级到当前版本必须执行迁移，并按新的认证协议重新登录：
`0002_web_sessions` 会补齐早期原生数据库可能缺失的 `cb_sessions` 表，修复 Cookie 登录返回 503。
已有会话表会保留，迁移不会清空业务数据；不能仅更新代码而跳过 `python -m cli migrate`。

`0003_native_schema` 继续完成原生结构接管：

- 刷新令牌与撤销关系迁入 `cb_refresh_tokens`、`cb_revoked_tokens`，保留主键和有效/撤销状态。
- `django_admin_log`、`django_content_type`、`django_migrations`、`django_session`、`auth_group`、
  `auth_permission`、`auth_group_permissions` 的现有行归档到 `cb_migration_archive`，然后移除这七张旧表。
  归档保存来源表 `source`、行序号 `sequence` 和 JSON 文本 `payload`；二进制、日期等值带类型标记。
  这是供追溯的数据归档，应用不会把旧 Session 重新当作有效登录，也不提供自动还原旧框架的功能。
- 业务 UID 列统一为 64 字符，补齐目标结构的唯一约束、外键、检查约束和查询索引。
    迁移前检查重复键、孤儿关系、空值及超长值；无效数据或未支持的扩展字段/外键会拒绝接管，
  不通过删除业务行或静默截断来修复。失败后先根据表/约束名称在备份副本核查，禁止带错强行继续。
- 升级可能重建表并复制记录，须预留额外磁盘空间和停写窗口；重复运行已完成的 revision 不重复归档。
  如发现 `_native_v3_` 或 `_previous_v3_` 表，先恢复备份或人工核验中断状态，不直接删表重试。

SQLite/PostgreSQL 的迁移使用同一事务；MySQL DDL 不是事务操作，切换使用原子重命名并暂存旧表，
不能承诺任意中断都会自动回滚。MySQL 尤其需要停写窗口、完整备份和中断后的人工核验。

MySQL 要求 8.0.16 或更新版本以保证 CHECK 生效；原生表使用 utf8mb4、LONGTEXT、DOUBLE 和
DATETIME(6)，保留 Unicode、长正文、排序精度和微秒。替换原表前逐表流式核对规范化内容 SHA-256，
内容不一致即拒绝替换。自定义视图、触发器、额外唯一约束或 CHECK 规则须先单独迁移；
预检会明确拒绝，避免表重建时静默丢失扩展规则。SQLite 的 JSON 字段保留数据库有效性检查。

`0004_native_credentials` 将可验证的 PBKDF2/scrypt 密码序列化无损转换为带版本、算法、参数、salt 和 digest 的 JSON 文本，凭据列扩展为 Text（MySQL LONGTEXT）；原密码不变，无需用户重设。未知、损坏或禁用凭据保留原值且不能用于登录。撤销时间列由 `blacklisted_at` 改名为 `revoked_at`，令牌与会话历史行不清空；旧协议令牌仍须重新登录。

不支持的密码成本及可疑历史格式会在整条迁移链的 DDL 前拒绝，需先在副本中处理；不会通过降低成本或悄悄启用凭据来继续。0004 支持校验并接续 MySQL 已完成扩列、重命名或部分密码转换的中间状态。字段缺失、新旧字段并存等异常结构仍会拒绝；0003 中断后的恢复要求不变。

上述说明描述迁移行为，实际验证环境与限制以本次 [整改报告](../docs/native-contract-cleanup.md) 为准；
不能把本地 SQLite 通过当作所有数据库已实测。该 revision 不支持自动 downgrade，回退必须恢复完整备份。

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
首次创建包含 240 条记录与本地演示附件。已有账号用 `uv run python -m cli seed-demo`
显式补充；不重置密码或覆盖仍存在的记录，详见[演示场景清单](../docs/demo-data.md)。

`SECRET_KEY` 用于 JWT、Session 签名和 S3 密钥派生（`enc:v1:`）。未配置时自动生成并
持久化到 `DATA_DIR/.secret_key`。保持密钥稳定并纳入备份；`encrypt-storage-secrets`
可重复执行，将旧明文 S3 密钥回填为加密值。

## 环境变量

| 变量 | 用途 / 默认值 |
| --- | --- |
| `DATABASE_URL` | 本地默认 `backend/var/db.sqlite3`；也支持 `postgresql://...`（明确使用 psycopg2）、`mysql://...` |
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

规范入口为 `/api/v1/bbtalk`、`/api/v1/attachments/files`，通过 Pydantic 声明请求和响应。
只接受无尾斜杠规范路径；旧 JSON 后缀、存储别名、过滤别名与 `post_tags` 已移除。
查询模型拒绝未知字段，校验错误采用 FastAPI 422。所有分页统一为 `items/total/page/page_size/has_more`，记录流另含 `total_count`，评论另含 `revision` 且始终分页。桌面端仅在加载历史数据时迁移旧草稿，未确认提交先核对服务器回执。
UID 在路径、排序和导入中统一为 1–64 字符；导入缺失 UID 可自动生成，显式非法 UID 按行拒绝并计入导入错误。
标签列表保持数组协议并返回完整集合。Cookie `cb_session` / `cb_csrf` 会话的写请求还需 `X-CSRF-Token`，不因保留 Session 而依赖旧框架。
支持分页、持久幂等回执、条件编辑、桌面 PKCE 授权、密码恢复和附件 Range。
路径、参数映射和 PUT/PATCH 语义见 [FastAPI 接口契约](../docs/fastapi-contract.md)。
Swagger：`/docs`；ReDoc：`/redoc`；
OpenAPI：`/openapi.json`；存活检查：`/healthz`。

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
├── schemas/                # 按业务划分的请求、查询和响应模型
├── core/                   # 环境配置和业务异常
├── database/               # 数据库连接、会话及迁移入口
│   └── migrations/         # Alembic 历史版本及冻结表结构
├── storage/                # 本地 / S3 驱动和账号存储配置
├── backups/                # 完整性校验、导入导出、锁和保留策略
├── admin/                  # SQLAdmin
├── cli/                    # 管理命令及演示数据
├── templates/              # 安装包内的公共页面模板
├── tests/
│   ├── unit/               # 纯逻辑、规范路由及依赖边界
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
