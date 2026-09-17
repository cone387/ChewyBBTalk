## Why

已有草稿和失败保留，但请求已提交、响应丢失时仍可能重复发布；三端返回前台后的数据更新和编辑冲突缺少统一契约。反馈组件、浏览器兼容性和首次部署默认配置也需要补齐，才能支撑持续使用和扩大试用。

## What Changes

- 三端发布使用持久化提交标识，服务端去重与结果核对，保护响应丢失、刷新和会话切换后的重试。
- Web/原生返回前台刷新记录，保持筛选和未提交编辑；编辑携带版本，冲突明确提示；桌面快捷记录同步认证与提交状态。
- 统一 Web 确认、错误和重试反馈，补 Chromium、Firefox、WebKit 关键流程回归。
- 首次部署移除固定默认管理员密码，增加注册开关、认证限流和有权限边界的服务/存储/备份状态入口。
- 更新路线图和操作文档，分轮验证、提交推送，跟进 CI 与部署；继续暂缓真机和阅读编辑入口重构，不恢复 PWA。

## Capabilities

### New Capabilities
- `reliable-multi-client-submission`: 提交幂等、结果核对、前台刷新与编辑冲突保护。
- `web-feedback-compatibility`: 统一 Web 操作反馈及跨浏览器关键路径验证。
- `deployment-readiness`: 安全初始化、注册与认证流量控制、运行状态入口。

### Modified Capabilities

无；保留现有记录 API 与已安装客户端兼容，新增保护契约与可配置部署策略。

## Impact

backend/chewy_space/bbtalk/models.py、migrations/、views.py、serializers.py、management/commands/init_system.py、chewy_space/settings.py；frontend/src/services/api/、services/drafts.ts、hooks/、pages/BBTalkPage.tsx、components/BBTalkEditor.tsx、设置与登录页；mobile/src/services/api/、screens/HomeScreen.tsx、screens/ComposeScreen.tsx、草稿存储；desktop/src/main/ 和 renderer/compose/；frontend/playwright.config.ts、e2e/、各端测试；README.md、ROADMAP.md、.env.example 与运维文档。
