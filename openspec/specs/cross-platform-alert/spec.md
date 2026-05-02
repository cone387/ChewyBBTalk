# 跨平台弹窗（cross-platform-alert）

> 描述跨 iOS / Android / Web 端统一的 alert / confirm / action sheet 工具，及 Web 端 iOS 风格自定义 UI。

## Purpose

Expo Web 环境下 `Alert.alert()` 的回调按钮不可靠，浏览器原生 `window.alert/confirm/prompt` 又破坏视觉一致性。本能力提供一套统一的弹窗工具函数，Web 端使用与 iOS 一致的自定义弹窗 UI。

## Requirements

### Requirement: xAlert 通知弹窗
系统 SHALL 提供 `xAlert(title, message?)` 函数，在 Native 端调用 `Alert.alert`，在 Web 端调用 `webAlert` 渲染 iOS 风格弹窗。

#### Scenario: Native 端显示
- **WHEN** 在 iOS / Android 上调用 `xAlert('提示', '保存成功')`
- **THEN** 显示原生 Alert，包含一个「好的」按钮

#### Scenario: Web 端显示
- **WHEN** 在 Expo Web 上调用 `xAlert('提示', '保存成功')`
- **THEN** 渲染 iOS 风格弹窗（毛玻璃背景 + 圆角卡片 + 单按钮）

### Requirement: xConfirm 确认弹窗
系统 SHALL 提供 `xConfirm(title, message, onConfirm, onCancel?, options?)`，options 可指定 `confirmText` / `cancelText` / `destructive`。

#### Scenario: 确认与取消
- **WHEN** 用户点击确认或取消按钮
- **THEN** 对应回调被触发

#### Scenario: destructive 样式
- **WHEN** options.destructive=true
- **THEN** Native 端使用 `style: 'destructive'`，Web 端确认按钮显示红色

#### Scenario: Web 端按 Esc 取消
- **WHEN** 用户在 Web 端按 Esc 键
- **THEN** onCancel 被触发

### Requirement: xActionSheet 操作菜单
系统 SHALL 提供 `xActionSheet(title, options, onSelect)`，iOS 使用 `ActionSheetIOS`，Android 使用 `Alert.alert` 多按钮，Web 使用底部滑出菜单。

#### Scenario: iOS 原生
- **WHEN** 在 iOS 上调用
- **THEN** 显示 iOS 原生 ActionSheet

#### Scenario: Web 底部菜单
- **WHEN** 在 Web 上调用
- **THEN** 渲染从底部滑出的 iOS 风格菜单，每项独立按钮，最下方为「取消」

#### Scenario: destructive 项标记
- **WHEN** 选项中某项 `destructive=true`
- **THEN** 该项文字显示为红色（iOS / Web）

### Requirement: Web 端 iOS 风格弹窗
`webAlert.ts` SHALL 渲染与 iOS Alert 一致的视觉：270 px 宽圆角卡片、毛玻璃背景、入场动画（scale + opacity）、出场动画。

#### Scenario: 深色模式自适应
- **WHEN** 系统处于深色模式（`prefers-color-scheme: dark`）
- **THEN** 弹窗使用深色配色

#### Scenario: 多层弹窗叠加
- **WHEN** 同时打开两个弹窗
- **THEN** 后打开的覆盖在前者上方（z-index 递增）

#### Scenario: 锁定 body 滚动
- **WHEN** 弹窗打开
- **THEN** `document.body.style.overflow = 'hidden'`，关闭后恢复

### Requirement: 全局禁用直接 Alert.alert
项目代码（除 `crossAlert.ts` 自身实现外）SHALL NOT 直接调用 `Alert.alert` / `window.alert` / `window.confirm` / `window.prompt`。

#### Scenario: 代码搜索零残留
- **WHEN** 在 `mobile/src/` 下搜索 `Alert.alert`
- **THEN** 仅 `crossAlert.ts` 内部命中，其他文件全部使用 xAlert / xConfirm / xActionSheet
