# 附件存储（attachment-storage）

> 描述附件的上传、访问，以及本地存储与 S3 兼容存储之间的切换、迁移能力。

## Purpose

附件是 BBTalk 的重要载体（图片、音频、视频、文件）。系统采用 `chewy-attachment` 作为底层存储抽象，允许用户在本地存储与 S3 兼容存储之间运行时切换，并支持已存在附件的批量迁移。

## Requirements

### Requirement: 附件上传
系统 SHALL 提供附件上传接口，接受 multipart/form-data，返回元信息字典（uid / url / type / name / size / mime_type）。

#### Scenario: 上传图片
- **WHEN** 客户端 POST 一个 image/jpeg 文件
- **THEN** 系统保存到当前激活的存储后端，返回 `{ uid, url, type: "image", name, size, mime_type }`

#### Scenario: 上传时无激活存储
- **WHEN** 用户从未配置 S3，且默认本地存储可用
- **THEN** 使用本地存储

### Requirement: 多 S3 配置共存
系统 SHALL 允许每个用户保存多个 `UserStorageSettings` 配置（如阿里云 OSS、MinIO 测试、AWS S3），但同一时刻只激活一个。

#### Scenario: 添加新配置
- **WHEN** 用户提交 `{ name, s3_access_key_id, s3_secret_access_key, s3_bucket_name, s3_region_name, s3_endpoint_url }`
- **THEN** 系统持久化配置（密钥加密存储），返回完整对象

#### Scenario: 列出所有配置
- **WHEN** 用户请求 `GET /settings/storage/`
- **THEN** 返回该用户的所有配置列表，标记其中 `is_active` 项

### Requirement: 配置激活
系统 SHALL 支持将某个 S3 配置设为激活，激活时同时取消其他配置的激活状态。

#### Scenario: 激活某配置
- **WHEN** 用户调用 `POST /settings/storage/{id}/activate/`
- **THEN** 该配置 `is_active=true`，其他全部置为 false

#### Scenario: 切回本地存储
- **WHEN** 用户调用 `POST /settings/storage/deactivate-all/`
- **THEN** 所有 S3 配置取消激活，新附件改用本地存储

### Requirement: 测试连接
系统 SHALL 提供测试 S3 连接性的接口，返回是否成功 + 详细原因。

#### Scenario: 测试现有配置
- **WHEN** 用户调用 `POST /settings/storage/{id}/test/`
- **THEN** 系统尝试 PUT/DELETE 一个测试对象，返回 `{ success: bool, message: string }`

#### Scenario: 测试未保存的配置
- **WHEN** 用户在创建表单中点击「测试连接」（提交临时配置）
- **THEN** 系统使用临时配置测试，不持久化

### Requirement: 附件迁移
系统 SHALL 支持将已存在附件从一个存储后端批量迁移到另一个，包含预览（不实际迁移）与执行两个阶段。

#### Scenario: 预览迁移
- **WHEN** 用户调用 `POST /storage/migration/preview/`
- **THEN** 系统返回待迁移附件总数、总大小，不修改任何数据

#### Scenario: 执行迁移
- **WHEN** 用户调用 `POST /storage/migration/execute/`
- **THEN** 系统逐个下载、上传、更新 BBTalk.attachments 中的 url，返回成功 / 失败统计

#### Scenario: 迁移失败容错
- **WHEN** 单个附件迁移失败
- **THEN** 系统记录错误并继续其余附件，迁移结束后返回失败列表

### Requirement: 删除配置
系统 SHALL 允许用户删除非激活的 S3 配置。激活中的配置必须先取消激活才能删除。

#### Scenario: 删除非激活配置
- **WHEN** 用户调用 `DELETE /settings/storage/{id}/delete/`，且该配置未激活
- **THEN** 系统物理删除该配置

### Requirement: URL 访问控制
系统 SHALL 区分公开访问与私有访问的附件 URL：S3 后端使用预签名 URL 或公开桶策略，本地后端通过 Django 的认证视图返回。

#### Scenario: 私有附件需认证
- **WHEN** 未认证用户尝试访问私有 BBTalk 中的附件
- **THEN** 返回 401 或 404
