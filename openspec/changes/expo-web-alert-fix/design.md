## Context

移动端使用 React Native 的 `Alert.alert()` 在 iOS/Android 上显示原生弹窗。但 Expo Web 对 `Alert.alert` 的回调支持不完整，点击按钮后 onPress 回调经常不触发。当前代码有 50+ 处 `Alert.alert` 调用，需要一个统一的跨平台封装来处理这个差异。

**当前状态**：
- `AccountSecurityScreen` 已有 `Platform.OS === 'web'` 分支 workaround
- `useBBTalkActions` 中 `showMenu` 在 iOS 使用 `ActionSheetIOS`，其他平台用 `Alert.alert`
- 其余文件直接使用 `Alert.alert`

## Goals / Non-Goals

**Goals:**
- 创建统一的跨平台 alert 工具函数，一次解决所有 Web 端弹窗问题
- API 设计尽量简单，降低迁移成本（参数结构尽量接近原生 Alert.alert）
- 覆盖三种使用模式：通知（单按钮）、确认（双按钮）、菜单（多选项）
- 替换所有现有的 `Alert.alert` 调用

**Non-Goals:**
- 不引入第三方 UI 弹窗库（保持轻量）
- 不创建自定义 Modal 弹窗组件（Web 端用原生浏览器弹窗即可）
- 不处理 Alert.prompt（RN 本身只有 iOS 支持）

## Decisions

### 1. 工具函数 API 设计
**选择**: 提供三个函数 `xAlert(title, message)`, `xConfirm(title, message, onConfirm, onCancel?)`, `xActionSheet(title, options)` 
**理由**: 比模仿 `Alert.alert` 的复杂按钮数组更简洁，覆盖实际使用的三种模式。开发者一眼就能知道用哪个函数
**备选**: 封装一个与 `Alert.alert` 签名完全一致的 drop-in 替换 → 迁移更简单但 Web 端需要解析复杂的按钮数组来映射到 confirm/prompt

### 2. Web 端实现方式
**选择**: 使用浏览器原生 `window.alert` / `window.confirm` / `window.prompt`
**理由**: 零依赖，行为可靠。虽然 UI 不如自定义 Modal 美观，但功能完全正确。可在未来迭代中替换为自定义 Modal

### 3. ActionSheet 处理
**选择**: `showMenu` 在 iOS 保持使用 `ActionSheetIOS`，Android/Web 统一使用新的 `xActionSheet`
**理由**: iOS 的 ActionSheet 体验最佳，不需要替换

## Risks / Trade-offs

- **[Web 端 UX 较粗糙]** → 浏览器原生弹窗样式固定，无法定制。未来可迭代为自定义 Modal 组件
- **[迁移工作量大]** → 50+ 处调用需要逐一替换，但都是机械性替换，风险低
- **[window.prompt 菜单体验差]** → Web 端多选项菜单用 prompt 输入数字不够直观。但 Expo Web 主要用于开发调试，可接受
