## MODIFIED Requirements

### Requirement: 标签排序
系统 SHALL 允许用户通过拖拽或上下按钮调整标签顺序，顺序通过 `sort_order` 字段持久化。路径、导入、`uids` 和 `items` 排序载荷 MUST 统一支持长度 1–64 的业务 UID。用于全量排序的列表 SHALL 包含账号全部标签，不得静默截断。

#### Scenario: 调整顺序
- **WHEN** 用户调整 Tag A 与 B 的顺序
- **THEN** 系统更新它们的 `sort_order`，下次列表请求按新顺序返回

#### Scenario: 长 UID 与大量标签
- **WHEN** 账号有超过 2000 个标签或导入了 23–64 字符 UID 的标签
- **THEN** 完整列表可读取，两种排序载荷均可持久化有效顺序

#### Scenario: 非法 UID
- **WHEN** 导入或排序提交空值、非字符串或超过 64 字符的 UID
- **THEN** 系统明确拒绝对应无效输入，不写入无法通过详情路径读取的标签
