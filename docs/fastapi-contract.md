# FastAPI 路由与参数契约

后端通过 Pydantic 请求/响应模型、`Query`、`Path`、`Header`、`Form` 和安全依赖声明 HTTP 契约。FastAPI 本身不强制 URL 是否带尾斜杠；本项目统一将**不带尾斜杠**的路径作为规范入口，OpenAPI 只展示规范入口。

## 路由

| 操作 | 规范入口 |
| --- | --- |
| 查询、创建记录 | `GET /api/v1/bbtalk`、`POST /api/v1/bbtalk` |
| 查询、更新、删除记录 | `GET/PUT/PATCH/DELETE /api/v1/bbtalk/{uid}` |
| 标签集合 | `GET/POST /api/v1/bbtalk/tags` |
| 获取令牌 | `POST /api/v1/bbtalk/auth/token` |
| 附件列表、上传 | `GET/POST /api/v1/attachments/files` |
| 创建存储配置 | `POST /api/v1/bbtalk/settings/storage` |
| 更新、删除存储配置 | `PUT/PATCH/DELETE /api/v1/bbtalk/settings/storage/{pk}` |
| 导出、导入 | `GET /api/v1/bbtalk/data/export`、`POST /api/v1/bbtalk/data/import` |

`uid` 是长度 1–64 的业务字符串，兼容历史导入数据，不强制转换为 UUID。存储配置等数字 ID 必须为正整数。`GET` 保留对应的 `HEAD` 能力及相同鉴权。

旧带尾斜杠路径、JSON 后缀、存储配置 `/create/` 和 `/{pk}/delete/` 由兼容层处理，不依赖重定向，也不重复展示在 OpenAPI 中。记录和标签的规范 `PUT` 替换整个可编辑对象，省略的可选字段恢复默认值；`PATCH` 仅修改提供的字段。旧尾斜杠记录/标签 `PUT` 保留原来的局部更新语义，记录仍须提供正文。存储配置继续保留原有 PUT/PATCH 局部更新及密钥保留规则。

## 查询参数

分页使用 `page`（至少 1）、`page_size`（1–100；记录默认 100，附件默认 20）。无效值返回 422；超出实际页数保留 404。布尔值使用 `true`/`false`，并兼容 Pydantic 支持的 `1`/`0` 等布尔表示。

多标签使用重复查询参数，例如 `?tags=工作&tags=生活`，表示同时包含这些标签。日期采用 ISO 8601。无时区时间按后端配置的时区解释；日期上限包含当天，内部转换为次日零点的开区间。记录排序支持 `create_time`、`-create_time`、`update_time`、`-update_time`。

| 旧参数（兼容输入） | 规范参数 |
| --- | --- |
| `tags__name=工作,生活` | `tags=工作&tags=生活` |
| `create_time__gte` / `create_time__lte` | `created_from` / `created_to` |
| `create_date__gte` / `create_date__lte` | `created_date_from` / `created_date_to` |
| `create_time__date` | `created_on` |
| `export_format` | `format`（`json` 或 `zip`） |

同一请求同时提供一组新旧参数会返回 422，包括显式提供默认值的情况。未声明的额外查询字段继续忽略。

## 请求体与请求头

### 评论读取

`GET /api/v1/bbtalk/{uid}/comments` 是记录下的评论集合，公开记录使用 `/api/v1/bbtalk/public/{uid}/comments`。路径中的 `uid` 保持资源标识语义。

列表、详情和记录写入响应新增 `comment_preview`（最早三条，按 `create_time,id` 升序）和 `comments_revision`（不透明版本字符串），并保留 `comment_count`。客户端显示卡片预览时无需逐条发起评论 GET。

完整评论使用 `?page=1&page_size=20`，返回 `{count,next,previous,results,revision}`；页码至少 1，默认每页 20，最大 100。页间版本变化时客户端重新从第一页读取，避免错位拼接。不传 `page` 的旧请求继续返回数组；这一兼容入口仍可能返回全部评论，新客户端不应依赖它。

评论版本独立于记录编辑时间，增删及预览外评论变化都会失效。后端批量计算预览与版本，不按记录逐条查询；版本计算仍需扫描结果记录的评论元数据，不等同于评论总量无关的常数执行时间。

### 写入载荷

创建记录使用 JSON 数组传递标签：

```json
{"content":"今天完成了接口整理","tags":["开发","记录"],"visibility":"private"}
```

旧 `post_tags` 逗号字符串仍可输入，但不能同时提供 `tags`。标签名去除首尾空白并去重。标签排序接受 `{"uids":["uid-1","uid-2"]}` 或 `{"items":[{"uid":"uid-1","sort_order":1}]}`，两种形式只能选一种。存储迁移使用 `target_config_id` 正整数或 `null`；附件上传仍使用 multipart 文件和表单字段。

`Idempotency-Key` 通过 Header 声明并校验，保留持久化提交回执：首次创建返回 201，相同载荷重试返回 200，冲突返回 409。兼容旧客户端 `post_tags` 与新客户端 `tags` 的等价提交，桌面端仍可读取已保存的旧载荷。历史回执保留原始请求哈希，任意改变原始 CSV 空白等表示不保证被识别为等价载荷。

`If-Match` 接收完整的记录 `update_time`，必须包含时区，可带双引号。非法时间返回 422，版本冲突返回 409。

## 错误、响应和认证

参数校验使用 FastAPI 默认 **422**，不再转换为旧的 400 字符串：

```json
{"detail":[{"type":"greater_than_equal","loc":["query","page"],"msg":"Input should be greater than or equal to 1","input":0,"ctx":{"ge":1}}]}
```

这是有意的错误契约变化；旧成功请求仍兼容，但外部客户端如依赖旧错误格式，需要适配 `detail` 数组。Web、移动端、桌面端已同步展示字段位置和提示，不将校验错误中的原始输入拼入提示。业务错误继续使用原来的状态码和业务字段。

主要 JSON 响应声明 `response_model`；历史导入的 JSON `context` 仍可读取。文件下载声明二进制类型，附件文档同时说明 Range 和签名重定向。JWT Bearer 与 Session Cookie 通过实际安全依赖生成 OpenAPI，保留权限、会话 CSRF 和附件访问规则。

接口文档地址保持 `/api/schema/`、`/api/schema/swagger-ui/`、`/api/schema/redoc/`。本次不涉及数据库结构或部署环境变量变更。新增契约回归位于 `backend/tests/integration/test_fastapi_contract.py`。

实现依据：[FastAPI 查询模型](https://fastapi.tiangolo.com/tutorial/query-param-models/)、[校验错误](https://fastapi.tiangolo.com/tutorial/handling-errors/)、[响应模型](https://fastapi.tiangolo.com/tutorial/response-model/)、[安全依赖](https://fastapi.tiangolo.com/reference/security/)。
