# FastAPI 3.0 接口契约

API 3.0.0 只提供原生 FastAPI 契约。旧客户端必须随服务端升级；账号与业务数据保留，旧 HTTP 协议和旧登录令牌不再接受。停写、备份、迁移与回退步骤见[后端升级说明](../backend/README.md#已有实例升级)，验证范围见[本次整改报告](native-contract-cleanup.md)。

## 路径与方法

所有 `/api/v1` 业务路径不带尾斜杠，不做尾斜杠重定向；`.json` 后缀和存储配置 `/create`、`/{pk}/delete` 别名已移除。

| 操作 | 入口 |
| --- | --- |
| 查询、创建记录 | `GET/POST /api/v1/bbtalk` |
| 查询、更新、删除记录 | `GET/PUT/PATCH/DELETE /api/v1/bbtalk/{uid}` |
| 标签集合 | `GET/POST /api/v1/bbtalk/tags` |
| 获取令牌 | `POST /api/v1/bbtalk/auth/token` |
| 刷新、撤销令牌 | `POST /api/v1/bbtalk/auth/token/refresh`、`POST /api/v1/bbtalk/auth/token/revoke` |
| 附件列表、上传 | `GET/POST /api/v1/attachments/files` |
| 创建存储配置 | `POST /api/v1/bbtalk/settings/storage` |
| 更新、删除存储配置 | `PUT/PATCH/DELETE /api/v1/bbtalk/settings/storage/{pk}` |
| 导出、导入 | `GET /api/v1/bbtalk/data/export`、`POST /api/v1/bbtalk/data/import` |

`uid` 为长度 1–64 的业务字符串，保留历史导入标识，不强制转换 UUID；数字 ID 必须为正整数。`GET` 具有同权限的 `HEAD`。记录和标签的 `PUT` 替换整个可编辑对象，省略的可选字段恢复默认值；`PATCH` 仅修改提供的字段。存储配置保留 PUT/PATCH 局部更新和密钥保留规则。

## 查询与分页

查询由类型化 Pydantic 模型校验。未知查询字段、旧 ORM 风格 `__` 过滤字段和非法值均返回 422。分页使用 `page`（至少 1）和 `page_size`（1–100）；记录默认每页 100，附件与评论默认 20。超出实际页数返回 200 和空分页对象（`items: []`、`has_more: false`），仍保留总数及请求页码。

| 参数 | 含义 |
| --- | --- |
| `tags=工作&tags=生活` | 同时包含所有指定标签 |
| `created_from` / `created_to` | 创建时间范围，ISO 8601 |
| `created_date_from` / `created_date_to` | 创建日期范围 |
| `created_on` | 指定创建日期 |
| `ordering` | `create_time`、`-create_time`、`update_time`、`-update_time` |
| `format` | 导出格式 `json` 或 `zip` |

无时区时间按后端配置时区解释；日期上限包含当天，内部使用次日零点的开区间。布尔查询接受 Pydantic 支持的布尔表示。

所有分页响应统一为 `{items,total,page,page_size,has_more}`，不再返回 `count/results/next/previous`。记录流额外返回 `total_count`；评论额外返回 `revision`。标签集合仍返回完整数组，供全量排序使用。

`GET /api/v1/bbtalk/{uid}/comments` 和 `/api/v1/bbtalk/public/{uid}/comments` 始终分页；不传 `page` 时也返回第一页对象，不再返回完整数组。客户端逐页加载，页间 `revision` 改变时从第一页重新读取。

记录响应含 `comment_preview`（最早三条，按 `create_time,id` 升序）、`comment_count` 和不透明 `comments_revision`。评论版本独立于记录编辑时间，增删和预览外评论变化都会改变版本；后端批量读取评论元信息，版本计算仍与相关评论数量有关。

## 写入与幂等

标签只使用字符串数组，不再接收 `post_tags`：

```json
{"content":"今天完成了接口整理","tags":["开发","记录"],"visibility":"private"}
```

标签名去除首尾空白并去重。标签排序接受 `{"uids":["uid-1","uid-2"]}` 或 `{"items":[{"uid":"uid-1","sort_order":1}]}`，两种形式只能选一种。存储迁移使用正整数或 `null` 的 `target_config_id`。附件上传使用 multipart。

`Idempotency-Key` 对应持久提交回执：首次创建 201、同载荷重试 200、冲突 409。历史回执保留原始请求哈希；服务器不再解释旧 CSV 标签载荷。桌面端在加载持久化数据时执行独立版本迁移，将旧标签转为数组并保留账号、草稿、附件和原 key。迁移后的未确认提交先查询 `submission-status`：已有或已删除的记录直接确认，只有明确 404 才用新载荷与原 key 重试；网络或服务错误时保留待确认状态。

`If-Match` 使用带时区的完整 `update_time`，可带双引号；非法时间 422，版本冲突 409。

## 认证与错误

JWT 使用字符串 `sub` 及 `purpose: access|refresh`，刷新和撤销使用原生 `RefreshToken`、`RevokedToken`。旧 JWT 与刷新令牌必须重新登录。Cookie 为 `cb_session`、`cb_csrf`，写请求头为 `X-CSRF-Token`；升级前的 Cookie 会话也需要重新登录。

字段校验采用 FastAPI 的 422 `detail` 数组，例如：

```json
{"detail":[{"type":"greater_than_equal","loc":["query","page"],"msg":"Input should be greater than or equal to 1","input":0,"ctx":{"ge":1}}]}
```

客户端显示字段位置和提示，不拼接原始敏感输入。业务错误保留对应状态码和业务字段。主要 JSON 响应声明 `response_model`；文件下载提供二进制、Range 与签名重定向规则。私有附件经权限校验，不公开媒体目录。

移动端文件上传默认 `is_public=false`，记录发布、编辑及删除后由后端同步附件可见性。文件请求遇到明确 401 时刷新并重试一次，网络或服务错误不自动重放上传/导入；账号切换后取消请求并丢弃旧响应。导入响应中的 `partial`、附件/评论跳过统计及逐行 `errors` 必须呈现，`success=true` 不代表完整恢复。移动端升级与超时规则见 [App 说明](../mobile/README.md#fastapi-30-适配与升级)。

Swagger 位于 `/docs`，ReDoc 位于 `/redoc`，OpenAPI 位于 `/openapi.json`；`/api/schema/` 系列入口已移除。单容器和 Compose Nginx 均转发新地址，存活检查继续使用 `/healthz`。
