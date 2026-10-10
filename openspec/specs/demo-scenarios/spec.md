## Requirements
### Requirement: 完整演示场景
系统 SHALL 提供文本、Markdown、附件、标签、评论、可见性、置顶和时间分页样例。
#### Scenario: 首次初始化
- **WHEN** 启用 CREATE_DEMO_USER 并首次初始化
- **THEN** demo 普通账号拥有至少 240 条记录，且所有预置附件可从本地读取

### Requirement: 非破坏性补充
系统 SHALL 提供显式 seed-demo 命令并保留已存在的数据修改。
#### Scenario: 已有账号重复补充
- **WHEN** 对已有 demo 执行两次 seed-demo
- **THEN** 第二次不会重复创建场景，原密码、手工记录与已修改场景保持不变

### Requirement: 附件权限
演示附件 SHALL 使用实际附件模型并遵守记录可见性。
#### Scenario: 匿名访问
- **WHEN** 匿名请求公开及私密场景的附件
- **THEN** 仅公开附件可访问，demo 登录后可访问其私密附件
