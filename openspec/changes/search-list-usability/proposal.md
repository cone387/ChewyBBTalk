## Why

已有关键词、标签、日期和附件筛选，但移动端关闭筛选弹窗后难以确认当前条件，清除操作遗漏标签，正文也没有命中提示。记录量增长后的查询成本尚缺少可复现测量。

## What Changes

- 列表上方显示全部生效条件，支持单独移除和全部清除，空结果提示与条件一致。
- Markdown 可见正文高亮搜索词，保持链接、代码与安全渲染。
- 在隔离数据库测量代表性记录量下的 API 分页和搜索，记录查询数与耗时；按证据修复瓶颈并验证权限、计数与分页行为。
- 桌面、小屏自动回归；不改变阅读编辑入口，不恢复 PWA。

## Capabilities

### New Capabilities
- `search-list-usability`: 可见且可清除的筛选状态、搜索高亮与可复现列表性能测量。

### Modified Capabilities

无。

## Impact

frontend/src/pages/BBTalkPage.tsx、components/MarkdownRenderer.tsx、搜索高亮工具和测试、e2e/search-filters.spec.ts；backend/chewy_space/bbtalk/views.py（仅按测量结果优化）、backend/benchmark_feed.py 与对应回归；docs/search-list-performance.md。保留现有 API 查询参数，无新增运行依赖。
