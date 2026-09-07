## ADDED Requirements

### Requirement: 普通 Web 与旧 PWA 退场
Web SHALL 不再注册 PWA、提供安装 manifest 或宣称离线可用；SHALL 保留响应式浏览器访问。

#### Scenario: 新用户访问
- **WHEN** 用户首次打开 Web
- **THEN** 不注册 Service Worker，不提供 PWA 安装元信息

#### Scenario: 旧客户端更新
- **WHEN** 原有 worker 获取新 `sw.js`
- **THEN** worker 清理本应用缓存、自注销，并且不强制刷新编辑页面或清除其他应用数据

### Requirement: 会话数据隔离
移动端 SHALL 根据服务器和账号隔离缓存，并在会话改变时清空记录及标签内存状态，拒绝旧请求结果。

#### Scenario: 切换账号或服务器
- **WHEN** 用户由服务器 A 的账号 1 切换到其他账号或服务器
- **THEN** 新会话不能读取旧会话缓存或接收旧请求回写

#### Scenario: 恢复相同账号
- **WHEN** 同一服务器和账号重新启动且网络不可用
- **THEN** 允许恢复其自身缓存和同步时间

### Requirement: 真实桌面版本入口
桌面 SHALL 提供正式发布页入口，不伪造版本检查结果。

#### Scenario: 查看版本
- **WHEN** 用户点击查看发布版本
- **THEN** 通过系统浏览器打开固定发布页，不自动安装或显示未经验证的最新版本结论

### Requirement: 公共控件键盘操作
Web Modal SHALL 管理焦点、关联标题并允许长内容滚动；Select SHALL 支持标准键盘选择。

#### Scenario: 弹窗关闭
- **WHEN** 用户通过 Escape 关闭弹窗
- **THEN** 焦点回到原触发按钮；打开期间 Tab 焦点保持在弹窗内

#### Scenario: 选择选项
- **WHEN** 用户用键盘操作选择框
- **THEN** 可以选择选项，禁用状态不能更改值
