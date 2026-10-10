## Why

后端迁移到 FastAPI 后仍手工解析查询参数、使用无结构请求体、覆盖原生校验异常并按 URL 猜测鉴权文档。运行行为与 OpenAPI 不一致，非法输入可能静默降级或进入业务处理。

## What Changes

- 保留 `/api/v1/bbtalk` 领域前缀；规范接口不带尾斜杠，旧路径作为隐藏兼容入口。存储创建和删除使用资源集合及资源详情路径。
- Query 模型声明分页、筛选、排序、日期和导出选项；使用可读参数名，兼容原有 ORM 风格参数。
- 将散落的 `dict` 请求体替换为 Pydantic 模型，记录标签支持 JSON 数组；明确请求头和路径参数。
- 使用鉴权依赖声明 OpenAPI 安全方案，补充主要资源响应模型。
- **BREAKING**：非法参数统一返回原生 HTTP 422 与 `detail` 错误列表；业务错误保持现有状态和数据。
- 同步仓库内客户端 URL、参数及错误展示，补充回归测试和迁移说明。

## Capabilities

### New Capabilities
- `fastapi-contract`: 规范路由、声明式参数、响应和安全文档、旧入口兼容。

### Modified Capabilities
无业务能力变更。

## Impact

- `backend/api/{router,dependencies,errors,filters,pagination,schema}.py`、`backend/api/routes/*.py`。
- `backend/schemas/{records,auth,storage}.py`，新增查询和响应模型；`backend/services/records.py`。
- `frontend/src/services/`、`mobile/src/services/`、`mobile/src/screens/`、客户端筛选调用、`desktop/src/`。
- 后端和各客户端契约测试、`backend/README.md`、`README.md`、`docs/fastapi-contract.md`。
- 无数据库、部署配置或依赖版本变更。
