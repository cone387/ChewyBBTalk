# 技术栈与架构设计

> 本文档面向 AI 与新成员，描述 ChewyBBTalk 的整体架构、技术选型理由与关键设计权衡。

## 1. 总体架构

```
                     ┌──────────────────────────┐
                     │   用户（多端访问）         │
                     │  iOS / Android / Web /    │
                     │  PWA / 桌面浏览器          │
                     └──────────────┬───────────┘
                                    │ HTTPS
                          ┌─────────▼─────────┐
                          │  Nginx（可选）     │
                          │  反向代理 / TLS    │
                          └─────────┬─────────┘
                                    │
              ┌─────────────────────┴─────────────────────┐
              │                                           │
     ┌────────▼────────┐                          ┌──────▼──────┐
     │ Vite Web 前端    │                          │ Expo 移动端  │
     │ React 18 + Redux │                          │ RN 0.81 + RN │
     │ Tailwind + PWA   │                          │   Web 同源    │
     └────────┬────────┘                          └──────┬──────┘
              │                                           │
              └─────────────────┬─────────────────────────┘
                                │ REST + JWT
                       ┌────────▼────────┐
                       │  Django Backend  │
                       │  DRF + JWT       │
                       │  drf-spectacular │
                       └────┬───────┬────┘
                            │       │
                  ┌─────────▼┐    ┌─▼───────────────┐
                  │ DB        │    │  附件存储         │
                  │ SQLite/   │    │  本地 / S3 兼容   │
                  │ PostgreSQL│    │  (chewy-attachment)│
                  └───────────┘    └──────────────────┘
```

## 2. 技术选型矩阵

| 层 | 技术 | 版本 | 选型理由 |
|----|------|------|----------|
| 后端语言 | Python | 3.13 | 团队熟悉、生态成熟、Django 体验好 |
| Web 框架 | Django | 5.2 | ORM 强大、admin 开箱即用、社区活跃 |
| API 框架 | DRF | 3.14+ | Django 生态首选、序列化与权限完善 |
| API 文档 | drf-spectacular | 0.27+ | OpenAPI 3.0 输出，与 DRF 无缝集成 |
| 认证 | SimpleJWT | 5.5+ | 标准 JWT、refresh + 黑名单支持 |
| 数据库 | SQLite (默认) | — | 零配置、单容器部署友好 |
|       | PostgreSQL | — | 生产推荐，DATABASE_URL 切换 |
| 附件 | chewy-attachment | git | 自研抽象，本地与 S3 一键切换 |
| Web 前端 | React | 18 | 生态最广、团队熟悉 |
|         | Vite | 5 | 启动快、HMR 优秀 |
|         | Redux Toolkit | 2.x | 状态管理标准方案 |
|         | Tailwind | 3.x | 原子化 CSS，减少样式文件 |
|         | vite-plugin-pwa | — | 离线访问与桌面安装 |
| 移动端 | Expo | SDK 54 | 一套代码三端，EAS 构建免本地工具链 |
|       | React Native | 0.81 | 与 Expo 配套版本 |
|       | React Navigation | 7 | RN 路由事实标准 |
|       | Redux Toolkit | — | 与 Web 端一致便于知识迁移 |
|       | react-native-web | 0.21 | Expo Web 渲染层 |
| 部署 | Docker | — | 单容器封装前后端，零依赖部署 |
| 包管理 | uv (后端) | — | 极快的 Python 包管理 |
|       | npm (前端) | — | 生态默认 |

## 3. 跨端策略

### 3.1 三端代码共享方案
- **mobile/** 是主推方向：Expo SDK 同时支持 iOS / Android / Expo Web
- **frontend/** 旧版 React Web 端仍在维护，但新功能优先在 mobile 落地
- 长期目标：mobile 完全替代 frontend，统一前端代码库

### 3.2 平台差异处理
- 弹窗：[`crossAlert.ts`](../mobile/src/utils/crossAlert.ts) 抽象 + Web 端 iOS 风格自定义实现
- 文件系统：Web 走 Blob/File API，Native 走 expo-file-system
- 安全存储：Web 走 localStorage（token），Native 走 expo-secure-store
- 媒体录制：Web 用 MediaRecorder，Native 用 expo-audio

## 4. 后端关键设计

### 4.1 User / Identity 分离
- **User** 表存资料（用户名、邮箱、头像、权限标志）
- **Identity** 表存认证方式（type + identifier + credential），一个 User 可绑多个
- 优势：增加 OAuth、微信、邮箱验证码等登录方式无需修改 User 表

### 4.2 BaseModel 抽象
所有业务模型继承 `BaseModel`：
- `id` 自增主键（数据库优化）
- `user` 外键（数据所属用户，无 db 约束便于跨库迁移）
- `create_time` / `update_time`（自动时间戳）
- 业务上对外用 `uid`（22 位 base64），避免主键泄露顺序信息

### 4.3 表名前缀
所有表带 `cb_` 前缀（如 `cb_users`, `cb_bbtalks`, `cb_tags`），与第三方库共享数据库时避免冲突。

### 4.4 附件存储抽象
- `storage_provider.py` 定义 `LocalProvider` 与 `S3Provider`
- `UserStorageSettings` 持久化用户级配置
- 上传 / 下载 / 删除 / 测试连接 / 迁移 通过 provider 多态实现
- 切换存储无需修改 BBTalk.attachments 中的 url（迁移时一并更新）

### 4.5 API 版本与路径
- 全部前缀 `/api/v1/bbtalk/`
- REST 风格为主：`/bbtalks/`, `/tags/`, `/comments/`
- RPC 风格用于操作类端点：`/auth/token/blacklist/`, `/storage/migration/execute/`

## 5. 移动端关键设计

### 5.1 状态管理
- **Redux Toolkit** 管理全局状态（bbtalks、tags、user、theme）
- **本地 hook 状态** 处理 UI 局部状态（输入框、loading）
- 异步 thunks 统一处理 API 调用 + 错误分发

### 5.2 离线策略
- **AsyncStorage** 保存最近一次列表数据
- **expo-sqlite** 用于复杂查询（暂未启用）
- 网络失败 → 读缓存兜底，恢复后后台刷新

### 5.3 防偷窥实现要点
- 单 hook [`usePrivacyMode.ts`](../mobile/src/hooks/usePrivacyMode.ts) 集中管理
- 三个时机检查：1秒间隔轮询、AppState change、组件 mount（loadPrivacySettings）
- 持久化 `privacy_last_active` 时间戳，覆盖前台超时、后台超时、kill 后冷启动

### 5.4 主题系统
- [`ThemeContext.tsx`](../mobile/src/theme/ThemeContext.tsx) 提供 `useTheme()` hook
- 支持 系统跟随 / 手动浅色 / 手动深色
- 颜色统一通过 `c.xxx` 引用，避免硬编码

## 6. 部署设计

### 6.1 单容器部署（推荐）
- 一个 Docker 镜像同时打包 Django 后端 + 已构建的 Web 前端
- supervisord 管理 Django (gunicorn) + Nginx 进程
- `data/` 卷挂载持久化数据库、媒体、SECRET_KEY
- 命令：`docker run -d -p 4010:4010 -v bbtalk_data:/app/data ghcr.io/cone387/chewybbtalk:latest`

### 6.2 docker-compose 部署
- 单服务 + 卷挂载
- 适合需要外接 PostgreSQL、Nginx 的场景

### 6.3 CI/CD
- GitHub Actions 构建多架构镜像（amd64 / arm64）
- 推送到 ghcr.io
- 移动端通过 EAS Build + EAS Submit

## 7. 安全设计

| 维度 | 措施 |
|------|------|
| 密码 | Django 默认 PBKDF2，hash 存于 Identity.credential |
| Token | JWT + refresh + 黑名单；移动端存 SecureStore，Web 存 localStorage |
| HTTPS | 推荐前置 Nginx + Let's Encrypt |
| CORS | 通过 ALLOWED_HOSTS + django-cors-headers 配置 |
| SQL 注入 | Django ORM 全程参数化 |
| XSS | 前端 react-markdown + rehype-sanitize 清洗 |
| 附件 URL | 私有 BBTalk 的附件需认证访问 |
| 密钥 | SECRET_KEY 自动生成持久化，S3 secret 加密存储 |

## 8. 性能权衡

- **SQLite 默认**：单用户场景足够，避免运维负担
- **附件直链**：S3 模式下前端直访 S3，不经后端
- **PWA 缓存**：Web 端静态资源 service worker 缓存
- **移动端图片**：使用 `expo-image` 自动缓存与渐进式加载
- **列表分页**：DRF 分页 + 移动端触底加载

## 9. 已知限制 & 未来方向

- [ ] 多用户协作（评论 / @ / 关注），目前评论仅作者可见
- [ ] 全文搜索：当前依赖客户端过滤，可引入 Postgres FTS 或 Meilisearch
- [ ] 实时同步：多端登录时的实时推送（WebSocket）
- [ ] mobile 替换 frontend：完成端到端迁移后下线旧 Web 前端
- [ ] OAuth 登录：Identity 表已预留字段，待接入

## 10. 引用规格

详细行为规格见 [specs/](./specs/)：

- [bbtalk-content](./specs/bbtalk-content/spec.md)
- [tag-management](./specs/tag-management/spec.md)
- [comment](./specs/comment/spec.md)
- [auth](./specs/auth/spec.md)
- [attachment-storage](./specs/attachment-storage/spec.md)
- [data-portability](./specs/data-portability/spec.md)
- [privacy-lock](./specs/privacy-lock/spec.md)
- [cross-platform-alert](./specs/cross-platform-alert/spec.md)
- [mobile-feed](./specs/mobile-feed/spec.md)
