## ADDED Requirements

### Requirement: 原生数据库安全接管
系统 MUST 使用项目命名的刷新令牌和撤销表；升级 SHALL 保留业务行、令牌撤销状态、旧密码及附件标识，并将旧框架元数据归档后移除旧表。重复升级不得重复归档。

#### Scenario: 旧实例升级
- **WHEN** 完整旧数据库执行原生升级
- **THEN** 业务内容保持一致、旧刷新黑名单仍有效、原生归档可查询历史元数据，原 Django/auth/token_blacklist 表名不再存在

#### Scenario: 损坏结构与有效数据
- **WHEN** 旧库缺少唯一约束但现有数据有效
- **THEN** 升级补齐约束；若数据重复或关联无效则在改写业务结构前拒绝并保留原数据

### Requirement: 完整原生 HTTP 契约
系统 SHALL 在 OpenAPI 描述实际成功状态与常见失败、Cookie 写请求 CSRF 要求；认证 SHALL 使用依赖解析的输入，数据库异常日志不得泄露参数。

#### Scenario: 幂等重放和 Cookie 请求
- **WHEN** 客户端阅读生成的 OpenAPI
- **THEN** 能看到记录创建 201/重放 200、标签新建 201/已有 200，以及 Cookie 写请求的 X-CSRFToken 要求

### Requirement: 部署与文档一致
当前部署和技术说明 MUST 只使用当前原生组件；历史材料 SHALL 明确标注适用范围，迁移 fixture 与旧客户端兼容 SHALL 有边界说明。

#### Scenario: 当前部署
- **WHEN** 按当前文档配置和启动应用
- **THEN** 不要求 Django、collectstatic、旧项目包或旧 worker 变量，启动 Uvicorn 和原生 CLI
