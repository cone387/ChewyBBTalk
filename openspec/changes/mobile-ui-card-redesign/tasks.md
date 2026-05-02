## 1. Header 精简

- [x] 1.1 在 HomeScreen.tsx 中移除 Header 中间的标题文字"碎碎念"和筛选 badge，仅保留左侧菜单按钮和右侧搜索图标

## 2. TagTabs pill 按钮样式

- [x] 2.1 修改 TagTabs.tsx 激活状态样式：添加蓝色背景色（primary）+ borderRadius: 20 + 白色文字
- [x] 2.2 移除 TagTabs.tsx 底部下划线指示器（tagTabIndicator）
- [x] 2.3 调整未激活标签文字颜色为灰色（textSecondary）

## 3. BBTalkCard 布局重构

- [x] 3.1 从 BBTalkCard.tsx 内容区域移除内联标签行（tagRow），标签改到 footer 显示
- [x] 3.2 重构 footer 左侧：显示第一个标签的彩色 pill + 相对时间文本，移除设备图标
- [x] 3.3 调整 footer 右侧图标顺序：定位图标 → 评论图标（带计数）→ 地球/可见性图标
- [x] 3.4 增大卡片间距 marginTop 至 16，降低 shadowOpacity 至 0.03，增大 shadowRadius 至 10

## 4. Blockquote 样式

- [x] 4.1 修改 markdownStyles 中 blockquote 样式：移除左边框，改为浅灰色（#F3F4F6）圆角（borderRadius: 8）全背景填充

## 5. FAB 样式

- [x] 5.1 修改 HomeScreen.tsx 中 FAB 样式：白色圆形背景 + 蓝色 "+" 图标 + 阴影
