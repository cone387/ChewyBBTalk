## ADDED Requirements

### Requirement: 显式参数契约
系统 SHALL 通过 FastAPI 与 Pydantic 声明路径、查询、请求体和头参数，使运行校验与 OpenAPI 一致。

#### Scenario: 参数无效
- **WHEN** 提交非法页码、布尔值、日期、排序字段或结构错误请求体
- **THEN** 返回 422，detail 包含 loc、msg、type，且不产生业务写入

#### Scenario: 标签和日期筛选
- **WHEN** 使用重复 tags 参数与 created_on 日期查询
- **THEN** 返回同时拥有全部标签且位于服务器时区对应日期内的记录

### Requirement: 规范路由与旧入口兼容
系统 SHALL 提供无尾斜杠规范路由，并保留旧 URL、旧筛选名和 post_tags 的有效请求兼容。

#### Scenario: 规范和历史请求
- **WHEN** 分别请求规范入口和对应旧入口
- **THEN** 业务结果相同，规范入口无需重定向，OpenAPI 只展示规范入口

### Requirement: 安全文档来源于依赖
系统 SHALL 使用声明式鉴权依赖生成安全要求，并保留 JWT、Cookie/CSRF 和匿名公开读取权限。

#### Scenario: 受保护与公开接口
- **WHEN** 读取 OpenAPI 并实际请求接口
- **THEN** blacklist 等受保护操作声明鉴权，公开内容不要求鉴权，匿名附件读取遵循可见性

### Requirement: 客户端能够展示参数错误
仓库内客户端 SHALL 使用规范请求并把 422 detail 列表转换为可读提示。

#### Scenario: 参数校验失败
- **WHEN** 服务端返回带字段位置的 422
- **THEN** 用户看到字段与原因，并保留原提交内容和既有重试机制
