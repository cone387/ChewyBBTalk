## Why

原生后端迁移仍保留旧框架表名、未统一的新旧数据库约束、过期部署和规范说明；审计还复现了长 UID 标签排序失败及 2000 标签截断冲突。用户要求全部修复，需要同时完成数据安全迁移和接口回归。

## What Changes

- 新增原生 schema 升级：令牌表改为项目命名，旧框架元数据归档后移除，业务 UID 统一为 1–64 字符，补齐必要约束及索引。
- 修复完整标签列表与排序、补齐 OpenAPI、统一认证依赖输入及数据库错误分类，移除失效校验。
- 清理失效部署静态配置和本地一次性残留，当前文档改为原生实现，历史材料标注被取代。
- 保留旧密码/JWT、外部 URL 和持久草稿兼容，集中说明边界，不为消除关键词破坏现有客户端。

## Capabilities

### New Capabilities
- `native-backend-completion`: 迁移完整性、元数据归档、原生契约和交付验收。

### Modified Capabilities
- `tag-management`: 标签列表完整性与一致的 UID 排序契约。

## Impact

- `backend/models/__init__.py`、`backend/database/upgrade.py`、新增 Alembic revision/冻结目标结构、迁移测试。
- `backend/schemas/records.py`、`backend/backups/transfer.py`、`backend/api/dependencies.py`、`backend/api/errors.py`、`backend/api/routes/records.py`、`backend/services/security.py`、`backend/services/accounts.py` 及回归测试。
- Dockerfile、Compose、Nginx、启动/发布脚本、Playwright 探活和当前 README/OpenSpec/docs。
- 已有数据库须停旧服务、备份后升级；不自动访问线上数据库，不更换密钥，不清空业务记录。
