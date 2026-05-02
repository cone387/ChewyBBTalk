# 防偷窥锁屏（privacy-lock）

> 描述防偷窥模式：超时未操作自动锁屏，需密码或生物识别解锁，覆盖 App 后台、冷启动等场景。

## Purpose

碎碎念内容多为私人记录，用户在公共场合或他人借用设备时希望快速隐藏内容。本能力提供基于不活动超时的自动锁屏，覆盖前台不操作、切后台、被 kill 等多种场景，确保下次回到 App 必须验证身份。

## Requirements

### Requirement: 启用与禁用
系统 SHALL 允许用户在隐私设置页启用或禁用防偷窥模式，配置 `privacy_enabled` 持久化在 AsyncStorage。

#### Scenario: 默认关闭
- **WHEN** 用户首次安装并登录
- **THEN** `privacy_enabled` 默认值为关闭，不出现锁屏

#### Scenario: 启用后立即生效
- **WHEN** 用户在隐私设置页打开开关
- **THEN** 计时器启动，倒计时按设定的超时分钟数运行

### Requirement: 超时时间可配置
系统 SHALL 允许用户配置 1-60 分钟的超时时间（`privacy_timeout_minutes`），默认 5 分钟。

#### Scenario: 调整为 1 分钟
- **WHEN** 用户将超时改为 1 分钟
- **THEN** 之后任何 1 分钟无操作即触发锁屏

### Requirement: 倒计时显示
当 `show_privacy_countdown` 为 true 时，客户端 SHALL 在界面上显示剩余倒计时（带锁图标）。

#### Scenario: 用户操作后倒计时重置
- **WHEN** 用户滚动列表 / 点击按钮 / 输入文字
- **THEN** 倒计时重置为完整超时时间

#### Scenario: 隐藏倒计时
- **WHEN** 用户在设置中关闭「显示倒计时」
- **THEN** UI 不显示倒计时数字，但锁定逻辑仍正常运行

### Requirement: 自动锁定（前台超时）
当连续 `privacy_timeout_minutes` 分钟无用户操作时，系统 SHALL 立即进入锁定状态。

#### Scenario: 前台空闲超时
- **WHEN** App 在前台无任何操作达到超时阈值
- **THEN** `locked` 置为 true，渲染锁屏覆盖层

### Requirement: 切后台后台保护
当 App 进入后台时，系统 SHALL 持久化当前时间戳到 `privacy_last_active`；回到前台时检查间隔，超时则立即锁定。

#### Scenario: 切后台超时回前台
- **WHEN** 用户将 App 切到后台超过超时时间后回到前台
- **THEN** 客户端检测时间差，立即进入锁定状态

#### Scenario: 切后台未超时回前台
- **WHEN** 用户切后台 < 超时时间后回到前台
- **THEN** 不锁定，但倒计时按已用时间继续

### Requirement: 冷启动保护
当 App 被 kill 后再次打开，系统 SHALL 读取 `privacy_last_active`，与当前时间比较，若超时则立即锁定。

#### Scenario: App 被 kill 后超时打开
- **WHEN** App 被系统或用户 kill，超过超时时间后再次启动
- **THEN** 启动后立即显示锁屏，且 `privacy_locked` 持久化

#### Scenario: App 被 kill 后短时间打开
- **WHEN** App 被 kill，但很快重新打开（未超时）
- **THEN** 不锁定，倒计时基于已过时间继续

### Requirement: 锁定状态持久化
`privacy_locked` SHALL 持久化到 AsyncStorage，确保锁定状态跨重启保留。

#### Scenario: 锁定后重启依然锁定
- **WHEN** 锁屏状态下用户 kill 并重启 App
- **THEN** 启动后仍处于锁定状态

### Requirement: 生物识别解锁
当设备支持 Face ID / Touch ID 时，系统 SHALL 优先提供生物识别解锁选项。

#### Scenario: Face ID 成功
- **WHEN** 用户在锁屏页点击生物识别按钮，验证成功
- **THEN** `locked=false`，倒计时重置，回到主界面

#### Scenario: Face ID 取消
- **WHEN** 用户取消生物识别
- **THEN** 保持锁屏状态，可改用密码

#### Scenario: 设备未注册生物识别
- **WHEN** 用户首次尝试生物识别但设备未设置
- **THEN** 隐藏生物识别按钮，仅显示密码输入

### Requirement: 密码解锁
系统 SHALL 接受用户当前账号密码作为解锁凭证，通过调用登录接口验证。

#### Scenario: 密码正确
- **WHEN** 用户输入正确密码
- **THEN** 解锁成功，倒计时重置

#### Scenario: 密码错误
- **WHEN** 用户输入错误密码
- **THEN** 提示「密码错误」，清空输入框，保持锁屏

### Requirement: 锁屏时禁用敏感操作
当处于锁屏状态时，客户端 SHALL 阻止抽屉打开、手势翻页、内容显示等敏感交互。

#### Scenario: 抽屉手势被禁用
- **WHEN** 用户在锁屏状态下尝试侧滑打开抽屉
- **THEN** 手势不响应

#### Scenario: 允许快速发布（可配置）
- **WHEN** `privacy_allow_compose=true` 且用户点击 FAB
- **THEN** 跳转到 Compose 页（仅写不读）

### Requirement: 登录后自动解锁
用户成功登录或注册后，系统 SHALL 清除 `privacy_locked` 并重置倒计时，避免新登录后立即锁屏。

#### Scenario: 重新登录
- **WHEN** 用户从锁屏页改用密码登录成功
- **THEN** `privacy_locked=false`，倒计时重新开始
