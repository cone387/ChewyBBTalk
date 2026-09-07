# ChewyBBTalk 迭代路线图

更新：2026-09-07。以下是按优先级维护的计划，不是交付日期承诺。

## 产品边界

- `frontend/`：生产 Web，保留响应式浏览器访问；移除 PWA 安装、离线 worker 和专属维护工具。
- `mobile/`：iOS/Android 原生体验；Expo Web 仅供开发验证。
- `desktop/`：悬浮入口和快捷记录。
- 三端共用后端 API，按需要复用 service/types，各自维护 UI。

## 已有能力

- 记录、标签、附件、评论、置顶、可见性；关键词、标签、日期与附件筛选。
- 原生端主题、语音、草稿、防窥与离线读取缓存。
- 桌面悬浮球、编辑、登录、设置、托盘和快捷键。
- JSON/ZIP 导入导出、存储迁移、`backup_data` 命令；宿主机 systemd timer / cron 脚本和部署说明。
- 四部分 CI；后端、移动端、桌面测试和 Web 检查。

## 第一轮：可靠性与 Web 简化

执行记录：[reliability-and-web-simplification](openspec/changes/reliability-and-web-simplification/tasks.md)。完成状态和验证以该任务文件为准。

- 移除 PWA，并提供旧 Service Worker 自注销迁移。
- 原生缓存按服务器、账号隔离；切换会话清内存、拒绝旧请求回写；草稿按会话归属保存。
- 桌面发布版本入口替换模拟更新检查。
- Web Modal 焦点/滚动、Select 键盘行为，以及迁移和会话隔离回归测试。

## 第二轮：Web 关键流程回归

执行记录：[web-core-flow-regression](openspec/changes/web-core-flow-regression/tasks.md)。

- 临时数据库 + 真实 Django API，桌面和 375px 小屏 Chromium 回归。
- 覆盖错误登录、发布、编辑、搜索、删除撤销、刷新持久性和连续删除。
- 修复小屏更多菜单、撤销提示遮挡、发布按钮换行，以及连续删除/慢请求的撤销竞态。
- CI 自动运行并保留报告，命令见 [浏览器回归说明](frontend/e2e/README.md)。

## 下一轮 P1：体验与数据保障

部署稳定性执行记录：[deploy-built-image](openspec/changes/deploy-built-image/tasks.md)。自动部署使用 CI 镜像 digest，增加拉取预检、串行锁、启动检查和失败现场保留；操作见 [镜像部署说明](docs/image-deployment.md)。

第四轮执行记录：[image-retry-content-layout](openspec/changes/image-retry-content-layout/tasks.md)。图片加载失败/损坏缓存手动恢复，及长链接、代码块、宽表格的小屏布局补强。

第三轮执行记录：[attachment-recovery-ui-polish](openspec/changes/attachment-recovery-ui-polish/tasks.md)。已完成附件独立重试、发布/更新/防窥编辑失败保留以及 Web 小屏与横屏走查；验收边界见变更记录。阅读与编辑入口调整按用户要求暂缓。

Web 草稿执行记录：[web-persistent-drafts](openspec/changes/web-persistent-drafts/tasks.md)。使用 IndexedDB 保存正文、标签、可见性、位置和附件，刷新/导航恢复，按服务器、账号和记录隔离；提供清除、失败提示和并发保护。新建和编辑同时打开时，提交目标分别绑定。

1. 真机走查暂缓，由用户后续测试反馈；浏览器模拟与自动回归继续进行。
2. 阅读/详情与编辑入口调整暂缓；附件状态和发布失败反馈已纳入第三轮。
3. 扩展已有 Web E2E 到附件、权限、网络失败和 WebKit/Firefox；扩大原生关键操作测试。
4. 备份列表、状态与下载入口，完整恢复演练及失败反馈。
5. 对齐 README、OpenSpec 和历史任务实际状态，保留已暂停事项的原因。

验收：常用操作跨端一致；从备份可恢复正文、标签、评论和附件；关键路径能自动回归。

## P2：记录与查找效率

- 搜索结果高亮与性能基线，按实际数据规模引入全文索引和中文分词。
- 离线草稿补发、幂等请求、失败重试与冲突处理。
- 多端自动刷新，先明确同步契约，再决定轮询或 WebSocket。
- 附件缩略图、大列表和分页性能优化，以测量结果决定实施。
- 结构化日志、错误上报和基础运行监控。

## P3：按使用反馈扩展

- AI 标签/回顾、OCR、语音转写后端 fallback。
- 主屏 Widget：JS 数据管线已有，原生实现与构建验收仍暂停，单独立项。
- 2FA、邀请协作、国际化、第三方导入。
- 应用商店发布、桌面签名分发与自动升级链路按平台分别验收。

## 文档校正事项

- 历史 `expo-web-alert-fix` 的代码已存在，任务表需要对照验收后归档。
- `mobile-ui-card-redesign` 的勾选与当前标签布局存在差异，需要先明确最终设计再修订规格。
- CI、基础搜索、宿主机备份脚本已存在，后续工作是补强和用户入口，不应重复立项。

新迭代按 OpenSpec 建立提案、规格、设计和任务，实施后记录验证结果。
