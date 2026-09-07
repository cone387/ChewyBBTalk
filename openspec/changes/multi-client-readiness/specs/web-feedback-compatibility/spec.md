## ADDED Requirements

### Requirement: 一致操作反馈
Web SHALL 使用一致的确认、错误和重试反馈覆盖记录、评论及标签操作，失败保留上下文。

#### Scenario: 删除确认和失败
- **WHEN** 用户删除评论或执行需确认的操作
- **THEN** 使用可键盘操作的确认组件，取消无副作用，失败可见且可重试

### Requirement: 跨浏览器关键流程
项目 SHALL 自动验证 Chromium、Firefox、WebKit 的关键操作。

#### Scenario: 浏览器回归
- **WHEN** 执行跨浏览器测试
- **THEN** 验证登录、发布、防重复、编辑冲突、筛选及确认交互，记录引擎与结果，不把模拟当作真机验收
