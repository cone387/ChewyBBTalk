# 标签管理（tag-management）

> 描述标签（Tag）的创建、编辑、删除、排序，以及与 BBTalk 的关联策略。

## Purpose

Tag 提供给用户对 BBTalk 进行分类和检索的能力。Tag 在用户维度内具有唯一性，支持自定义颜色与排序。

## Requirements

### Requirement: 创建标签
系统 SHALL 允许用户创建 Tag，标签名在该用户范围内必须唯一。

#### Scenario: 通过内容自动创建
- **WHEN** 用户在 BBTalk 内容中输入 `#随笔` 并保存
- **THEN** 系统自动创建名为「随笔」的 Tag（若不存在），随机分配颜色，建立关联

#### Scenario: 在标签管理页手动创建
- **WHEN** 用户在标签管理页输入名称并提交
- **THEN** 系统创建 Tag 并返回完整对象

#### Scenario: 重名拒绝
- **WHEN** 用户尝试创建与已有 Tag 同名的标签
- **THEN** 系统返回 400，提示「该标签已存在」

### Requirement: 编辑标签
系统 SHALL 允许用户修改 Tag 的名称与颜色。

#### Scenario: 修改名称
- **WHEN** 用户编辑 Tag 名称为「新名称」
- **THEN** 系统持久化新名称，所有引用该 Tag 的 BBTalk 显示同步更新

#### Scenario: 修改颜色
- **WHEN** 用户从颜色选择器中选取一个颜色
- **THEN** 系统持久化十六进制颜色字符串

### Requirement: 删除标签
系统 SHALL 提供两种删除模式：仅删除标签（解除关联），或同时删除标签与关联的所有 BBTalk。

#### Scenario: 仅删除标签
- **WHEN** 用户选择「仅删除标签」
- **THEN** 系统删除 Tag 与中间表关联，不影响 BBTalk

#### Scenario: 同时删除碎碎念
- **WHEN** 用户选择「同时删除碎碎念」并通过二次确认
- **THEN** 系统删除 Tag 以及所有关联的 BBTalk

#### Scenario: 二次确认避免误操作
- **WHEN** 用户选择「同时删除碎碎念」
- **THEN** 系统弹出二次确认，明确提示「不可恢复」，确认后才执行

### Requirement: 标签排序
系统 SHALL 允许用户通过拖拽或上下按钮调整标签顺序，顺序通过 `sort_order` 字段持久化。

#### Scenario: 调整顺序
- **WHEN** 用户调整 Tag A 与 B 的顺序
- **THEN** 系统更新它们的 `sort_order`，下次列表请求按新顺序返回

### Requirement: 标签计数
系统 SHALL 在标签列表中返回每个 Tag 关联的 BBTalk 数量（`bbtalkCount`）。

#### Scenario: 统计关联数
- **WHEN** 客户端请求标签列表
- **THEN** 每个 Tag 对象包含 `bbtalkCount` 字段
