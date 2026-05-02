## ADDED Requirements

### Requirement: xAlert 通知弹窗
系统 SHALL 提供 `xAlert(title, message?)` 函数，在 native 端调用 `Alert.alert(title, message)`，在 web 端调用 `window.alert(title + message)`。

#### Scenario: Native 端显示通知
- **WHEN** 在 iOS/Android 上调用 `xAlert('提示', '上传成功')`
- **THEN** 显示原生 Alert 弹窗，标题为"提示"，内容为"上传成功"，包含一个"确定"按钮

#### Scenario: Web 端显示通知
- **WHEN** 在 Expo Web 上调用 `xAlert('提示', '上传成功')`
- **THEN** 调用 `window.alert` 显示浏览器弹窗

### Requirement: xConfirm 确认弹窗
系统 SHALL 提供 `xConfirm(title, message, onConfirm, onCancel?)` 函数，在 native 端使用 `Alert.alert` 双按钮模式，在 web 端使用 `window.confirm`。

#### Scenario: Native 端用户确认
- **WHEN** 在 iOS/Android 上调用 `xConfirm('删除', '确定删除？', callback)`，用户点击"确定"
- **THEN** 执行 onConfirm 回调

#### Scenario: Native 端用户取消
- **WHEN** 在 iOS/Android 上调用 `xConfirm('删除', '确定删除？', onConfirm, onCancel)`，用户点击"取消"
- **THEN** 执行 onCancel 回调（如提供）

#### Scenario: Web 端用户确认
- **WHEN** 在 Expo Web 上调用 `xConfirm('删除', '确定删除？', callback)`，用户点击浏览器确认按钮
- **THEN** 执行 onConfirm 回调

#### Scenario: Web 端用户取消
- **WHEN** 在 Expo Web 上调用 `xConfirm('删除', '确定删除？', onConfirm, onCancel)`，用户点击浏览器取消按钮
- **THEN** 执行 onCancel 回调（如提供）

### Requirement: xActionSheet 操作菜单
系统 SHALL 提供 `xActionSheet(title, options, onSelect)` 函数，在 iOS 使用 `ActionSheetIOS`，Android 使用 `Alert.alert` 多按钮模式，Web 使用 `window.prompt` 数字选择。

#### Scenario: iOS 显示操作菜单
- **WHEN** 在 iOS 上调用 `xActionSheet('操作', [{text: '编辑'}, {text: '删除', destructive: true}], callback)`
- **THEN** 显示 iOS 原生 ActionSheet，包含"编辑"、"删除"、"取消"选项

#### Scenario: Android 显示操作菜单
- **WHEN** 在 Android 上调用 `xActionSheet` 
- **THEN** 通过 `Alert.alert` 显示多按钮弹窗

#### Scenario: Web 显示操作菜单
- **WHEN** 在 Expo Web 上调用 `xActionSheet`，用户输入有效数字
- **THEN** 通过 `window.prompt` 显示选项列表，解析用户输入并调用 onSelect 回调

### Requirement: 全局替换 Alert.alert
项目中所有直接使用 `Alert.alert` 的代码 SHALL 替换为 `xAlert`、`xConfirm` 或 `xActionSheet`，MUST NOT 残留任何直接的 `Alert.alert` 调用。

#### Scenario: 替换完成后无 Alert.alert 残留
- **WHEN** 在代码库中搜索 `Alert.alert`
- **THEN** 除了 `crossAlert.ts` 工具文件内部实现外，无其他文件直接调用 `Alert.alert`

### Requirement: 移除已有 Platform.OS === 'web' workaround
`AccountSecurityScreen` 中已有的 `Platform.OS === 'web'` 分支 SHALL 替换为统一的 `xConfirm`/`xAlert` 调用。

#### Scenario: AccountSecurityScreen 使用统一工具函数
- **WHEN** 查看 `AccountSecurityScreen.tsx` 代码
- **THEN** 不包含 `Platform.OS === 'web'` 的 alert 分支逻辑，使用 `xConfirm` 处理删除确认
