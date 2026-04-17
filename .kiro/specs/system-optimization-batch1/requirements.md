# 需求文档：ChewyBBTalk 系统优化（第一批）

## 简介

本文档覆盖 ChewyBBTalk 系统第一批高优先级优化项，包含 5 个需求：Mobile HomeScreen 组件拆分、Web 前端删除撤销与骨架屏、统一错误处理、Mobile 客户端版本检测更新、列表性能优化。所有优化旨在提升代码可维护性、用户体验和运行性能。

## 术语表

- **HomeScreen**：Mobile 端首页屏幕组件，当前位于 `mobile/src/screens/HomeScreen.tsx`，包含碎碎念列表、搜索、防窥模式、标签切换等全部逻辑
- **BBTalkCard**：拆分后的单条碎碎念卡片组件，负责渲染一条 BBTalk 的内容、附件、标签和底部信息
- **PrivacyLockOverlay**：拆分后的防窥锁定遮罩组件，负责锁定界面、密码输入和生物识别解锁
- **SearchBar**：拆分后的搜索栏组件，包含搜索输入框和搜索历史面板
- **TagTabs**：拆分后的标签快捷切换栏组件，显示水平滚动的标签列表
- **usePrivacyMode_Hook**：拆分后的防窥模式自定义 Hook，封装倒计时、锁定/解锁、设置加载等逻辑
- **UndoToast**：Mobile 端已有的底部撤销提示条组件，删除操作后显示"已删除"文案和"撤销"按钮
- **Web_UndoToast**：Web 前端新建的撤销提示条组件，功能对标 Mobile 端 UndoToast
- **SkeletonCard**：Mobile 端已有的骨架屏占位卡片组件，使用脉冲动画模拟加载态
- **Web_SkeletonCard**：Web 前端新建的骨架屏组件，使用 CSS 动画实现加载占位
- **BBTalkPage**：Web 前端碎碎念主页面组件，位于 `frontend/src/pages/BBTalkPage.tsx`
- **ErrorHandler**：Mobile 端统一错误处理工具模块
- **VersionChecker**：Mobile 端版本检测更新模块
- **FlatList**：React Native 提供的高性能列表组件，用于渲染碎碎念列表

## 需求

### 需求 1：Mobile HomeScreen 组件拆分

**用户故事：** 作为开发者，我希望将 952 行的 HomeScreen.tsx 拆分为独立的子组件和 Hook，以便提升代码可读性和可维护性。

#### 验收标准

1. WHEN HomeScreen 完成拆分后，THE HomeScreen SHALL 将单条碎碎念卡片的渲染逻辑提取为独立的 BBTalkCard 组件，存放于 `mobile/src/components/BBTalkCard.tsx`
2. WHEN HomeScreen 完成拆分后，THE HomeScreen SHALL 将防窥锁定遮罩的 UI 和交互逻辑提取为独立的 PrivacyLockOverlay 组件，存放于 `mobile/src/components/PrivacyLockOverlay.tsx`
3. WHEN HomeScreen 完成拆分后，THE HomeScreen SHALL 将搜索栏和搜索历史面板提取为独立的 SearchBar 组件，存放于 `mobile/src/components/SearchBar.tsx`
4. WHEN HomeScreen 完成拆分后，THE HomeScreen SHALL 将标签快捷切换栏提取为独立的 TagTabs 组件，存放于 `mobile/src/components/TagTabs.tsx`
5. WHEN HomeScreen 完成拆分后，THE HomeScreen SHALL 将防窥模式的倒计时、锁定/解锁、设置加载等逻辑提取为独立的 usePrivacyMode Hook，存放于 `mobile/src/hooks/usePrivacyMode.ts`
6. WHEN 拆分完成后，THE HomeScreen SHALL 通过 import 引用上述子组件和 Hook 来组合完整页面，保持与拆分前完全一致的功能和 UI 表现
7. WHEN 拆分完成后，THE HomeScreen 的总行数 SHALL 低于 300 行

### 需求 2：Web 前端删除撤销与骨架屏

**用户故事：** 作为 Web 端用户，我希望删除碎碎念后有撤销机会，并在列表加载时看到骨架屏占位，以获得与 Mobile 端一致的体验。

#### 验收标准

1. WHEN 用户在 Web 端确认删除一条碎碎念时，THE BBTalkPage SHALL 立即从列表中移除该条目（乐观删除），并在页面底部显示 Web_UndoToast 提示条
2. WHILE Web_UndoToast 显示期间（3 秒内），THE Web_UndoToast SHALL 提供"撤销"按钮，点击后恢复被删除的条目到原始位置
3. WHEN Web_UndoToast 的 3 秒倒计时结束且用户未点击撤销时，THE BBTalkPage SHALL 发送 API 请求执行真正的删除操作
4. IF API 删除请求失败，THEN THE BBTalkPage SHALL 将被删除的条目恢复到列表中，并向用户显示错误提示
5. WHEN Web 端碎碎念列表处于首次加载状态且数据尚未返回时，THE BBTalkPage SHALL 显示 Web_SkeletonCard 骨架屏占位卡片（至少 3 张）
6. WHEN 数据加载完成后，THE BBTalkPage SHALL 将骨架屏替换为实际的碎碎念列表内容

### 需求 3：Mobile 端统一错误处理

**用户故事：** 作为 Mobile 端用户，我希望在操作失败时看到明确的错误提示，而不是操作无响应地静默失败。

#### 验收标准

1. THE ErrorHandler SHALL 提供统一的错误处理函数，接收错误对象并根据错误类型（网络错误、服务器错误、认证错误等）生成用户可读的中文提示信息
2. THE ErrorHandler SHALL 提供 `showError` 函数，以 Alert 弹窗形式向用户展示错误信息，并附带"复制"按钮以便用户复制错误详情
3. WHEN 网络请求失败且错误被 catch 捕获时，THE ErrorHandler SHALL 将错误信息展示给用户，替代静默吞错（`catch {}`）的行为
4. IF 错误属于认证过期类型，THEN THE ErrorHandler SHALL 提示用户重新登录
5. WHEN ErrorHandler 替换现有的静默 catch 块时，THE ErrorHandler SHALL 保留对非关键操作（如缓存清理、日志记录）的静默处理，仅对用户可感知的操作添加错误反馈
6. THE ErrorHandler SHALL 对所有捕获的错误输出 `console.warn` 日志，便于开发调试

### 需求 4：Mobile 客户端版本检测更新

**用户故事：** 作为 Mobile 端用户，我希望 App 启动时自动检查是否有新版本，以便及时获取最新功能和修复。

#### 验收标准

1. WHEN App 启动完成并进入首页时，THE VersionChecker SHALL 在后台检查是否有可用的新版本
2. WHEN 检测到 OTA 更新可用时（通过 expo-updates），THE VersionChecker SHALL 静默下载更新，并在下载完成后提示用户重启 App 以应用更新
3. WHEN 检测到 App Store 或 Google Play 有新版本可用时，THE VersionChecker SHALL 显示更新提示弹窗，包含"前往更新"和"稍后提醒"两个选项
4. WHEN 用户点击"前往更新"时，THE VersionChecker SHALL 打开对应平台的应用商店页面（iOS 打开 App Store，Android 打开 Google Play）
5. WHEN 用户点击"稍后提醒"时，THE VersionChecker SHALL 关闭弹窗，并在 24 小时内不再重复提示
6. IF 版本检测过程中发生网络错误或其他异常，THEN THE VersionChecker SHALL 静默忽略错误，不影响用户正常使用 App

### 需求 5：列表性能优化

**用户故事：** 作为 Mobile 端用户，我希望碎碎念列表滚动流畅、无卡顿，以获得良好的浏览体验。

#### 验收标准

1. THE HomeScreen SHALL 使用 `useCallback` 包裹传递给 FlatList 的 `renderItem` 函数，避免每次渲染时创建新的函数引用
2. THE BBTalkCard SHALL 使用 `React.memo` 进行包裹，仅在 props 发生实际变化时重新渲染
3. THE BBTalkCard 的 `React.memo` SHALL 使用自定义比较函数，基于 BBTalk 的 `id`、`content`、`updatedAt`、`isPinned`、`visibility`、`tags` 和 `attachments` 字段进行浅比较
4. THE HomeScreen SHALL 使用 `useCallback` 包裹所有传递给子组件的回调函数（如 `showMenu`、`toggleVisibility`、`handleDelete` 等），避免因回调引用变化导致子组件不必要的重渲染
5. WHEN 列表数据未发生变化时，THE FlatList 的 `renderItem` 对同一条 BBTalk 的渲染次数 SHALL 不超过 1 次
