## Context

ChewyBBTalk 移动端 (React Native / Expo) 当前已有完整的 Feed 流 UI，包含 HomeScreen、TagTabs、BBTalkCard、FAB 等组件。现需将 UI 对齐到截图中展示的简洁卡片风格。当前代码结构良好，改动集中在样式层面，无需改变数据模型或 API。

**当前状态**:
- Header: 菜单按钮 + "碎碎念"标题 + 搜索图标
- TagTabs: 下划线指示器样式
- BBTalkCard: 标签内联显示在内容下方，footer 左侧时间+设备图标，右侧评论+可见性图标
- FAB: 已有蓝色按钮

**目标状态（参照截图）**:
- Header: 仅菜单按钮 + 搜索图标，无标题
- TagTabs: 激活项为蓝色圆角 pill 按钮（白色文字），未激活为灰色纯文字
- BBTalkCard: 无标题，blockquote 浅灰圆角背景，footer 左侧彩色标签pill+时间，右侧定位+评论+地球图标
- FAB: 白底蓝色"+"图标，圆形阴影

## Goals / Non-Goals

**Goals:**
- 将 HomeScreen header、TagTabs、BBTalkCard、FAB 对齐到目标截图的视觉风格
- 保持现有功能完整性（点击编辑、三点菜单、评论、可见性切换、图片预览等）
- 保持组件 API 不变，仅调整内部样式和布局

**Non-Goals:**
- 不修改后端 API 或数据模型
- 不新增功能特性（如新的筛选、排序等）
- 不涉及 DrawerContent、ComposeScreen 等其他页面的样式调整
- 不修改深色模式主题（本次仅聚焦浅色模式）

## Decisions

### 1. Header 精简方案
**选择**: 直接在 HomeScreen 中隐藏标题 Text 和筛选 badge，保留菜单按钮和搜索图标
**理由**: 改动最小，仅需调整 JSX 条件渲染或删除标题元素，不影响搜索和菜单功能

### 2. TagTabs pill 按钮样式
**选择**: 激活状态使用 `backgroundColor: primary` + `borderRadius: 20` + 白色文字，移除底部下划线指示器
**理由**: 直接匹配截图中的 pill 按钮风格。保留 ScrollView 横向滚动机制不变

### 3. BBTalkCard footer 重排
**选择**: footer 左侧放置第一个标签 pill（彩色背景+白色文字）+ 相对时间文本，右侧放置定位图标、评论图标（带计数）、地球/可见性图标
**理由**: 匹配截图布局。标签从内容区域移至 footer，仅显示第一个标签（如有多个则用省略表示），保持卡片内容区域整洁

### 4. Blockquote 样式
**选择**: 修改 markdownStyles 中的 blockquote 样式，从左边框改为浅灰色（#F3F4F6）圆角（borderRadius: 8）全背景填充
**理由**: 匹配截图中 blockquote 的视觉表现

### 5. 卡片间距与阴影
**选择**: 增大 `marginTop` 到 16，`shadowOpacity` 降低到 0.03，`shadowRadius` 增大到 10，整体更柔和
**理由**: 匹配截图中卡片间更大留白和更柔和阴影的风格

## Risks / Trade-offs

- **[多标签显示丢失]** → footer 仅显示第一个标签 pill；如需查看全部标签，仍可点击进入编辑。可考虑后续增加标签展开交互
- **[深色模式未覆盖]** → 本次仅调整浅色模式样式值。深色模式下的 pill 按钮颜色等可能需后续优化
- **[设备图标移除]** → 截图中 footer 无设备图标，移除后用户无法从卡片直接判断发布设备来源，但这是次要信息
