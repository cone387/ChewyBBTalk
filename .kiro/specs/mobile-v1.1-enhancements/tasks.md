# 实施计划：ChewyBBTalk Mobile v1.1 增强

## 概述

本实施计划将设计文档中的 5 项增强功能拆解为可执行的编码任务。每个任务递增构建，确保无孤立代码。任务按功能模块组织，测试任务紧跟实现任务以尽早发现问题。

技术栈：TypeScript + Expo SDK 54 + React Native 0.81 + Redux Toolkit

## 任务

- [x] 1. 分享功能（ShareService）
  - [x] 1.1 创建 ShareService 模块
    - 创建 `mobile/src/services/shareService.ts`
    - 实现 `buildShareText(item: BBTalk): string` 纯函数，组装正文 + 标签文本
    - 实现 `downloadImages(urls: string[]): Promise<string[]>`，使用 `expo-file-system` 下载远程图片到 `cacheDirectory`
    - 实现 `copyToClipboard(text: string): Promise<void>`，调用 `expo-clipboard` 并显示 Alert 提示
    - 实现 `shareBBTalk(item: BBTalk): Promise<void>` 主函数，整合平台判断、图片下载、系统分享面板调用、降级剪贴板复制
    - 处理 Web 平台：优先 `navigator.share`，不可用时直接复制
    - 处理 iOS/Android：使用 `expo-sharing` 分享本地文件（文本+首张图片），失败/取消时降级为剪贴板
    - _需求：1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

  - [x] 1.2 改造 useBBTalkActions 集成 ShareService
    - 修改 `mobile/src/hooks/useBBTalkActions.ts`
    - 将内联的 `shareBBTalk` 方法替换为调用 `ShareService.shareBBTalk`
    - 新增 `isSharing` 状态，分享过程中阻止重复触发
    - 在 `showMenu` 中分享选项调用新的 `shareBBTalk` 方法
    - _需求：1.1, 1.6, 1.7_

  - [x] 1.3 编写 ShareService 属性测试
    - **属性 1：分享文本组装正确性**
    - 使用 `fast-check` 生成随机 BBTalk 对象（随机 content + 0-10 个随机 tag + 随机类型附件）
    - 验证 `buildShareText` 输出包含原始 content、所有 tag 名称（#tagName 格式）、不包含非图片附件信息
    - **验证需求：1.2, 1.5**

  - [x] 1.4 编写 ShareService 单元测试
    - 测试系统分享面板调用（mock expo-sharing）
    - 测试分享失败降级为剪贴板复制
    - 测试 Web 平台使用 Web Share API
    - 测试图片下载失败降级为纯文本分享
    - 测试 isSharing 状态管理（防重复触发）
    - _需求：1.1, 1.3, 1.6, 1.7, 1.8_

- [x] 2. 检查点 — 分享功能验证
  - 确保所有测试通过，如有疑问请询问用户。

- [x] 3. 手势操作（SwipeableBBTalkCard）
  - [x] 3.1 创建 SwipeableBBTalkCard 组件
    - 创建 `mobile/src/components/SwipeableBBTalkCard.tsx`
    - 使用 `PanResponder` + `Animated.Value` 实现水平滑动手势识别
    - 左滑超过 80px 显示红色"删除"操作区域（Ionicons trash 图标 + 文字）
    - 右滑超过 80px 显示蓝色"置顶/取消置顶"操作区域（Ionicons pin 图标 + 文字）
    - 释放时超过 120px 或速度 > 0.5 执行对应操作（调用 `onDelete` / `onTogglePin`）
    - 未超过阈值时使用 `Animated.spring` 弹性回弹到原始位置
    - 使用 `useNativeDriver: true` 确保 60fps 动画
    - 通过 `openSwipeRef` 实现同一时刻只有一张卡片展开的约束
    - `batchMode` 为 true 时禁用滑动手势，显示圆形复选框
    - `onMoveShouldSetPanResponder` 中判断水平位移 > 垂直位移 * 1.5，避免与 FlatList 滚动冲突
    - 内部渲染 `BBTalkCard`，传递所有原有 props
    - _需求：2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 3.2 在 HomeScreen 中集成 SwipeableBBTalkCard
    - 修改 `mobile/src/screens/HomeScreen.tsx`
    - 将 FlatList 的 `renderItem` 中的 `BBTalkCard` 替换为 `SwipeableBBTalkCard`
    - 新增 `openSwipeRef = useRef<(() => void) | null>(null)` 管理卡片展开状态
    - 传递 `onDelete={actions.handleDelete}` 和 `onTogglePin` 回调（调用 `dispatch(togglePinAsync(item.id))`）
    - 传递 `batchMode` 和 `selected` 状态（暂时为 false，批量操作任务中接入）
    - _需求：2.1, 2.2, 2.3, 2.4, 2.6_

  - [x] 3.3 编写 SwipeableBBTalkCard 单元测试
    - 测试左滑超过阈值触发 onDelete 回调
    - 测试右滑超过阈值触发 onTogglePin 回调
    - 测试未超过阈值时弹性回弹（Animated.spring 调用）
    - 测试同一时刻只有一张卡片展开（openSwipeRef 机制）
    - 测试批量模式下禁用手势
    - _需求：2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [x] 4. 检查点 — 手势操作验证
  - 确保所有测试通过，如有疑问请询问用户。

- [x] 5. Markdown 编辑实时预览
  - [x] 5.1 提取共享 Markdown 样式工具函数
    - 创建 `mobile/src/utils/markdownStyles.ts`
    - 实现 `getMarkdownStyles(colors: ThemeColors): Record<string, any>` 函数
    - 从 `BBTalkCard.tsx` 中提取现有的 Markdown 样式对象（body、heading1-3、strong、em、blockquote、code_inline、fence、code_block、link、list_item、paragraph）
    - 接收 `ThemeColors` 参数，自动适配当前主题配色
    - _需求：3.5, 3.6_

  - [x] 5.2 改造 BBTalkCard 使用共享样式
    - 修改 `mobile/src/components/BBTalkCard.tsx`
    - 将内联的 Markdown 样式对象替换为调用 `getMarkdownStyles(theme.colors)`
    - 确保渲染效果与改造前完全一致
    - _需求：3.5_

  - [x] 5.3 在 ComposeScreen 中实现编辑/预览模式切换
    - 修改 `mobile/src/screens/ComposeScreen.tsx`
    - 新增 `editMode: 'edit' | 'preview'` 状态，默认 `'edit'`
    - 在 Header 区域（取消按钮和发布按钮之间）新增模式切换按钮（编辑图标 `create-outline` / 预览图标 `eye-outline`）
    - 预览模式下用 `ScrollView` + `Markdown` 组件（使用 `getMarkdownStyles`）替换 `TextInput`
    - 预览模式下隐藏底部工具栏
    - 切换回编辑模式时保持 `content` 和 `cursorPos` 不变
    - 空内容时预览区显示"暂无内容可预览"占位文字
    - 使用 `useTheme()` 获取当前主题配色传递给 `getMarkdownStyles`
    - _需求：3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 5.4 编写 getMarkdownStyles 属性测试
    - **属性 3：Markdown 样式主题适配一致性**
    - 使用 `fast-check` 生成随机 ThemeColors 对象（随机颜色字符串）
    - 验证 `body.color === colors.text`、`code_inline.backgroundColor === colors.borderLight`、`blockquote.borderLeftColor === colors.border`、`link.color === colors.primary`、`fence.backgroundColor === colors.borderLight`
    - **验证需求：3.5, 3.6**

  - [x] 5.5 编写 ComposeScreen 预览模式单元测试
    - **属性 2：编辑/预览模式切换 round-trip**
    - 使用 `fast-check` 生成随机 content 字符串 + 随机 cursorPos
    - 验证切换到预览再切换回编辑后 content 和 cursorPos 不变
    - 测试模式切换按钮存在且可点击
    - 测试预览模式渲染 Markdown 组件
    - 测试空内容显示"暂无内容可预览"占位文字
    - **验证需求：3.1, 3.2, 3.4, 3.7**

- [x] 6. 检查点 — Markdown 预览验证
  - 确保所有测试通过，如有疑问请询问用户。

- [x] 7. 批量操作
  - [x] 7.1 创建 useBatchMode Hook
    - 创建 `mobile/src/hooks/useBatchMode.ts`
    - 实现 `enterBatchMode(initialId)` — 激活批量模式并选中初始 BBTalk
    - 实现 `exitBatchMode()` — 退出批量模式，清空 `selectedIds`，重置 `batchMode` 为 false
    - 实现 `toggleSelect(id)` — 切换单条 BBTalk 的选中状态
    - 实现 `selectAll(allIds)` — 全选所有 BBTalk
    - 实现 `batchDelete(ids)` — 确认对话框后逐条调用 `bbtalkApi.deleteBBTalk`，显示进度，汇总失败
    - 实现 `batchUpdateTags(ids, tagNames)` — 逐条调用 `bbtalkApi.updateBBTalk` 更新标签
    - 实现 `batchUpdateVisibility(ids, visibility)` — 逐条调用 `bbtalkApi.updateBBTalk` 更新可见性
    - 管理 `isExecuting` 和 `progress` 状态，操作中禁用工具栏
    - _需求：4.1, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

  - [x] 7.2 创建 BatchToolbar 组件
    - 创建 `mobile/src/components/BatchToolbar.tsx`
    - 显示已选数量计数（"已选 N 条"）
    - 包含"全选"、"删除"、"改标签"、"改可见性"按钮
    - 包含关闭按钮（退出批量模式）
    - 操作执行中显示进度指示器（"N/M"）并禁用所有按钮
    - 适配当前主题配色
    - _需求：4.3, 4.10_

  - [x] 7.3 创建 TagPickerModal 和 VisibilityPickerModal 组件
    - 创建 `mobile/src/components/TagPickerModal.tsx`
    - 显示所有可用标签列表，支持多选，确认后回调 `onConfirm(selectedTagNames)`
    - 创建 `mobile/src/components/VisibilityPickerModal.tsx`
    - 显示公开/私密/好友三个选项，选择后回调 `onConfirm(visibility)`
    - 两个 Modal 均适配当前主题配色
    - _需求：4.6, 4.7_

  - [x] 7.4 在 HomeScreen 中集成批量操作
    - 修改 `mobile/src/screens/HomeScreen.tsx`
    - 引入 `useBatchMode` hook
    - 在 BBTalkCard（SwipeableBBTalkCard）上添加 `onLongPress` 回调，500ms 后调用 `enterBatchMode`
    - 批量模式下在列表顶部显示 `BatchToolbar`
    - 批量模式下传递 `batchMode=true`、`selected`、`onSelect` 给 `SwipeableBBTalkCard`
    - 批量模式下禁用 FAB 按钮和语音录制
    - "删除"按钮点击时显示确认对话框，确认后调用 `batchDelete`
    - "改标签"按钮点击时显示 `TagPickerModal`，确认后调用 `batchUpdateTags`
    - "改可见性"按钮点击时显示 `VisibilityPickerModal`，确认后调用 `batchUpdateVisibility`
    - 操作完成后调用 `onRefresh` 刷新列表
    - 系统返回键（Android `BackHandler`）退出批量模式
    - _需求：4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

  - [x] 7.5 编写 useBatchMode 属性测试
    - **属性 4：全选操作正确性** — 随机 id 列表，验证 `selectAll` 后 `selectedIds` 包含所有 id
    - **属性 5：退出批量模式清空状态** — 随机已选中 id 集合，验证 `exitBatchMode` 后 `batchMode=false`、`selectedIds` 为空
    - **属性 6：批量操作失败汇总正确性** — 随机 N 条操作 + 随机 M 条失败，验证汇总数量正确
    - **验证需求：4.4, 4.8, 4.9**

  - [x] 7.6 编写批量操作组件单元测试
    - 测试长按 500ms 激活批量模式
    - 测试批量模式下显示复选框和工具栏
    - 测试批量删除确认对话框
    - 测试操作过程中进度指示器和按钮禁用
    - _需求：4.1, 4.2, 4.3, 4.10_

- [x] 8. 检查点 — 批量操作验证
  - 确保所有测试通过，如有疑问请询问用户。

- [x] 9. 离线缓存
  - [x] 9.1 安装离线缓存依赖
    - 在 `mobile/` 目录下安装 `expo-sqlite` 和 `@react-native-community/netinfo`
    - 验证依赖安装成功并更新 `package.json`
    - _需求：5.1_

  - [x] 9.2 创建 OfflineCacheService 模块
    - 创建 `mobile/src/services/offlineCacheService.ts`
    - 实现 `initCacheDB()` — 使用 `expo-sqlite` 创建 `bbtalks` 表（`id TEXT PRIMARY KEY, data TEXT, synced_at TEXT`）和 `meta` 表（`key TEXT PRIMARY KEY, value TEXT`）
    - 实现 `cacheBBTalks(bbtalks)` — 事务批量写入，先清空再插入（全量替换）
    - 实现 `getCachedBBTalks()` — 读取所有行并 JSON.parse 反序列化，损坏数据跳过并 logError
    - 实现 `clearCache()` — 清除 `bbtalks` 表和 `meta` 表所有数据
    - 实现 `getLastSyncTime()` / `setLastSyncTime(timestamp)` — 读写 `meta` 表中的 `last_sync_time`
    - _需求：5.1, 5.4, 5.9, 5.10_

  - [x] 9.3 创建 useOfflineCache Hook
    - 创建 `mobile/src/hooks/useOfflineCache.ts`
    - 使用 `@react-native-community/netinfo` 监听网络状态变化，维护 `isOffline` 状态
    - 实现 `initCache()` — App 启动时调用 `initCacheDB()`
    - 实现 `loadCachedData()` — 从 SQLite 读取缓存 BBTalk 列表
    - 实现 `syncToCache(bbtalks)` — 将最新数据写入缓存并更新 `lastSyncTime`
    - 维护 `lastSyncTime` 状态
    - _需求：5.1, 5.2, 5.3, 5.9_

  - [x] 9.4 创建 OfflineBanner 组件
    - 创建 `mobile/src/components/OfflineBanner.tsx`
    - 显示"离线模式 · 最后同步于 XX 分钟前"提示条
    - 使用主题 accent 色作为背景
    - 根据 `lastSyncTime` 计算相对时间显示
    - _需求：5.6, 5.9_

  - [x] 9.5 在 HomeScreen 中集成离线缓存
    - 修改 `mobile/src/screens/HomeScreen.tsx`
    - 引入 `useOfflineCache` hook
    - App 启动时调用 `initCache()`，然后 `loadCachedData()` 填充 Redux Store
    - API 请求成功后调用 `syncToCache(bbtalks)` 更新缓存
    - 离线时在 FlatList 的 `ListHeaderComponent` 中显示 `OfflineBanner`
    - 离线时禁用下拉刷新（`RefreshControl` 的 `enabled={!isOffline}`）和无限滚动加载
    - 离线状态下用户尝试写操作（点击 FAB、编辑、删除等）时显示提示"当前处于离线模式，该操作需要网络连接"
    - _需求：5.2, 5.3, 5.6, 5.7, 5.8_

  - [x] 9.6 在数据管理页面集成清除缓存
    - 修改 `mobile/src/screens/DataManagementScreen.tsx`
    - 添加"清除离线缓存"按钮，点击后调用 `OfflineCacheService.clearCache()`
    - 清除成功后显示提示
    - _需求：5.10_

  - [x] 9.7 编写 OfflineCacheService 属性测试
    - **属性 7：离线缓存 round-trip** — 随机 BBTalk 列表（0-50 条，含随机 tags/attachments），验证 `cacheBBTalks` 写入后 `getCachedBBTalks` 读取结果语义等价
    - **属性 8：清除缓存正确性** — 随机非空缓存状态，验证 `clearCache` 后 `getCachedBBTalks` 返回空列表、`getLastSyncTime` 返回 null
    - **验证需求：5.1, 5.10**

  - [x] 9.8 编写离线缓存单元测试
    - 测试网络不可用时显示离线提示条
    - 测试离线模式禁用刷新和加载更多
    - 测试离线状态下写操作提示
    - 测试 cache-first 策略（先缓存后 API）
    - 测试最后同步时间戳显示
    - _需求：5.2, 5.3, 5.6, 5.7, 5.8, 5.9_

- [x] 10. 最终检查点 — 全部功能验证
  - 确保所有测试通过，如有疑问请询问用户。

## 备注

- 标记 `*` 的任务为可选测试任务，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号，确保需求可追溯
- 检查点任务确保增量验证，避免问题累积
- 属性测试验证核心纯函数和状态管理逻辑的通用正确性
- 单元测试验证特定场景、边界条件和 UI 交互行为
- 所有新增文件遵循项目现有的目录结构和代码风格
