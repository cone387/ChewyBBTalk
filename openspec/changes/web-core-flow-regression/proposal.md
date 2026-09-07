## Why

Web 已有组件测试，但登录、记录持久化、搜索和删除撤销尚未通过真实浏览器与后端一起回归。需要建立可重复的隔离验收环境，并修复流程中发现的问题。

## What Changes

- 使用 Playwright 与临时 Django SQLite 数据库验证桌面和小屏 Web 关键流程。
- 覆盖登录错误反馈、发布、编辑、搜索、删除撤销与最终删除的刷新持久性。
- 修复验证中发现的流程和交互问题，将浏览器回归加入 CI。

## Capabilities

### New Capabilities
- `web-flow-validation`: 真实后端的隔离 Web 流程回归与发布门禁。

### Modified Capabilities
无。

## Impact

- `frontend/playwright.config.ts`、`frontend/e2e/`、`frontend/package.json`。
- `backend/e2e_server.py`：仅供测试，数据库和媒体目录位于系统临时目录。
- `frontend/src/pages/BBTalkPage.tsx`、`frontend/src/components/UndoToast.tsx` 等实际发现问题的流程组件。
- `.github/workflows/ci.yml`、`.gitignore`、`README.md`、`ROADMAP.md`。
