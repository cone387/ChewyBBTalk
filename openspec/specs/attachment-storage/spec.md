# 附件存储（attachment-storage）

> 描述附件的上传、访问，以及本地存储与 S3 兼容存储之间的切换、迁移能力。

## Purpose

附件是 BBTalk 的重要载体（图片、音频、视频、文件）。系统通过原生 `storage/` 模块、SQLAlchemy 附件模型与 boto3，允许用户在本地存储与 S3 兼容存储之间运行时切换，并支持已存在附件的批量迁移。以下存储配置路径相对于 `/api/v1/bbtalk`；旧尾斜杠及操作别名仅保留兼容。

## Requirements

### Requirement: 附件上传
系统 SHALL 提供 `POST /api/v1/attachments/files` 上传接口，接受 multipart/form-data，返回附件 ID、原文件名、大小、MIME 类型、权限及预览/下载 URL。客户端 SHALL 将响应转换为界面使用的附件结构。

#### Scenario: 上传图片
- **WHEN** 客户端 POST 一个 image/jpeg 文件
- **THEN** 系统保存到当前激活的存储后端，返回包含 `id`、`original_name`、`size`、`mime_type`、`preview_url`、`download_url` 的元信息

#### Scenario: 上传时无激活存储
- **WHEN** 用户从未配置 S3，且默认本地存储可用
- **THEN** 使用本地存储

### Requirement: 多 S3 配置共存
系统 SHALL 允许每个用户保存多个 `StorageConfig` 配置（如阿里云 OSS、MinIO 测试、AWS S3），但同一时刻只激活一个。

#### Scenario: 添加新配置
- **WHEN** 用户提交 `{ name, s3_access_key_id, s3_secret_access_key, s3_bucket_name, s3_region_name, s3_endpoint_url }`
- **THEN** 系统持久化配置（密钥以 `enc:v1:` 格式加密存储），返回完整对象；读取接口不得返回密钥明文

#### Scenario: 回填旧密钥
- **WHEN** 管理员执行 `python -m cli encrypt-storage-secrets` 命令
- **THEN** 系统将历史明文密钥加密，已加密记录保持不变，命令可重复执行

#### Scenario: 列出所有配置
- **WHEN** 用户请求 `GET /settings/storage`
- **THEN** 返回该用户的所有配置列表，标记其中 `is_active` 项

### Requirement: 配置激活
系统 SHALL 支持将某个 S3 配置设为激活，激活时同时取消其他配置的激活状态。

#### Scenario: 激活某配置
- **WHEN** 用户调用 `POST /settings/storage/{id}/activate`
- **THEN** 该配置 `is_active=true`，其他全部置为 false

#### Scenario: 切回本地存储
- **WHEN** 用户调用 `POST /settings/storage/deactivate-all`
- **THEN** 所有 S3 配置取消激活，新附件改用本地存储

### Requirement: 测试连接
系统 SHALL 提供测试 S3 连接性的接口，返回是否成功 + 详细原因。

#### Scenario: 测试现有配置
- **WHEN** 用户调用 `POST /settings/storage/{id}/test`
- **THEN** 系统检查存储桶访问能力，返回 `{ success: bool, message: string }`；连接检查通过不等同于所有对象读写权限均已验收

#### Scenario: 测试未保存的配置
- **WHEN** 用户在创建表单中点击「测试连接」（提交临时配置）
- **THEN** 系统使用临时配置测试，不持久化

### Requirement: 附件迁移
系统 SHALL 支持将已存在附件从一个存储后端批量迁移到另一个，包含预览（不实际迁移）与执行两个阶段。

#### Scenario: 预览迁移
- **WHEN** 用户调用 `POST /storage/migration/preview`
- **THEN** 系统返回附件总数、需迁移数量及已在目标存储的数量，不修改任何数据

#### Scenario: 执行迁移
- **WHEN** 用户调用 `POST /storage/migration/execute`
- **THEN** 系统逐个复制文件并更新附件的存储配置与路径，保留原文件和 API 附件标识，返回迁移 / 跳过 / 失败统计

#### Scenario: 迁移失败容错
- **WHEN** 单个附件迁移失败
- **THEN** 系统记录错误并继续其余附件，迁移结束后返回失败列表

### Requirement: 删除配置
系统 SHALL 允许用户删除自己的 S3 配置，但配置仍有关联附件时必须先迁移附件，删除请求返回 409。

#### Scenario: 删除无附件的配置
- **WHEN** 用户调用 `DELETE /settings/storage/{id}`，且该配置没有关联附件
- **THEN** 系统物理删除该配置

### Requirement: URL 访问控制
系统 SHALL 对附件执行公开/私有权限检查：S3 后端在授权后重定向至限时预签名 URL，本地后端通过 FastAPI 附件路由返回文件。部署不得直接公开私有媒体目录。

#### Scenario: 私有附件需认证
- **WHEN** 未认证用户尝试访问私有 BBTalk 中的附件
- **THEN** 返回 401 或 404
