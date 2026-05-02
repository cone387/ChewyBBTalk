## Why

Expo Web 环境下 `Alert.alert()` 的回调按钮不可靠——点击后无反应或行为异常。当前项目有 50+ 处 `Alert.alert` 调用散布在 15+ 个文件中，导致整个 Web 端的确认弹窗、错误提示、操作菜单全部失效。`AccountSecurityScreen` 中已有临时的 `Platform.OS === 'web'` 分支 workaround，但不可复制到每个调用点。需要一个统一的跨平台 alert 工具函数。

## What Changes

- **新增跨平台 alert 工具函数**：创建 `utils/crossAlert.ts`，封装 `alert()`（单按钮通知）和 `confirm()`（确认/取消双按钮）以及 `prompt()`（多选项菜单），在 native 端调用 `Alert.alert` / `ActionSheetIOS`，在 web 端使用 `window.alert` / `window.confirm` / `window.prompt`
- **全局替换**：将所有文件中的 `Alert.alert(...)` 调用替换为统一的跨平台工具函数
- **移除已有 workaround**：清理 `AccountSecurityScreen` 中的 `Platform.OS === 'web'` 分支逻辑

## Capabilities

### New Capabilities
- `cross-platform-alert`: 跨平台弹窗工具函数，统一处理 native 和 web 端的 alert / confirm / action sheet 差异

### Modified Capabilities

## Impact

- `mobile/src/utils/crossAlert.ts` — 新增文件
- `mobile/src/hooks/useBBTalkActions.ts` — 替换 Alert.alert 和 ActionSheetIOS
- `mobile/src/screens/HomeScreen.tsx` — 替换 showError 中的 Alert.alert
- `mobile/src/screens/ComposeScreen.tsx` — 多处 Alert.alert 替换
- `mobile/src/screens/SettingsScreen.tsx` — 退出登录确认
- `mobile/src/screens/LoginScreen.tsx` — 登录/注册错误提示
- `mobile/src/screens/AccountSecurityScreen.tsx` — 删除账号确认（移除现有 workaround）
- `mobile/src/screens/StorageSettingsScreen.tsx` — 多处操作确认
- `mobile/src/screens/TagManagementScreen.tsx` — 删除标签确认
- `mobile/src/screens/CacheManagementScreen.tsx` — 清理缓存确认
- `mobile/src/screens/ProfileEditScreen.tsx` — 保存/错误提示
- `mobile/src/screens/AboutScreen.tsx` — 版本检查提示
- `mobile/src/components/CommentInputModal.tsx` — 发送失败提示
- `mobile/src/components/BBTalkCard.tsx` — 文件打开失败提示
- `mobile/src/components/InlineComments.tsx` — 删除评论确认
- `mobile/src/components/VoiceRecordingOverlay.tsx` — 录音权限/失败提示
- `mobile/src/services/shareService.ts` — 分享/复制提示
- `mobile/src/utils/versionChecker.ts` — 版本更新提示
- 无 API 变更，纯前端工具层改动
