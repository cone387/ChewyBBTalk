## 1. 账号数据与轮换

- [x] 1.1 先写 API 失败测试，覆盖匿名拒绝、账号隔离、输入校验、revision 冲突、完整轮换、池变更；再实现模型、迁移、schema、服务与路由，运行对应 pytest。
- [x] 1.2 增加备份恢复测试后实现可选 welcome 导出/导入，验证不覆盖目标配置与旧备份兼容。

## 2. Web 欢迎页与管理

- [x] 2.1 先写生命周期与管理交互测试，再实现 welcomeApi、WelcomeGate、WelcomePage、WelcomeSettingsPage；接入认证、防窥、账号切换、路由、设置与记录菜单。
- [x] 2.2 完成响应式样式、键盘操作、保存反馈、冲突提示、预览与无障碍；运行 Web 单元测试和构建。

## 3. 验收与交付

- [x] 3.1 浏览器验证桌面与窄屏的新增、编辑、删除、开关、轮换、防窥、刷新及故障放行；检查截图。
- [x] 3.2 补充使用和迁移文档，运行后端/Web 全套单元测试、OpenSpec 验证、git diff --check 与根目录检查，完成独立审查并修复实际问题。

## 实施约束与复核重点

按 design.md 和 specs/personal-welcome/spec.md 实施，当前分支 feat/personal-welcome-page，不改用户已有素材说明。本轮使用当前会话执行并在结尾独立审查；不自动部署或提交。

重点覆盖：StrictMode 双调用、不同行为的深链接、账号切换迟到响应、长文本窄屏、关闭/空池/网络故障不阻塞。后端字段与 URL 以 design.md 为准；前端 API 返回 WelcomeConfig {enabled, quotes, revision} 与 {quote: WelcomeQuote | null}。

## 验证记录（2026-10-19）

- `uv run pytest -q`：275 passed、11 skipped、10 subtests passed；未配置的外部数据库测试跳过，不能视为 MySQL/PostgreSQL 实测通过。
- `npm test`：55 个文件、636 项通过；`npm run build` 成功。
- `npx playwright test e2e/welcome.spec.ts`：桌面与 375px 窄屏 4 项通过；截图已检查。一次浏览器退出阶段的 Target closed 在重跑中未出现。
- 新增文件 Ruff、ESLint、OpenSpec strict validation、根目录检查与 diff whitespace 检查通过。
- 独立审查发现并修复 SQLite 读快照升级写锁错误及 MySQL 旧快照风险：写路由结束初始只读鉴权事务，先锁账号再重验身份，服务以 FOR UPDATE 读取配置。Barrier 强制 4 个并发鉴权快照测试修复前 3 个 503，修复后全成功且文案不重复。
- 历史迁移恢复测试改为明确构造 0004 schema，再升级到动态 head，避免将新表误当成旧中断状态。
- 本地隔离预览 http://127.0.0.1:14176/login 已通过真实登录与欢迎页检查；业务数据库未迁移，未部署线上。
