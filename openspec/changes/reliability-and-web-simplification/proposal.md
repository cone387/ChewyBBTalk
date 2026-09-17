## Why

三端核心功能已经可用，但移动端会话缓存隔离、Web 旧 Service Worker 退场和桌面更新状态仍影响可靠性。用户决定停止 PWA 支持，Web 保留普通浏览器访问与响应式布局。

## What Changes

- **BREAKING** 移除 PWA 注册、manifest、安装元信息、构建依赖及专属工具；提供旧 Service Worker 自注销迁移。
- 移动端缓存按服务器和账号隔离，会话切换清空内存数据并拒绝旧请求回写。
- 桌面更新入口改为真实可用的发布页入口，不再伪报最新版本。
- 完善 Web Modal/Select 键盘体验，增加有针对性的回归检查。
- 更新维护文档与路线图，区分已完成能力和后续迭代。

## Capabilities

### New Capabilities
- `reliable-client-lifecycle`: Web PWA 退场、移动端会话隔离、真实更新入口与公共控件交互契约。

### Modified Capabilities
无。

## Impact

- Web：`frontend/vite.config.ts`、`frontend/package.json`、`frontend/src/main.tsx`、`frontend/index.html`、`frontend/public/sw.js`、`frontend/src/components/ui/Modal.tsx`、`frontend/src/components/ui/Select.tsx`。
- 移动端：`mobile/src/services/auth.ts`、`mobile/src/config.ts`、`mobile/src/services/offlineCacheService.ts`、`mobile/src/hooks/useOfflineCache.ts`、`mobile/src/store/index.ts`、相关测试。
- 桌面：`desktop/src/renderer/settings/SettingsWindow.tsx`。
- 部署和文档：`nginx.conf`、`frontend/nginx.conf`、`README.md`、`ROADMAP.md`、`openspec/config.yaml`、CI。
- 不改变后端 API，不改变原生端产品定位。
