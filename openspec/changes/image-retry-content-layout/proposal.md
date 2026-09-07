## Why

图片失败后的重试没有改变请求 effect 的依赖，因此只显示加载状态却不会重新请求；自定义占位图没有恢复入口。长链接、无语言代码块和宽表格缺少统一的响应式约束。

## What Changes

- 图片失败后可通过键盘或触摸重新加载，下载完成后以图片解码结果判断成功。
- 保留自定义错误占位图并提供重试，失效缓存可重新获取。
- 长文字换行、代码和表格局部滚动，并增加小屏浏览器回归。
- 保持现有阅读/编辑入口与主题边界，不增加 PWA。

## Capabilities

### New Capabilities
- `web-media-rendering`: 图片恢复与长内容响应式显示。

### Modified Capabilities
无。

## Impact

frontend/src/components/CachedImage.tsx、frontend/src/components/MarkdownRenderer.tsx、frontend/src/services/cache/imageCache.ts（如需缓存失效修复）、frontend/tests/、frontend/e2e/、ROADMAP.md。无 API 或依赖变更。
