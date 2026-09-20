## Why

移动端已具备核心记录能力，但草稿持久化、弱网附件、账号恢复和界面信息层级尚未形成面向普通用户的完整体验。此次优化为 TestFlight 与后续 App Store 验收建立可验证的基础。

## What Changes

- 草稿自动保存、切后台落盘、明确退出选择及保存状态；录音和附件失败后可恢复重试。
- 公开操作统一说明访问范围并确认；私密记录使用“保存”。
- 自建服务收进高级入口，编辑工具分层，首页先阅读、后编辑，空页面提供直接行动入口。
- 账号修改密码及邮件找回流程、配置与安全测试。
- 设置分层、跟随系统外观、语音友好名称及支持入口。
- 更新发布验收清单，区分自动验证与必须在 iOS 真机及生产服务验证的事项。

## Capabilities

### New Capabilities
- `mobile-launch-experience`: 首次使用、草稿可靠性、公开确认、阅读及设置体验。
- `account-password-recovery`: 密码修改、邮件恢复及限流和凭证失效。

### Modified Capabilities
无。本次作为新增完整用户流程描述，保留已有接口兼容性。

## Impact

- `mobile/src/screens/{ComposeScreen,HomeScreen,LoginScreen,AccountSecurityScreen,SettingsScreen,ThemeSettingsScreen,AboutScreen}.tsx`
- `mobile/src/components/{BBTalkCard,EmptyState,AudioPlayerButton,VisibilityPickerModal}.tsx`
- `mobile/src/services/`、`mobile/src/hooks/`、`mobile/src/theme/ThemeContext.tsx`、`mobile/App.tsx`
- `backend/chewy_space/bbtalk/` 密码恢复视图、认证、迁移和测试；`backend/chewy_space/chewy_space/settings.py`
- `mobile/README.md` 与发布验收文档。邮件发送需部署环境配置；不在本次执行真实发信、部署或提交商店。
