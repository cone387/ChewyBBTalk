# 评论（comment）

> 描述对 BBTalk 的评论增删查能力。

## Purpose

评论让用户对自己的 BBTalk 进行后续补充、思考记录。当前版本评论仅作者本人可见，用于私人笔记追加。

## Requirements

### Requirement: 创建评论
系统 SHALL 允许已认证用户对自己的 BBTalk 添加评论。

#### Scenario: 添加评论
- **WHEN** 作者通过 `POST /api/v1/bbtalk/{uid}/comments/` 提交 `content`
- **THEN** 系统创建 Comment，返回 201 与完整对象，BBTalk 的评论计数 +1

#### Scenario: 拒绝空评论
- **WHEN** `content` 为空或仅空白
- **THEN** 系统返回 400

### Requirement: 列出评论
系统 SHALL 按时间正序返回某 BBTalk 的所有评论。

#### Scenario: 获取评论列表
- **WHEN** 客户端请求 `GET /api/v1/bbtalk/{uid}/comments/`
- **THEN** 返回评论数组，按 `create_time` 升序

### Requirement: 删除评论
系统 SHALL 仅允许评论作者删除自己的评论。

#### Scenario: 作者删除
- **WHEN** 作者调用 `DELETE /api/v1/bbtalk/{bbtalkUid}/comments/{commentUid}/`
- **THEN** 系统物理删除评论，BBTalk 评论计数 -1，返回 204

#### Scenario: 非作者尝试删除
- **WHEN** 其他用户尝试删除非自己的评论
- **THEN** 返回 403 Forbidden

### Requirement: 内联展开
客户端 SHALL 在 BBTalk 卡片下内联展示评论，最多默认展示 3 条，超出后提供「展开全部」。

#### Scenario: 折叠展示
- **WHEN** BBTalk 评论数 > 3
- **THEN** 默认仅渲染前 3 条，提供「展开全部」按钮

#### Scenario: 评论数为 0 时不渲染
- **WHEN** BBTalk 没有评论
- **THEN** 不渲染评论区组件

### Requirement: 评论计数同步
当评论增删时，客户端 SHALL 通过 Redux store action（`incrementCommentCount` / `decrementCommentCount`）同步更新 BBTalk 列表中的计数。

#### Scenario: 删除后计数减一
- **WHEN** 用户删除一条评论
- **THEN** 卡片上的评论计数立即从 N 变为 N-1
