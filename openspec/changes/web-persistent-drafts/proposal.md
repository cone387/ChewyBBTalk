## Why

Web 当前仅在组件内保留输入，刷新、导航或浏览器关闭会丢失记录和待重试文件。需要将已有失败恢复能力延伸到持久草稿。

## What Changes

- 自动保存新建及编辑草稿，恢复正文、标签、可见性、附件和未完成文件。
- 按服务器、用户及编辑记录隔离；发布成功删除对应草稿，提供明确清除入口。
- 显示保存/恢复/失败状态，未落盘时关闭页面提醒；内部导航保留草稿。
- 不自动提交、不调整阅读编辑入口；真机验收由用户后续反馈。

## Capabilities

### New Capabilities
- `web-persistent-drafts`: 本地持久草稿及恢复交互。

### Modified Capabilities
无。

## Impact

frontend/src/services/drafts.ts、frontend/src/hooks/usePersistentDraft.ts、frontend/src/hooks/useAttachmentUploads.ts、frontend/src/components/BBTalkEditor.tsx、frontend/tests/、frontend/e2e/、ROADMAP.md。使用已有 idb 依赖，无后端 API 变更。
