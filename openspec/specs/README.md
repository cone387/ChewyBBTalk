# OpenSpec 规格库

> 本目录存放项目所有「已落地」的能力规格（capability specs）。每个子目录代表一个独立能力。

## 当前能力清单

| 能力 | 描述 |
|------|------|
| [bbtalk-content](./bbtalk-content/spec.md) | 碎碎念发布、编辑、删除、可见性、置顶、附件、上下文 |
| [tag-management](./tag-management/spec.md) | 标签 CRUD、颜色、排序、与 BBTalk 关联、删除策略 |
| [comment](./comment/spec.md) | 评论增删查、计数、内联展开 |
| [auth](./auth/spec.md) | 注册、登录、JWT、登出、删除账户、Identity 扩展 |
| [attachment-storage](./attachment-storage/spec.md) | 附件本地 / S3 切换、迁移、用户级配置 |
| [data-portability](./data-portability/spec.md) | 数据导入导出（JSON / ZIP） |
| [privacy-lock](./privacy-lock/spec.md) | 防偷窥锁屏、生物识别、AppState 恢复 |
| [cross-platform-alert](./cross-platform-alert/spec.md) | 跨端弹窗工具，Web 端 iOS 风格自定义 UI |
| [mobile-feed](./mobile-feed/spec.md) | 移动端首页信息流卡片设计与交互 |

## 规格文件结构

每个能力的 `spec.md` 应包含：

- **Purpose** — 该能力存在的目的与价值
- **Requirements** — 一组 `### Requirement: 标题` 段落
  - 每个 Requirement 用陈述句描述系统应当具备的能力（用 SHALL / SHOULD / MUST NOT 等 RFC 2119 关键字）
  - 每个 Requirement 下挂一个或多个 `#### Scenario:` 场景，使用 WHEN / THEN（必要时 AND）句式

## 修改规格的流程

**不要直接修改本目录下的文件**。任何能力变更应通过以下流程：

1. 在 `openspec/changes/<change-name>/` 下创建变更提案
2. 在 `changes/<name>/specs/<capability>/spec.md` 中描述 ADDED / MODIFIED / REMOVED 的 Requirement
3. 实施完成后，将 change 中的规格变更合并到本目录对应的 `spec.md`，并将 change 目录归档到 `changes/archive/`

详见 [../project.md](../project.md) 的 OpenSpec 工作流章节。
