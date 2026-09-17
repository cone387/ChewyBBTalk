## Why

批量附件部分失败会丢失成功项的界面状态；发布异常被吞掉会清空输入。小屏附件移除、长内容滚动和弹窗需要补齐验收。

## What Changes

- 每个附件独立显示上传、失败及重试状态，成功项保留。
- 发布失败保留正文、标签、附件和可见性，提供就地反馈。
- 走查小屏、横屏、深色偏好、大字体、长内容和弹窗，修复实际发现的问题。
- 暂不调整阅读与编辑入口，不恢复 PWA。

## Capabilities

### New Capabilities
- `web-attachment-recovery`: Web 附件与发布失败恢复及响应式验收。

### Modified Capabilities
无。

## Impact

- frontend/src/components/BBTalkEditor.tsx、frontend/src/hooks/useAttachmentUploads.ts、frontend/src/services/mediaApi.ts。
- frontend/src/pages/BBTalkPage.tsx、frontend/src/components/ui/Modal.tsx 及必要的样式修复。
- frontend/src/pages/PrivacyLockPage.tsx 同步传播发布错误；frontend/src/pages/DataManagementPage.tsx 修复弹窗选项排列和触摸高度。
- frontend/e2e/、frontend/tests/、ROADMAP.md 和本变更验收记录。无 API 契约或依赖升级。
