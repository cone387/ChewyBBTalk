# 移动端信息流（mobile-feed）

> 描述移动端首页 BBTalk 信息流卡片的视觉与交互规范。

## Purpose

首页是用户使用频率最高的界面。本能力规定卡片的设计语言、交互手势、状态反馈，确保跨 iOS / Android / Web 端的一致体验。

## Requirements

### Requirement: 顶部 Tab 切换
首页 SHALL 在顶部提供「全部 / 公开 / 私密」三个 Pill 风格 Tab，支持快速切换可见性筛选。

#### Scenario: 默认 Tab
- **WHEN** 用户首次进入首页
- **THEN** 默认选中「全部」

#### Scenario: 切换 Tab
- **WHEN** 用户点击「公开」
- **THEN** 列表筛选 visibility=public 的 BBTalk

### Requirement: 卡片基本结构
每张卡片 SHALL 自上而下展示：标签条（如有）、内容（Markdown 渲染）、附件区（如有）、底部元信息（时间、可见性图标、评论数、菜单按钮）。

#### Scenario: 无附件无标签
- **WHEN** BBTalk 仅含文字
- **THEN** 卡片仅渲染内容 + 底部元信息

#### Scenario: 多附件
- **WHEN** BBTalk 含多张图片
- **THEN** 图片以网格布局展示，点击进入预览大图

### Requirement: 浮动操作按钮（FAB）
首页右下角 SHALL 提供圆形 FAB，点击进入 ComposeScreen 创建新 BBTalk。

#### Scenario: 锁屏时 FAB 行为
- **WHEN** 处于防偷窥锁屏状态且 `privacy_allow_compose=true`
- **THEN** FAB 仍可点击，跳转 Compose（仅写不读）

#### Scenario: 锁屏时禁用
- **WHEN** `privacy_allow_compose=false`
- **THEN** 锁屏状态下 FAB 隐藏

### Requirement: 长按菜单
长按卡片 SHALL 触发操作菜单（编辑 / 切换可见性 / 置顶 / 删除等），由 `xActionSheet` 渲染。

#### Scenario: 长按弹出菜单
- **WHEN** 用户长按卡片
- **THEN** 显示操作菜单，包含上下文相关的操作项

### Requirement: 下拉刷新与触底加载
列表 SHALL 支持下拉刷新与触底加载更多。

#### Scenario: 下拉刷新
- **WHEN** 用户从顶部下拉
- **THEN** 触发刷新，重新拉取第一页

#### Scenario: 触底加载
- **WHEN** 列表滚动到接近底部
- **THEN** 自动请求下一页，追加到列表

### Requirement: 离线兜底
当网络不可用时，列表 SHALL 优先展示离线缓存的数据，并在顶部展示提示。

#### Scenario: 离线展示缓存
- **WHEN** 网络断开且本地有缓存
- **THEN** 列表渲染缓存数据，顶部展示「离线模式」提示

### Requirement: 滚动重置防偷窥倒计时
列表滚动事件 SHALL 调用 `resetPrivacyTimer`，避免阅读时被锁屏。

#### Scenario: 阅读时不锁屏
- **WHEN** 用户持续滚动列表
- **THEN** 倒计时不归零，不会触发锁屏
