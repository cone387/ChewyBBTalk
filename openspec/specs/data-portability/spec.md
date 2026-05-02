# 数据导入导出（data-portability）

> 描述用户数据的导出（备份/迁移）与导入（恢复/合并）能力。

## Purpose

数据是用户的，用户应当随时能完整带走或迁移。本能力提供 JSON 与 ZIP 两种格式：JSON 适合纯文本备份与跨服务器迁移，ZIP 包含附件二进制文件适合完整离线备份。

## Requirements

### Requirement: 导出格式选择
系统 SHALL 支持 `json` 与 `zip` 两种导出格式，通过查询参数 `export_format` 指定。

#### Scenario: 导出 JSON
- **WHEN** 用户调用 `GET /api/v1/bbtalk/data/export/?export_format=json`
- **THEN** 返回包含用户、Tag、BBTalk、Comment 元信息的 JSON 文件，附件仅以 URL 引用

#### Scenario: 导出 ZIP
- **WHEN** 用户调用 `GET /api/v1/bbtalk/data/export/?export_format=zip`
- **THEN** 返回 ZIP 包，内含 `data.json` 与 `attachments/` 目录（所有附件二进制）

### Requirement: 导出范围
导出 SHALL 仅包含当前已认证用户的数据，不包含其他用户的任何信息。

#### Scenario: 多用户隔离
- **WHEN** 用户 A 导出
- **THEN** 仅包含 user_id = A 的所有 Tag/BBTalk/Comment

### Requirement: 导入文件接受
系统 SHALL 接受 `application/json` 或 `application/zip` 两种 multipart 文件上传。

#### Scenario: 上传 JSON
- **WHEN** 用户 POST 一个 `data.json`
- **THEN** 系统解析并应用导入

#### Scenario: 上传 ZIP
- **WHEN** 用户 POST 一个包含 `data.json` 与附件目录的 ZIP
- **THEN** 系统解压、上传附件到当前存储、应用导入

### Requirement: 导入合并策略
系统 SHALL 采用「以 uid 去重」策略：相同 uid 的 Tag/BBTalk 跳过，不存在的新建。

#### Scenario: 标签去重
- **WHEN** 导入数据中的 Tag uid 已存在
- **THEN** 跳过该 Tag，统计为 `tags_skipped`

#### Scenario: 新增统计
- **WHEN** 导入完成
- **THEN** 返回 `{ tags_created, tags_skipped, bbtalks_created, bbtalks_skipped, errors: [] }`

### Requirement: 导入预校验
系统 SHALL 提供 `POST /api/v1/bbtalk/data/validate/` 接口，对上传文件做格式与版本校验，返回是否可导入。

#### Scenario: 校验通过
- **WHEN** 文件结构合法、版本兼容
- **THEN** 返回 `{ valid: true, summary: { ... } }`

#### Scenario: 校验失败
- **WHEN** 文件损坏或格式不符
- **THEN** 返回 `{ valid: false, error: "原因描述" }`

### Requirement: 错误隔离
单条记录的导入错误 SHALL NOT 中断整个导入流程，错误信息收集后统一返回。

#### Scenario: 部分失败
- **WHEN** 导入 100 条 BBTalk 时其中 3 条因数据问题失败
- **THEN** 其他 97 条正常导入，结果中 `errors` 包含 3 条具体错误描述

### Requirement: 客户端文件保存
客户端 SHALL 在 Web 端使用 `<a download>` 触发浏览器下载，在 Native 端使用 `expo-sharing` 调用系统分享面板。

#### Scenario: Web 下载
- **WHEN** Web 用户点击导出
- **THEN** 浏览器自动下载 `bbtalk_export_<时间戳>.<ext>`

#### Scenario: Native 分享
- **WHEN** iOS / Android 用户点击导出
- **THEN** 唤起系统分享面板，可保存到「文件」、AirDrop、邮件等
