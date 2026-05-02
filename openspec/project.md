# ChewyBBTalk — AI 协作指南

> 本文档面向所有进入本仓库工作的 AI Agent。阅读本文后，你将了解项目的整体架构、核心模块、约定和工作流。

## 1. 项目一句话介绍
ChewyBBTalk 是一个**自托管的个人微博/碎碎念系统**，主打 Markdown 内容、附件管理、隐私保护，全栈 TypeScript/Python，支持 Docker 一键部署，提供 Web、PWA、iOS、Android 多端访问。

## 2. 仓库结构

```
ChewyBBTalk/
├── backend/                 # Django 后端（DRF + JWT）
│   └── chewy_space/
│       ├── bbtalk/          # 核心业务应用
│       │   ├── models.py            # User / Identity / BBTalk / Tag / Comment / Attachment / UserStorageSettings
│       │   ├── views.py             # ViewSets + 函数视图
│       │   ├── serializers.py       # DRF 序列化器
│       │   ├── authentication.py    # JWT + Session 认证
│       │   ├── data_export.py       # 数据导出（JSON / ZIP）
│       │   ├── data_import.py       # 数据导入
│       │   ├── storage.py           # 存储抽象层
│       │   ├── storage_provider.py  # 本地 / S3 后端
│       │   ├── storage_migration.py # 跨后端附件迁移
│       │   ├── privacy_views.py     # 防偷窥相关
│       │   └── urls.py              # /api/v1/bbtalk/...
│       └── chewy_space/     # Django 项目配置
├── frontend/                # 旧版 Web 前端（Vite + React 18 + Tailwind）
│   └── src/{pages, components, hooks, services, store, types}
├── mobile/                  # 主推：Expo 跨端应用（iOS / Android / Web）
│   └── src/{screens, components, hooks, services, store, theme, utils}
├── openspec/                # 规范驱动开发（本目录）
│   ├── config.yaml          # 全局上下文 + 规则
│   ├── project.md           # 本文件
│   ├── specs/               # 已落地的能力规格
│   └── changes/             # 进行中的变更提案 + 已归档
├── data/                    # 持久化数据卷（Docker 挂载）
├── docker-compose.yml       # 多容器编排
├── Dockerfile               # 单容器（前后端打包到一起）
└── deploy.sh                # 部署脚本
```

## 3. 多端架构

| 端 | 技术栈 | 状态 | 备注 |
|----|--------|------|------|
| Web | React 18 + Vite + Tailwind + PWA | 维护中 | 老前端，仍在线上跑 |
| iOS | Expo + RN 0.81 | 主推 | EAS 构建，Apple ID 登录 |
| Android | Expo + RN 0.81 | 主推 | EAS 构建 |
| Expo Web | react-native-web | 主推 | 与 iOS/Android 同代码库 |

> 长期方向：mobile/ 子项目逐步替代 frontend/。新功能优先在 mobile 落地。

## 4. 核心领域模型（必须理解）

### BBTalk（碎碎念）— 主实体
- 一条用户发布的微博式内容
- 字段：`uid`, `content`(Markdown), `visibility`(public/private), `tags`(M2M), `attachments`(JSONField), `context`(JSON, 含位置/天气/设备), `is_pinned`
- 表名 `cb_bbtalks`，按 `(-is_pinned, -update_time)` 排序

### Tag（标签）
- 用户级，唯一性按 `(user, name)`
- 颜色随机生成，可手动编辑，支持拖拽排序（`sort_order`）

### Comment（评论）
- 隶属于一条 BBTalk，仅作者可删除
- 表名 `cb_comments`

### User / Identity（认证模型）
- **User** 持有用户资料（用户名/邮箱/头像/简介/权限标志）
- **Identity** 表示一种登录方式（密码/OAuth/微信/邮箱验证码），一个 User 可绑多个 Identity
- 这是认证扩展的关键：增加新登录方式只新增 Identity 类型，不动 User

### Attachment（附件）
- 基于 `chewy-attachment` 包（独立维护）
- 支持本地存储 + S3 兼容（MinIO、阿里云 OSS、AWS S3）
- 通过 `UserStorageSettings` 在运行时切换，附件元信息存于 BBTalk.attachments JSONField

### UserStorageSettings（存储配置）
- 用户级 S3 配置，可同时存在多个但同时只激活一个
- 提供测试连接、迁移、增删改激活等管理能力

## 5. API 约定

- 基础路径：`/api/v1/bbtalk/`
- 认证：JWT（推荐）`Authorization: Bearer <token>` / Session（兼容）
- Token 端点：
  - `POST /auth/token/` 获取 token
  - `POST /auth/token/refresh/` 刷新
  - `POST /auth/token/blacklist/` 登出（加入黑名单）
- 注册：`POST /auth/register/`（直接返回 JWT）
- OpenAPI 文档：`/api/schema/` + `/api/docs/`（drf-spectacular）

## 6. 跨平台开发约定（重要）

### 6.1 弹窗
- **永远不要**直接使用 `Alert.alert` / `window.alert` / `window.confirm`
- 统一使用 [mobile/src/utils/crossAlert.ts](../mobile/src/utils/crossAlert.ts) 提供的 `xAlert` / `xConfirm` / `xActionSheet`
- Web 端会渲染 iOS 风格自定义弹窗（[mobile/src/utils/webAlert.ts](../mobile/src/utils/webAlert.ts)），保证视觉一致

### 6.2 防偷窥（Privacy Lock）
- 关键 hook：[mobile/src/hooks/usePrivacyMode.ts](../mobile/src/hooks/usePrivacyMode.ts)
- 持久化 key：`privacy_locked` / `privacy_enabled` / `privacy_timeout_minutes` / `privacy_last_active`
- 锁定触发：超时未操作 / App 切后台超时 / App 冷启动距上次活跃超时
- 解锁方式：生物识别（Face ID / Touch ID）/ 用户密码

### 6.3 离线缓存
- IndexedDB（Web）/ AsyncStorage + expo-sqlite（Mobile）
- 网络失败时用缓存数据兜底，恢复后自动同步

## 7. 编码风格

- **Commit**: 中文，`type(scope): 描述`，常用 type: `feat / fix / refactor / chore / docs / style / test`
- **后端**: snake_case，`BaseModel` 提供 user/create_time/update_time，业务主键用 22 位 base64 `uid`
- **前端 / 移动端**: TypeScript strict，组件 PascalCase，函数 camelCase，文件名同主导出
- **错误处理**: 后端用 DRF 异常体系；前端 / 移动端用 [mobile/src/utils/errorHandler.ts](../mobile/src/utils/errorHandler.ts)（含分类 + 复制按钮）

## 8. 常用命令

```bash
# 后端开发（自动 migrate）
cd backend && uv run dev

# 后端迁移
uv run makemigrations
uv run migrate

# Web 前端
cd frontend && npm install && npm run dev

# 移动端
cd mobile && npm install && npm start
# 进入交互后按: i (iOS) / a (Android) / w (Web)

# Docker 单容器部署
docker run -d --name chewybbtalk -p 4010:4010 \
  -v bbtalk_data:/app/data \
  ghcr.io/cone387/chewybbtalk:latest
```

## 9. OpenSpec 工作流

本项目使用 OpenSpec 进行规范驱动开发。**所有功能/能力变更**应遵循以下流程：

1. **propose** — 在 `openspec/changes/<change-name>/` 下创建提案
   - `proposal.md`（Why / What Changes / Capabilities / Impact）
   - `design.md`（方案选型 + 未采纳方案）
   - `tasks.md`（拆分任务清单）
   - `specs/<capability>/spec.md`（ADDED/MODIFIED/REMOVED Requirements + Scenarios）
2. **apply** — 按 tasks.md 实施，逐项勾选
3. **archive** — 完成后将 `changes/<name>/specs/` 内容合并到 `openspec/specs/` 顶层规格库，change 目录移至 `changes/archive/`

**所有工件必须使用简体中文**（见 [config.yaml](./config.yaml) 的 rules）。

## 10. 现有能力规格（specs/）

| 能力 | 路径 | 描述 |
|------|------|------|
| `bbtalk-content` | [specs/bbtalk-content/spec.md](./specs/bbtalk-content/spec.md) | 碎碎念发布、编辑、删除、可见性、置顶、附件、上下文 |
| `tag-management` | [specs/tag-management/spec.md](./specs/tag-management/spec.md) | 标签 CRUD、颜色、排序、与 BBTalk 关联、删除策略 |
| `comment` | [specs/comment/spec.md](./specs/comment/spec.md) | 评论增删查、计数、内联展开 |
| `auth` | [specs/auth/spec.md](./specs/auth/spec.md) | 注册、登录、JWT、登出、删除账户 |
| `attachment-storage` | [specs/attachment-storage/spec.md](./specs/attachment-storage/spec.md) | 本地 / S3 切换、迁移、用户级配置 |
| `data-portability` | [specs/data-portability/spec.md](./specs/data-portability/spec.md) | 数据导入导出（JSON / ZIP） |
| `privacy-lock` | [specs/privacy-lock/spec.md](./specs/privacy-lock/spec.md) | 防偷窥锁屏、生物识别、AppState 恢复 |
| `cross-platform-alert` | [specs/cross-platform-alert/spec.md](./specs/cross-platform-alert/spec.md) | 跨端弹窗工具，Web 端 iOS 风格自定义 UI |
| `mobile-feed` | [specs/mobile-feed/spec.md](./specs/mobile-feed/spec.md) | 移动端首页信息流卡片设计与交互 |

更多详细信息见 [specs/](./specs/) 目录。
