# Django 迁移残留审计

> 本文保留整改前审计基线。后续实现与验收结果见 [原生后端整改验收](native-backend-cleanup.md)。

审计日期：2026-10-12。代码基线：`7dda88a0e97a668523ba418e7ca380c329283db9`（已推送 `origin/master`，包含自动防窥设置开关修复）。

**结论：运行框架已切换到 FastAPI，但尚未达到代码、数据库、部署配置、文档与本地文件均无 Django 痕迹。** 残留主要是旧数据与接口兼容、旧表及索引、过期文档和未清理的本地文件。同时发现两个可复现的标签功能问题、数据库升级校验缺口，以及 OpenAPI 描述不完整。

本轮是审计，没有修改应用实现、业务数据、数据库结构或旧兼容行为。已提交推送的是防窥开关修复；本报告为之后新增的审计结果。

## 范围与验证

- 检查跟踪文件中的后端、三端客户端、依赖锁、启动与部署入口、CI、当前文档、OpenSpec，以及隐藏的 `.kiro/specs` 历史材料。
- 检查当前 Python 环境、后端本地临时文件及 `backend/dist` 中现有安装包。
- 以只读方式检查 `backend/var/db.sqlite3` 的表、索引名称和 Alembic 修订；未读取业务内容。线上数据库和线上容器不在本轮验证范围。
- 新建库、合成旧库升级、异常结构升级与 HTTP 探针全部在内存 SQLite 或系统临时目录中执行。没有对实际业务库执行迁移。
- `uv run --frozen pytest -q`：162 项通过，10 项子测试通过。两个警告分别是 Starlette TestClient 的 httpx 弃用提示，以及重复 ZIP 成员防护用例故意触发的提示。
- 防窥开关提交前：49 项相关 Vitest 测试、TypeScript 检查通过；上一轮已完成的 4 项桌面/窄屏 Playwright 验证本轮未重复执行。
- 根目录布局检查、Git 差异检查通过。完整测试通过不代表以下未覆盖场景不存在问题。

## 优先处理的问题

### 标签 UID 契约不一致

证据：`backend/api/parameters.py:12`、`backend/schemas/records.py:86`、`backend/backups/transfer.py:220`、`backend/models/__init__.py:122`。

路径参数与现行契约允许 UID 长度 1–64，但排序载荷 `items[].uid` 限制为 22；另一种排序载荷 `uids[]` 没有相同限制。导入会保留原 UID。

实际 HTTP 复现：

| 操作 | 结果 |
| --- | --- |
| 导入 UID 为 23 个 `t` 的标签 | 200，`tags_created=1` |
| GET 该标签 | 200 |
| 使用 `items: [{uid, sort_order: 1}]` 排序 | 422，`body.items.0.uid` 超过 22 字符 |
| 使用 `uids: [uid]` 排序 | 200 |

这属于功能性重构遗留，不是 Django 运行依赖。应统一导入、路径、两种排序载荷与数据库的 UID 契约。记录、标签、评论的数据库列仍为 `String(22)`（模型第 122、144、157 行），不能只放宽一个 Pydantic 字段就宣称各数据库一致。本次长 UID 成功导入仅在 SQLite 验证，PostgreSQL/MySQL 尚未实测。

### 超过 2000 个标签后全量排序无法完成

证据：`backend/api/routes/records.py:276`、`:315`。

列表固定 `.limit(2000)`，没有下一页或截断标志；`uids` 排序却要求输入包含账号全部标签。内存库创建 2001 个标签后，GET 只返回 2000 个；将全部返回 UID 提交排序得到 409“标签列表已改变，请刷新后重新排序”。刷新仍会截断，无法解决。

应统一标签列表完整性与排序协议，例如提供可完整加载的列表，或采用明确的局部排序协议。不能仅改变错误提示。

### 旧库接管缺少关键约束校验

证据：`backend/database/migrations/versions/0001_native_backend.py:20`、`:24`、`:30`。

基线迁移检查表和字段名称，然后执行 `create_all(checkfirst=True)`，没有核对已有表的唯一约束、外键、字段类型、NULL、CHECK 与索引。缺表检测还以存在 `cb_users` 为前提。

复现方法是在内存加载合成旧库，删除记录标签关联的唯一索引后执行升级。升级仍成功，随后相同 `(bbtalk_id, tag_id)` 可以插入两次。**这是异常结构可被误接管的证明，不代表实际本地库已经有重复数据。** 本地实际库仍能看到该唯一索引。

应增加升级预检与必要的修复 revision，覆盖回执 `(user_id,key)`、令牌 `jti`、黑名单 `token_id`、记录标签关联等关键约束。需要变更结构时新增 Alembic revision，不改冻结的 `schema_v1.py`。

### OpenAPI 没有描述完整的实际契约

证据：`backend/api/routes/records.py:124`、`:161`、`:279`、`:285`；`backend/services/security.py:259`；`backend/api/dependencies.py:19`。

| 接口行为 | 实际结果 | 生成的 OpenAPI |
| --- | --- | --- |
| 创建记录与同键幂等重放 | 首次 201，重放 200 | 仅列 201、422 |
| 新建标签 | 201；已存在标签时为 200 | 仅列 200、422 |
| Cookie 认证的写请求 | 需要 `X-CSRFToken` | 安全方案只有 Bearer/Cookie，受保护 PATCH 的 header 仅列 `If-Match` |

真实请求及生成 schema 均已核实。401/403/409 等业务响应也未系统声明。应补充响应与 Cookie 写请求要求，使生成 SDK 和 Swagger 使用者获得完整信息。Markdown 中提到这些行为不能代替机器可读契约。

## 数据库表名与结构残留

### 当前运行表

新建原生库有 14 张运行表及 `alembic_version`。

| 表 | 分类 |
| --- | --- |
| `cb_users` | 项目账号表 |
| `cb_identities` | 项目身份及密码凭据表 |
| `cb_tags` | 项目标签表 |
| `cb_bbtalk_tag_relations` | 项目记录标签关联表 |
| `cb_bbtalks` | 项目记录表 |
| `cb_comments` | 项目评论表 |
| `cb_user_storage_settings` | 项目存储配置表 |
| `cb_attachments` | 项目附件表，保留旧附件模型字段设计 |
| `cb_submission_receipts` | 幂等回执表 |
| `cb_desktop_authorizations` | 桌面授权表 |
| `cb_password_recovery` | 密码恢复表 |
| `cb_sessions` | 原生会话表，不是 Django Session 后端 |
| `token_blacklist_outstandingtoken` | 明确保留的 SimpleJWT 风格旧表名，当前仍写入和读取 |
| `token_blacklist_blacklistedtoken` | 明确保留的 SimpleJWT 风格旧表名，当前仍用于撤销刷新令牌 |
| `alembic_version` | 原生迁移版本表 |

表定义见 `backend/models/__init__.py:74` 至 `:253`。`cb_*` 是项目命名，不是 Django 自动命名，不能将它们全部当成框架残留。两张 `token_blacklist_*` 在全新库也会创建，确实仍有旧框架命名，但不是可直接删除的死表；调用见 `backend/services/security.py:186`、`:227`、`:239`。

### 本地实际旧库保留的框架表

只读检查确认 `backend/var/db.sqlite3` 位于修订 `0002_web_sessions`，除上述 15 表外还有以下 7 表及 SQLite 自身的 `sqlite_sequence`，合计 23 表：

- `auth_group`
- `auth_group_permissions`
- `auth_permission`
- `django_admin_log`
- `django_content_type`
- `django_migrations`
- `django_session`

它们不在当前 SQLAlchemy metadata 内，空库不会创建，升级迁移明确保留。旧 `django_migrations` 不再驱动迁移；旧 `django_session` 不再用于登录。

`django_admin_log` 有一个实际运行期访问点：注销账号时先检查其存在，再清理该用户的旧审计记录，以避免外键阻止注销，见 `backend/services/accounts.py:71`。因此“没有 Django import”成立，“运行代码完全不触及任何 Django 表”不成立。

如要清除旧框架表，应单独迁移并考虑审计保留和表间外键顺序；不能直接删掉注销兼容逻辑。当前审计没有删除这些表或历史数据。

### 索引和约束并未在新旧库之间统一

本地旧库保留大量 Django 自动生成的哈希索引名，如 `cb_bbtalks_user_id_b5179c10`、`django_admin_log_user_id_c564eba6`、`token_blacklist_outstandingtoken_user_id_83bc629a`。名称本身不影响原生 ORM 查询。

空库和合成旧库分别升级后，结构差异包括：

| 项目 | 差异与影响 |
| --- | --- |
| 评论索引 | 旧库有 `(bbtalk_id,create_time)` 等联合索引，新建模型只有相关单列索引；值得结合当前预览、排序查询评估 |
| 附件索引 | 旧库有 `(owner_id,created_at)`、`storage_config_id` 索引，新建库缺少对应索引；涉及列表及存储配置删除检查 |
| 存储配置索引 | 旧库有 `(user_id,is_active)`；新建库没有，但多出时间单列索引 |
| 其他旧索引 | 身份 provider/user/type、用户 email、回执 record/user、授权 user、token user 等存在差异；不能不看查询就全部恢复 |
| 重复索引 | 旧 `users.username`、身份 `(identity_type,identifier)` 的部分索引已经由唯一约束覆盖，不必机械复制 |
| 外键 | 新建库部分 FK 带 CASCADE/SET NULL，旧库缺少部分 FK 或保留 deferred/no-action；接管迁移没有改造旧表 |
| CHECK | 旧 fixture 有 credential_version 非负、记录 JSON_VALID 等 CHECK，新建 SQLite 模型没有同样约束 |
| 递增语义 | 旧 SQLite 表常显式 AUTOINCREMENT，新模型未设置该选项；最高 ID 删除后可能复用，评论版本代码已考虑 ID 复用 |

证据：`backend/tests/fixtures/legacy.sql:160` 至 `:210`、`backend/models/__init__.py:97` 至 `:247`、`backend/services/records.py:174`。

这些差异已通过内存库反射确认；没有做性能压测，不能把每个缺失的同名索引都认定为已发生的性能故障。当前模型与冻结 `schema_v1.py` 的 SQLite CREATE TABLE/INDEX 编译结果一致，差异来自对既有数据库的接管策略。

## 代码风格与接口兼容

### 已经原生化的部分

当前 Python 环境中 `django`、`rest_framework`、`rest_framework_simplejwt`、`asgiref`、`chewy_attachment`、`gunicorn` 均不可导入。项目依赖和锁文件使用 FastAPI、Uvicorn、Pydantic、SQLAlchemy、Alembic、SQLAdmin。

入口是 `application.create_app()` 与 `main:app`；路由为 `APIRouter`，参数通过 Pydantic、Query、Path、Header、Form、File 声明，数据库 Session 使用 `yield` 依赖。模型为 `DeclarativeBase/Mapped/mapped_column`，查询为 SQLAlchemy `select/update/delete`。运行源码未发现 Django/DRF 的 import、ViewSet、ModelSerializer、QuerySet、`permission_classes` 或 `.objects` 调用。

同步 `def` 路由、snake_case、Settings、Session、`/records/{uid}/comments` 资源路径不是 Django 专属特征。不能通过机械改为 async、改查询参数或改业务表名判断迁移质量。

### 确实保留的旧协议外观

| 残留 | 位置与当前作用 |
| --- | --- |
| 尾斜杠、存储 `/create/`、`/{pk}/delete/` | `backend/api/compat.py:32`；隐藏兼容别名 |
| `.json` URL 后缀 | `backend/api/middleware.py:17`；旧客户端路径兼容 |
| `tags__name`、`create_time__gte/lte`、`create_date__gte/lte`、`create_time__date`、`export_format` | `backend/schemas/query.py:51`、`backend/api/compat.py:11`；映射为具名原生字段，不调用 Django lookup 引擎 |
| `ordering=-update_time` 与 CSV 排序 | `backend/schemas/query.py:8`、`:75`；有 Literal 白名单 |
| `count/next/previous/results`、越界页 404 | `backend/api/pagination.py:6`；保留 DRF 外观，实际为 SQLAlchemy 分页 |
| 旧尾斜杠 PUT 的部分更新语义 | `backend/api/routes/records.py:424`、`backend/api/compat.py:59`；新规范 PUT 已采用替换语义 |
| `post_tags` 字符串 | `backend/schemas/records.py:26`、`backend/api/routes/records.py:138`；兼容旧载荷和持久幂等回执 |
| 不带 page 的评论请求返回全量数组 | `backend/api/routes/records.py:460`；仍有无界返回成本，现行契约已标注，新客户端使用分页 |
| 文档路径 `/api/schema/` 等 | `backend/application.py:30`；沿用旧外部入口，内容由 FastAPI 生成 |
| 字符串或字段字典式业务错误 | `backend/api/errors.py`；参数错误已是 FastAPI 422，业务错误仍沿用原有形状 |

三端主要请求已经使用规范无尾斜杠入口，未发现生产客户端继续发送旧双下划线日期/标签参数。三端已处理 FastAPI 422 的 detail 数组。桌面的可选 `post_tags` 是持久草稿兼容；Web/移动上传错误处理的 DRF 字段兜底和注释仍存在（`frontend/src/services/mediaApi.ts:101`、`mobile/src/services/api/mediaApi.ts:124`）。

这些兼容项应有明确的适用范围和退役计划；没有调用 Django 不等于没有旧契约。删除前需要考虑外部客户端、已保存草稿、旧附件链接和幂等重试。

### 认证与数据字段

- `backend/services/security.py:33` 使用标准库生成/验证旧 PBKDF2、scrypt 密码格式，没有调用 Django。保留旧密码可登录的能力是必要兼容。
- JWT 沿用 `token_type/user_id/jti` 和刷新黑名单语义，由 PyJWT 实现。更改 claim 或表名需要兼容迁移。
- `sessionid/csrftoken/X-CSRFToken` 是沿用的协议名，实际会话在 `cb_sessions`；SQLAdmin 使用 `adminsession`。
- `is_active/is_staff/is_superuser/last_login` 仍用于登录及 SQLAdmin 权限，不是废弃字段。没有默认 `auth_user` 表，密码在 `cb_identities.credential`。
- 附件 `owner_id/storage_config_id` 仍是字符串，沿袭旧附件插件模型；当前服务依赖该格式。改整数或加外键需要核对历史数据并迁移。

### 可维护性遗留

- `backend/api/dependencies.py:25` 的 Security 依赖解析出 bearer/session 后没有使用，`services/security.py:247` 又直接读取 Request。并非鉴权绕过，但注入凭据与实际认证输入没有统一。
- `backend/services/records.py:144` 的 `validate_key()` 已没有调用，Header pattern 已接替校验。
- `backend/api/routes/records.py:283`、`:332`、`:493` 的部分空白值 400 检查与 Pydantic 校验重复，正常 HTTP 路径会先返回 422。
- `backend/api/errors.py:17` 将所有 IntegrityError 归为 400、所有 OperationalError 归为带 `submission_retry` 的 503；非提交接口也使用提交错误码，且处理器没有记录底层原因。属于错误分类与排障债务，不是 Django 依赖。
- `app.state` 与字典响应构造函数本身是正常原生设计，不应仅因不像某种 FastAPI 示例模板就重写。

## 部署配置和本地文件

| 项目 | 结论 |
| --- | --- |
| 当前启动链路 | Supervisor、根脚本、backend Dockerfile 启动 Uvicorn；迁移/初始化运行 `python -m cli`，未发现现行 Django 启动链路 |
| `GUNICORN_WORKERS` | `backend/Dockerfile:28,35` 仍保留旧变量别名，实际传给 Uvicorn。无 Gunicorn 运行依赖 |
| `STATIC_ROOT/staticfiles` | `Dockerfile:93,100`、`Dockerfile.cn:100,107`、`docker-compose.yml:21,67`、Nginx、release 工作流及 e2e 环境仍保留旧静态目录约定；当前 backend 没有消费 STATIC_ROOT 或执行 collectstatic。属于待核对清理的部署配置残留 |
| 带尾斜杠探活 | `frontend/playwright.config.ts:26`、`frontend/playwright.desktop.config.ts:8`、`scripts/deploy-image.sh:79` 仍访问旧 `/user/me/`，依赖 FastAPI 兼容层 |
| Django 风格环境变量名 | `ALLOWED_HOSTS/CORS_*/EMAIL_*/SESSION_COOKIE_SECURE` 由当前原生配置/服务读取，不是旧 settings.py 依赖；重命名会影响已有部署 |
| 旧目录排除项 | `.gitignore/.dockerignore` 的 `backend/chewy_space` 是排除旧目录，不是加载它 |
| 本地未跟踪 Django 脚本 | `backend/.temp-legacy-fixture.py:7` 至 `:14` 仍包含 DJANGO_SETTINGS_MODULE、import django、django.setup、call_command；是实际磁盘代码残留，未执行，也不进入 Git/镜像 |
| 本地旧包名产物 | `backend/dist/chewy_space-0.1.0-*.whl`、对应 tar.gz 仍在；检查包元数据和源码后确认内部已是 FastAPI 依赖，没有 Django import。这是旧名称构建产物，不是 Django 安装包 |

模块内旧临时文件不会被仅检查根目录的工具发现。本轮没有删除现有工作记录、缓存、备份或构建产物；`.venv/node_modules` 之外的工具缓存也可能保留旧下载包，它们不等于当前运行依赖。

## 文档与历史材料

### 应优先更新的当前说明

| 位置 | 问题 |
| --- | --- |
| `openspec/tech-stack.md:30`、`:46`、`:135`、`:153` | 仍把 Django、DRF、drf-spectacular、SimpleJWT、chewy-attachment、Gunicorn、Django ORM 描述为当前架构，与 project/config 冲突 |
| `openspec/specs/attachment-storage/spec.md:7,82` | 当前能力规范仍要求 chewy-attachment 与 Django 认证视图 |
| `README.md:8` | 仍称附件基于 chewy-attachment；`:364` 的致谢链接本身不等于依赖声明 |
| `docs/search-list-performance.md:15,17,23` | 复现步骤仍引用 DRF APIClient、旧 queryset before/after、已删除的 test_feed_queries.py；当前工具是 FastAPI TestClient |
| `openspec/project.md:57` | 领域说明仍有 JSONField 等旧 ORM 术语，应与 SQLAlchemy JSON/JSONB 实现对齐 |

### 应标注被取代或归档的旧设计

- `openspec/changes/desktop-reliability-and-web-auth/specs/desktop-reliability/spec.md:29` 仍有 MUST 使用 chewy-attachment 0.5.2 + django-s3 的要求。
- `deploy-built-image`、`desktop-reliability-and-web-auth`、`multi-client-readiness`、`search-list-usability`、`web-core-flow-regression` 的部分 design/proposal 仍提及 Django、DRF 或已经不存在的 `backend/chewy_space` 路径。
- `backup-recovery-management/proposal.md:23`、`mobile-launch-readiness/proposal.md:28` 也保留旧目录引用。
- 隐藏的 `.kiro/specs/desktop-floating-ball`、`mobile-home-widget`、`mobile-v1.1-enhancements`、`system-optimization-batch1` 仍描述 Django 架构。
- `.kiro/specs/system-p0-enhancements` 含旧 Django View、AttachmentViewSet、urls.py、Django imports、TestCase、DRF APIClient 的计划代码。它们是历史规划文本，不会由当前应用执行。

### 不应篡改为新框架结果的历史证据

`desktop/VALIDATION-0.2.0.md`、`desktop/UPDATES.md`、部分 OpenSpec validation/tasks、`docs/feed-benchmark-comparison.json` 和 `docs/search-list-performance.md` 的历史测量段落，记录的是当时的 Django 环境。应保留事实并标注历史适用范围；不能替换名称后冒充 FastAPI 重测结果。历史验证文件中的 manage.py 操作不应作为当前部署指南。

`backend/tests/fixtures/legacy.sql` 和 `legacy.json` 是有意保留的合成旧库、旧 token 和密码材料，`test_migration.py` 用它们验证没有安装 Django 时仍能升级。删除这些 Django 字样会削弱迁移回归覆盖。

## 后续处理顺序

1. 修复两个已复现的标签问题，统一 UID 的 HTTP、导入及数据库契约；补充边界测试。
2. 补齐旧库约束预检、新旧 schema 差异测试，以及含历史 admin log 的注销回归。索引按当前查询与测量结果决定，不按旧名字照搬。
3. 补齐 OpenAPI 的实际响应码、错误和 Cookie CSRF 要求；整理认证依赖与失效校验函数。
4. 更新当前技术栈/能力规范/复现步骤，标记历史材料；核对并清理旧静态配置、探活别名及一次性文件。
5. 若目标是运行库也完全没有 Django 表名，单独制定数据迁移：为正在使用的 token 表改名并保留撤销状态，按依赖清理旧框架元数据，之后才能移除对应运行期兼容代码。业务 `cb_*` 表无需因框架迁移改名。

完成标准应区分“无 Django 运行依赖”“无旧框架表及死代码”“仍支持旧客户端和旧密码”“历史证据保留”。仅做到关键词零命中，不能证明迁移完整。
