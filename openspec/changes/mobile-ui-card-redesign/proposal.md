## Why

当前移动端首页 Feed 流的卡片样式和标签栏与目标设计（简洁卡片式 + 横向分类标签 pill 样式）存在差距。需要将 UI 对齐到更干净、现代的卡片布局风格：去掉卡片标题，标签从内联移至底部栏显示为彩色药丸，标签栏从下划线切换为 pill 按钮高亮，Header 精简为仅菜单+搜索图标，整体更加留白和简约。

## What Changes

- **Header 精简**: 移除中间标题文字"碎碎念"，仅保留左侧汉堡菜单按钮和右侧搜索图标
- **TagTabs 样式重做**: 当前激活标签从下划线指示器改为蓝色圆角 pill 按钮（白色文字），未激活标签为纯文字
- **BBTalkCard 卡片重构**:
  - 移除卡片内 title 显示
  - Markdown blockquote 区域改为浅灰色圆角背景块（非左边框样式）
  - 底部栏重新布局：左侧显示彩色标签 pill + 相对时间，右侧显示定位图标、评论图标（带计数）、分享/地球图标
  - 三点菜单保持右上角位置
  - 增加卡片间距，更大的圆角和更柔和的阴影
- **FAB 样式微调**: 白色圆形背景 + 蓝色 "+" 图标，带阴影

## Capabilities

### New Capabilities
- `card-feed-redesign`: 卡片 Feed 流 UI 重构，覆盖 HomeScreen Header、TagTabs、BBTalkCard、FAB 的样式和布局调整

### Modified Capabilities

## Impact

- `mobile/src/screens/HomeScreen.tsx` - Header 布局精简、TagTabs 显示逻辑
- `mobile/src/components/TagTabs.tsx` - 标签栏样式从下划线改为 pill 按钮
- `mobile/src/components/BBTalkCard.tsx` - 卡片布局重构：移除标题、底部栏重排、blockquote 样式
- `mobile/src/theme/ThemeContext.tsx` - 可能需要新增或调整颜色 token
- 无 API 变更，纯前端 UI 层面修改
