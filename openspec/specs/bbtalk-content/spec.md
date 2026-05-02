# 碎碎念内容（bbtalk-content）

> 描述用户发布、编辑、查看、删除「碎碎念（BBTalk）」的核心能力。

## Purpose

BBTalk 是本系统的核心内容实体，承载用户的 Markdown 内容、附件、标签、上下文信息等。该能力规定了 BBTalk 的数据模型、生命周期与可见性策略。

## Requirements

### Requirement: 创建 BBTalk
系统 SHALL 允许已认证用户创建 BBTalk，必须包含非空 `content`，可选附带 `tags`、`attachments`、`context`、`visibility`。

#### Scenario: 创建公开 BBTalk
- **WHEN** 已认证用户提交 `{ content: "今天天气真好", visibility: "public" }`
- **THEN** 系统持久化 BBTalk，分配 22 位 base64 `uid`，返回 201 与完整对象，记录 `create_time`/`update_time`

#### Scenario: 创建带附件的 BBTalk
- **WHEN** 用户提交内容并携带已上传的附件元信息列表
- **THEN** `attachments` JSON 字段保存完整附件信息（uid/url/type/name/size 等）

#### Scenario: 拒绝空内容
- **WHEN** 用户提交 `content` 为空或仅含空白
- **THEN** 系统返回 400，提示「请输入内容」

### Requirement: 编辑 BBTalk
系统 SHALL 允许 BBTalk 作者修改已发布的内容、标签、附件、可见性、置顶状态，并刷新 `update_time`。

#### Scenario: 作者编辑自己的 BBTalk
- **WHEN** 作者向 `PATCH /api/v1/bbtalk/{uid}/` 提交修改
- **THEN** 字段更新，`update_time` 刷新，列表排序按新时间反映

#### Scenario: 非作者尝试编辑
- **WHEN** 其他已认证用户尝试修改非自己拥有的 BBTalk
- **THEN** 系统返回 403 Forbidden

### Requirement: 删除 BBTalk
系统 SHALL 允许作者删除自己的 BBTalk，删除时同时清理关联评论与标签关系。

#### Scenario: 作者删除
- **WHEN** 作者调用 `DELETE /api/v1/bbtalk/{uid}/`
- **THEN** 系统物理删除该 BBTalk 及其评论与标签关系，返回 204

### Requirement: 可见性控制
系统 SHALL 支持 `public` 与 `private` 两种可见性，默认为 `private`。

#### Scenario: 公开列表只展示 public
- **WHEN** 未认证用户请求 `/api/v1/bbtalk/public/`
- **THEN** 仅返回 `visibility=public` 的 BBTalk

#### Scenario: 作者可见所有自己的内容
- **WHEN** 作者请求自己的列表
- **THEN** 返回 public + private 全部内容

### Requirement: 置顶
系统 SHALL 支持作者将 BBTalk 标记为置顶，置顶项在列表中优先于普通项展示。

#### Scenario: 列表排序
- **WHEN** 列表渲染
- **THEN** 排序规则为 `(-is_pinned, -update_time)`，置顶项始终在顶部

### Requirement: 上下文信息
系统 SHALL 在 `context` JSONField 中保存可选的位置（GPS）、天气、设备信息，用于丰富展示。

#### Scenario: 携带位置信息
- **WHEN** 移动端用户发布时启用了「附加位置」
- **THEN** `context.location = { latitude, longitude }` 被持久化，前端可在卡片中渲染地图链接

### Requirement: Markdown 渲染
客户端 SHALL 将 `content` 视为 Markdown 渲染，支持代码块、列表、链接、加粗、斜体等基础语法。

#### Scenario: 渲染代码块
- **WHEN** 内容包含三个反引号包围的代码块
- **THEN** 客户端使用等宽字体、背景色、语法高亮（如可用）渲染

### Requirement: 标签关联
BBTalk 可关联零个或多个 Tag，关联通过中间表 `cb_bbtalk_tag_relations` 维护。

#### Scenario: 提交标签 uid 列表
- **WHEN** 客户端提交 `tags: ["tag-uid-1", "tag-uid-2"]`
- **THEN** 系统建立 M2M 关联；之前的关联被替换
