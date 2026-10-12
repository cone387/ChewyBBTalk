# 技术栈与架构设计

本文面向 AI 与新成员，描述当前运行架构。具体版本以 `backend/uv.lock` 和各客户端锁文件为准；运行和升级步骤见 [后端说明](../backend/README.md)，HTTP 规范见 [接口契约](../docs/fastapi-contract.md)。

## 1. 总体架构

```text
Web：React / Vite       iOS、Android：Expo / React Native       桌面：Electron
         └───────────────────────┬───────────────────────────────┘
                            HTTPS / JSON / JWT
                                 │
                          Nginx 反向代理
                                 │
                       Uvicorn → FastAPI
                                 │
              Pydantic 请求响应模型、依赖注入、OpenAPI
                                 │
               services/、storage/、backups/ 业务模块
                       │                     │
                 SQLAlchemy 2          本地文件 / boto3 S3
                       │
              SQLite / PostgreSQL / MySQL
```

SQLAdmin 提供后台管理，Alembic 管理数据库版本，`python -m cli` 提供迁移、账号、备份和初始化命令。后端源码直接位于 `backend/`，没有项目名包裹或 `src/` 外层。

## 2. 技术选型

| 层 | 当前组件 | 用途 |
| --- | --- | --- |
| 后端语言 | Python 3.13+ | HTTP、业务、存储及管理命令 |
| HTTP / ASGI | FastAPI + Uvicorn | 声明式路由、依赖与 HTTP 服务 |
| 数据模型与契约 | Pydantic | 请求、查询、表单和响应校验；生成 OpenAPI |
| 数据库 | SQLAlchemy 2 + Alembic | ORM、事务、连接与可审计的版本升级 |
| 后台 | SQLAdmin | 账号资料/权限管理及业务数据只读查询 |
| 认证 | PyJWT + 原生认证服务 | JWT 轮换、撤销、密码与 Cookie 会话校验 |
| 附件 | `storage/` + boto3 | 本地及 S3 兼容存储、鉴权下载、Range、迁移 |
| Web | React 18 + Vite 5 + Redux Toolkit + Tailwind CSS | 生产 Web 主线 |
| 原生移动端 | Expo SDK 54 + React Native 0.81 + React Navigation | iOS / Android |
| 桌面 | Electron + React | 系统托盘、悬浮球、独立编辑器与自动更新 |
| 部署 | Docker、Nginx、Supervisor | 单容器或 Compose 前后端分离 |
| 包管理 | uv / npm | 锁定后端和客户端依赖 |

## 3. 跨端策略

- `frontend/` 负责生产 Web，Docker/Nginx 使用该前端；已移除 PWA，`sw.js` 仅用于历史客户端退场。
- `mobile/` 负责 iOS / Android；Expo Web 用于开发验证，不纳入生产部署。
- `desktop/` 通过主进程保存凭据、上传附件及提交内容，浏览器授权使用一次性授权码和 PKCE。
- 三端共享 HTTP 契约；平台界面和持久化实现分别维护。Web 草稿使用 IndexedDB，移动端使用本地持久存储，桌面使用主进程存储。
- `openspec/changes/`、`.kiro/specs/` 中有明确标记的历史内容只说明当时的背景和验证结果，不能作为当前框架和部署要求。

## 4. 后端模块与数据

`api/` 负责 HTTP 路由、依赖、错误和 OpenAPI；路由与 CLI 调用 `services/`、`storage/`、`backups/`。业务模块不导入路由或应用入口，架构回归检查这一边界。`application.py` 负责组件装配，`main.py` 导出 ASGI 应用。

SQLAlchemy 声明式模型位于 `models/`，保留业务 `cb_*` 表与业务 ID。`User` 保存资料和权限，`Identity` 保存认证类型、标识与凭据；这提供扩展位置，不代表所有 OAuth/微信等登录方式已经实现。BBTalk 的附件及上下文使用 JSON 列，标签通过关联表连接。对外业务 UID 长度为 1–64，默认生成 22 字符 UID；数据库结构变更新增 Alembic revision，不修改冻结的初始 schema。

存储入口位于 `storage/service.py`，`storage/backends.py` 的 `Store` 处理本地与 S3；`StorageConfig` 保存用户配置。私有附件必须通过当前账号权限检查，本地文件经 API 返回，S3 文件通过限时签名重定向读取。不能将私有媒体目录直接公开。

原生迁移的令牌表、历史元数据归档及新旧结构校验见 [已有实例升级](../backend/README.md#已有实例升级)。旧框架 fixture 和冻结迁移仅服务于数据升级回归，应用运行不加载旧框架。

## 5. HTTP 契约与兼容边界

- 规范集合入口为 `/api/v1/bbtalk`、`/api/v1/bbtalk/tags`、`/api/v1/attachments/files`，不带尾斜杠。
- `Query`、`Path`、`Header`、`Form` 和 Pydantic 模型描述参数；参数错误使用 FastAPI 422 `detail` 数组。三端展示字段位置和提示，不显示原始敏感输入。
- 标签使用数组载荷及重复查询参数；日期、排序和分页参数见接口契约。标签列表返回完整数组，以支持现有三端全量排序。
- JWT Bearer 为主要认证方式；Cookie 会话写请求另需匹配 `X-CSRFToken`。会话与 CSRF 是原生安全实现。
- `Idempotency-Key` 支持持久提交与重放；`If-Match` 防止覆盖其他客户端的更新。
- 已发布的尾斜杠/JSON 后缀、旧过滤参数、旧 `post_tags` 载荷与历史附件 URL 保留在兼容边界，避免破坏外部客户端和离线草稿。PBKDF2/scrypt 密码及既有 JWT 格式同样保留兼容；这不引入旧框架运行依赖。
- `/api/schema/`、`/api/schema/swagger-ui/`、`/api/schema/redoc/` 提供 OpenAPI 与文档，`/healthz` 提供存活检查。

## 6. 配置与部署

前后端部署配置统一维护根 `.env`，示例只维护根 `.env.example`；进程环境优先。后端公开配置使用明确允许列表，密钥不进入浏览器或前端构建参数。

单容器镜像包含原生后端与已构建 Web，由 Supervisor 管理 Uvicorn 和 Nginx。Compose 分别运行后端与前端/Nginx；worker 数量使用 `WEB_CONCURRENCY`。启动前执行 `python -m cli migrate` 和 `python -m cli init`，不需要静态文件收集命令。

本地默认数据在 `backend/var/`，容器通过 `/app/data` 卷持久化；数据库、附件、配置密钥和备份应一起规划。旧实例升级必须先停止写入、备份完整数据库与媒体，在副本验证迁移后再替换运行程序。生产应显式配置绝对路径；完整步骤见后端说明和 [统一配置](../docs/configuration.md)。

## 7. 安全与验收边界

密码使用原生 PBKDF2 实现并兼容既有密码编码；PyJWT 校验令牌，刷新状态持久化到数据库。S3 密钥通过稳定的 `SECRET_KEY` 派生加密。主机和 CORS 检查由当前 ASGI 中间件处理，SQLAlchemy 查询采用参数绑定，Markdown 渲染进行安全清理。

后端 pytest 覆盖业务、HTTP 契约、迁移、权限和并发；Playwright 使用隔离的 FastAPI 测试服务器；三端运行各自单元测试及类型检查。SQLite 本地通过不等于 PostgreSQL/MySQL 已实测，验收必须列出实际运行环境。性能测量方式和历史数据见 [列表性能说明](../docs/search-list-performance.md)。

当前仍需单独评估全文搜索、实时同步、多用户协作等扩展，不把架构预留当作已交付能力。领域行为要求见 [能力规格](./specs/)。
