# FastAPI 路由参数重构实施计划

目标：实现 [设计](design.md) 与 [契约规格](specs/fastapi-contract/spec.md)。使用现有 FastAPI/Pydantic/SQLAlchemy 和 TypeScript，在本会话顺序实施。

全局约束：不改数据库；保留业务权限、幂等、并发编辑与旧正常请求；临时文件位于 `.tmp/fastapi-contract/`。

审查重点：日期时区边界；新旧参数冲突；无效请求无写入；匿名附件和 HEAD 权限；多端数组参数与错误渲染。

## 1. 后端声明式契约

- [x] 1.1 新增 `backend/tests/integration/test_fastapi_contract.py`，验证非法查询/请求体返回 422、规范路径无重定向、OpenAPI 安全与参数契约；运行观察预期失败。
- [x] 1.2 新增查询模型，替换 filters/pagination 与各 route 手工读取，明确 header/path，补齐结构化请求和主要响应模型。
- [x] 1.3 声明规范 URL 并在兼容模块注册旧 URL；使用鉴权依赖替换 OpenAPI 猜测，恢复 422，验证新增测试通过。

## 2. 多端迁移

- [x] 2.1 同步 Web、移动端、桌面客户端 URL、查询参数和 tags 数组；兼容本地保留的旧提交载荷。
- [x] 2.2 增加客户端 422 提示测试，更新请求契约测试，验证数组查询编码和错误位置提示。

## 3. 回归和文档

- [x] 3.1 更新旧测试中有意变更的参数错误契约，运行完整后端测试、多端测试与类型检查。
- [x] 3.2 补充 `docs/fastapi-contract.md` 和 README，验证 OpenSpec、根目录布局、diff 格式与最终改动范围。

## 验证记录（2026-10-10）

- 后端全量：155 passed、10 subtests passed；最终类型声明整理后，30 项新增契约测试再次通过。
- Web：540 passed（`npm test -- --reporter=dot --maxWorkers=4`）。默认并发曾出现超时及测试销毁后的异步回调，限制并发后全量无错误。
- 移动端：1176 passed；桌面端：374 passed；三端 TypeScript 类型检查通过。
- 浏览器：desktop 项目的 core-flow、search-filters、submissions、backups 共 17 个不同用例分组通过，包含实际备份下载与跨账号恢复。期间修正旧 URL 拦截规则，并复测 Windows worker 崩溃中断的用例。
- 独立审查确认原 66 个路由/方法组合仍有入口；补充了公开评论、历史导入 context、新旧查询冲突、文件媒体类型和旧 PUT 行为回归。
- Ruff 格式检查通过；修改范围检查忽略既有 `BLE001` 宽泛异常捕获告警后通过，本次未改变这些业务异常处理。
- OpenSpec 严格校验、根目录检查、`git diff --check` 通过。一次性脚本已清理，未修改数据库、提交或部署。
