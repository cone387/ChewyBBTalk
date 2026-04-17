# 实现计划：ChewyBBTalk 系统优化（第一批）

## 概述

本实现计划将 5 项系统优化需求拆分为可执行的编码任务。采用增量实现策略：先完成 HomeScreen 拆分（需求 1），再实现 Web 端功能补齐（需求 2），接着建立统一错误处理（需求 3），然后添加版本检测（需求 4），最后进行性能优化（需求 5，与需求 1 联动）。每个任务构建在前一个任务的基础上，确保无孤立代码。

## 任务

- [x] 1. 提取 usePrivacyMode Hook
  - [x] 1.1 创建 `mobile/src/hooks/usePrivacyMode.ts`
    - 从 HomeScreen.tsx 中提取防窥模式相关的所有状态（`privacySeconds`、`showCountdown`、`privacyEnabled`、`locked`、`allowComposeWhenLocked`、`biometricAvailable`、`unlockPassword`、`unlocking`）
    - 提取防窥倒计时轮询逻辑（`setInterval` 每秒检查 AsyncStorage）
    - 提取 `loadPrivacySettings`、`handleBiometricUnlock`、`handleUnlock`、`resetPrivacyTimer`、`setLocked` 函数
    - 提取键盘动画逻辑（`lockKeyboardH`）和生物识别检测逻辑
    - Hook 接口遵循设计文档中 `UsePrivacyModeReturn` 的定义
    - Hook 接收 `options: { onLockChange?, showError }` 参数
    - _需求：1.5, 1.6_

  - [x] 1.2 在 HomeScreen 中集成 usePrivacyMode Hook
    - 删除 HomeScreen 中已提取到 Hook 的所有状态声明和逻辑代码（约 150 行）
    - 替换为 `const { locked, privacyEnabled, ... } = usePrivacyMode({ onLockChange, showError })` 调用
    - 确保防窥功能行为与拆分前完全一致
    - _需求：1.5, 1.6_

- [x] 2. 提取 BBTalkCard 组件
  - [x] 2.1 创建 `mobile/src/components/BBTalkCard.tsx`
    - 从 HomeScreen 的 `renderItem` 函数中提取单条碎碎念卡片的完整渲染逻辑
    - 包含：Markdown 内容渲染、标签行、图片缩略图、非图片附件（AudioPlayerButton、VideoPlayerButton、文件卡片）、底部信息栏（时间、设备图标、定位、可见性切换）
    - 提取 `renderFileAttachment` 和 `formatTime` 辅助函数到组件内部
    - Props 接口遵循设计文档中 `BBTalkCardProps` 的定义：`item`、`onMenu`、`onEdit`、`onToggleVisibility`、`onImagePreview`、`onLocationPress`、`theme`
    - 使用 `React.memo` 包裹组件（需求 5 联动，自定义比较函数在任务 9 中添加）
    - _需求：1.1, 1.6, 5.2_

  - [x] 2.2 在 HomeScreen 中替换 renderItem 为 BBTalkCard
    - 删除 HomeScreen 中的 `renderItem` 内联函数和 `renderFileAttachment`、`formatTime` 辅助函数
    - FlatList 的 `renderItem` 改为调用 BBTalkCard 组件
    - 将 `showMenu`、`toggleVisibility`、`showLocation`、`setPreviewImage` 等回调通过 props 传递给 BBTalkCard
    - _需求：1.1, 1.6_

- [ ] 3. 提取 PrivacyLockOverlay 组件
  - [~] 3.1 创建 `mobile/src/components/PrivacyLockOverlay.tsx`
    - 从 HomeScreen 的 return JSX 中提取防窥锁定遮罩的完整 UI（密码输入框、解锁按钮、生物识别按钮、锁定状态下的新建按钮）
    - Props 接口遵循设计文档：`locked`、`biometricAvailable`、`allowComposeWhenLocked`、`onUnlock`、`onBiometricUnlock`、`onCompose`、`theme`
    - 包含键盘动画（`lockKeyboardH`）的 Animated.View 逻辑
    - _需求：1.2, 1.6_

  - [~] 3.2 在 HomeScreen 中替换防窥遮罩 JSX 为 PrivacyLockOverlay
    - 删除 HomeScreen 中防窥锁定遮罩的 JSX 代码
    - 替换为 `<PrivacyLockOverlay ... />` 组件调用
    - _需求：1.2, 1.6_

- [ ] 4. 提取 SearchBar 和 TagTabs 组件
  - [~] 4.1 创建 `mobile/src/components/SearchBar.tsx`
    - 从 HomeScreen 中提取搜索栏 UI（搜索输入框、关闭按钮、清除按钮）和搜索历史面板（历史标签列表、清除历史按钮）
    - Props 接口遵循设计文档：`visible`、`searchText`、`searchHistory`、`onSearchTextChange`、`onSubmit`、`onClearHistory`、`onHistoryItemPress`、`onClose`、`theme`
    - _需求：1.3, 1.6_

  - [~] 4.2 创建 `mobile/src/components/TagTabs.tsx`
    - 从 HomeScreen 中提取标签快捷切换栏 UI（水平 ScrollView、"全部"按钮、各标签按钮、选中指示器）
    - Props 接口遵循设计文档：`tags`、`selectedTag`、`selectedDate`、`onSelectTag`、`scrollRef`、`theme`
    - _需求：1.4, 1.6_

  - [~] 4.3 在 HomeScreen 中替换搜索栏和标签栏 JSX
    - 删除 HomeScreen 中搜索栏和标签栏的 JSX 代码
    - 替换为 `<SearchBar ... />` 和 `<TagTabs ... />` 组件调用
    - 确保 HomeScreen 总行数低于 300 行
    - _需求：1.3, 1.4, 1.6, 1.7_

- [ ] 5. 检查点 — HomeScreen 拆分验证
  - 确认 HomeScreen.tsx 行数低于 300 行
  - 确认所有子组件（BBTalkCard、PrivacyLockOverlay、SearchBar、TagTabs）和 Hook（usePrivacyMode）可正常导入
  - 确认拆分后功能与拆分前完全一致（搜索、标签切换、防窥、删除撤销、语音录入等）
  - 确保所有测试通过，如有问题请询问用户

- [ ] 6. Web 端 Redux 扩展与删除撤销功能
  - [~] 6.1 在 Web 端 bbtalkSlice 中添加 `optimisticDelete` 和 `undoDelete` reducers
    - 在 `frontend/src/store/slices/bbtalkSlice.ts` 的 `reducers` 中新增：
      - `optimisticDelete(state, action: PayloadAction<string>)`：从 `bbtalks` 数组中移除指定 id 的条目，`totalCount` 减 1
      - `undoDelete(state, action: PayloadAction<{ bbtalk: BBTalk; index: number }>)`：将条目插回原始位置，`totalCount` 加 1
    - 导出这两个 actions
    - 逻辑与 Mobile 端 `mobile/src/store/slices/bbtalkSlice.ts` 中已有的实现保持一致
    - _需求：2.1, 2.2_

  - [ ]* 6.2 编写属性测试：乐观删除与撤销的 round-trip 属性
    - **属性 1：乐观删除与撤销的 round-trip 属性**
    - **验证：需求 2.1, 2.2**
    - 使用 `fast-check` 生成随机 BBTalk 列表（1-50 条）和随机选择一条删除
    - 验证 `optimisticDelete` 后该条目不在列表中且长度减 1
    - 验证随后 `undoDelete` 将列表恢复到与删除前完全一致的状态（相同元素、相同顺序）
    - 测试文件：`frontend/__tests__/store/bbtalkSlice.test.ts`

- [ ] 7. Web 端 UndoToast 和 SkeletonCard 组件
  - [~] 7.1 创建 `frontend/src/components/UndoToast.tsx`
    - 实现 Web 端撤销提示条组件，功能对标 Mobile 端 `mobile/src/components/UndoToast.tsx`
    - Props：`visible`、`message`（默认"已删除"）、`onUndo`、`onDismiss`、`duration`（默认 3000ms）
    - 使用 CSS `transition` + `transform: translateY()` 实现底部滑入/滑出动画
    - 固定定位在视口底部（`fixed bottom-4`），使用 Tailwind CSS 样式
    - 3 秒倒计时使用 `setTimeout`，撤销时 `clearTimeout`
    - _需求：2.1, 2.2, 2.3_

  - [~] 7.2 创建 `frontend/src/components/SkeletonCard.tsx`
    - 实现 Web 端骨架屏占位卡片组件，对标 Mobile 端 `mobile/src/components/SkeletonCard.tsx`
    - 无 props，纯展示组件
    - 使用 Tailwind CSS `animate-pulse` 实现脉冲动画
    - 布局模拟 BBTalk 卡片结构：文字行占位 → 标签行占位 → 附件区占位 → 底部行占位
    - _需求：2.5_

  - [~] 7.3 在 BBTalkPage 中集成乐观删除、UndoToast 和 SkeletonCard
    - 在 `frontend/src/pages/BBTalkPage.tsx` 中：
      - 导入 `optimisticDelete`、`undoDelete` actions 和 `UndoToast`、`SkeletonCard` 组件
      - 添加 `pendingDelete` 状态和 `deleteTimerRef` 引用
      - 替换现有的 `deleteBBTalkAsync` 直接调用为乐观删除流程：先 dispatch `optimisticDelete` → 显示 UndoToast → 3 秒后调用 API 删除 → API 失败时 dispatch `undoDelete` 恢复
      - 在 `isLoading && bbtalks.length === 0` 时渲染 3 张 SkeletonCard 替代 "加载中..." 文字
      - 数据加载完成后骨架屏自动替换为实际列表内容
    - _需求：2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [ ] 8. 检查点 — Web 端功能验证
  - 确保 Web 端乐观删除 + 撤销流程正常工作
  - 确保骨架屏在首次加载时显示、数据加载后消失
  - 确保所有测试通过，如有问题请询问用户

- [ ] 9. Mobile 端统一错误处理模块
  - [~] 9.1 创建 `mobile/src/utils/errorHandler.ts`
    - 实现 `ErrorType` 枚举：`Network`、`Auth`、`Server`、`Validation`、`Unknown`
    - 实现 `ClassifiedError` 接口
    - 实现 `classifyError(error: unknown): ClassifiedError` 纯函数，根据错误消息中的关键词分类：
      - 网络相关（"网络"/"Network"/"Network request failed"）→ `ErrorType.Network`
      - 认证相关（"认证"/"登录"/"过期"/HTTP 401）→ `ErrorType.Auth`
      - 服务器相关（HTTP 4xx/5xx/"服务器"）→ `ErrorType.Server`
      - 其他 → `ErrorType.Unknown`
    - 实现 `showError(error: unknown): void`，使用 Alert.alert 显示错误弹窗，包含"复制"和"关闭"按钮
    - 实现 `showErrorMessage(title: string, message: string): void`
    - 实现 `logError(error: unknown, context?: string): void`，调用 `console.warn` 记录
    - `showError` 内部使用 try-catch 保护，确保错误处理代码不会成为新的错误源
    - _需求：3.1, 3.2, 3.6_

  - [ ]* 9.2 编写属性测试：错误分类函数的正确性
    - **属性 2：错误分类函数的正确性**
    - **验证：需求 3.1, 3.4**
    - 使用 `fast-check` 生成随机错误对象（含各种 message 模式）
    - 验证 `classifyError` 返回的 `ClassifiedError` 对象中：`type` 是有效枚举值、`title` 和 `message` 是非空中文字符串
    - 验证网络关键词 → `ErrorType.Network`，认证关键词 → `ErrorType.Auth`
    - 测试文件：`mobile/__tests__/utils/errorHandler.test.ts`

  - [~] 9.3 替换现有静默 catch 块
    - 在 HomeScreen 及其子组件中，将用户可感知操作的 `catch {}` 和 `catch (e) { Alert.alert(...) }` 替换为 `catch (e) { showError(e) }` 或 `catch (e) { ErrorHandler.showError(e) }`
    - 对非关键操作（AsyncStorage 缓存读写、动画清理、日志记录）保留静默处理，但添加 `logError(e, 'context')`
    - 涉及文件：HomeScreen.tsx、usePrivacyMode.ts 及其他使用 try-catch 的组件
    - _需求：3.3, 3.4, 3.5, 3.6_

- [ ] 10. Mobile 客户端版本检测更新
  - [~] 10.1 安装 `expo-updates` 依赖
    - 在 `mobile/` 目录下安装 `expo-updates` 包
    - 确认 `app.json` 中的 expo-updates 配置（如有需要则添加）
    - _需求：4.2_

  - [~] 10.2 创建 `mobile/src/utils/versionChecker.ts`
    - 实现 `checkForUpdates(): Promise<void>` 主函数，协调 OTA 和 App Store 双通道检测
    - 实现 `checkOTAUpdate(): Promise<boolean>`：
      - 仅在非 `__DEV__` 模式下执行
      - 调用 `Updates.checkForUpdateAsync()` 检查 OTA 更新
      - 有更新时调用 `Updates.fetchUpdateAsync()` 静默下载
      - 下载完成后通过 Alert 提示用户重启，调用 `Updates.reloadAsync()`
    - 实现 `checkStoreUpdate(): Promise<{ hasUpdate, version?, url? }>`：
      - iOS：请求 `https://itunes.apple.com/lookup?bundleId={bundleId}` 获取最新版本
      - Android：使用 Google Play 链接
      - 比较 `Constants.expoConfig.version` 与商店版本（语义化版本比较）
      - 有新版本时显示 Alert 弹窗（"前往更新"/"稍后提醒"）
    - 实现 `isInCooldown(): Promise<boolean>` 和 `setCooldown(): Promise<void>`：
      - 使用 AsyncStorage 存储时间戳，24 小时内不再提示
    - 整个流程包裹在 try-catch 中，异常时静默忽略（`console.warn` 记录）
    - _需求：4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [~] 10.3 在 App.tsx 中集成 VersionChecker
    - 在 `ThemedNavigator` 组件中，认证成功（`isAuthenticated` 为 true）后调用 `checkForUpdates()`
    - 使用 `useEffect` 在组件挂载且已认证时触发版本检测
    - 确保版本检测不阻塞 App 正常启动和使用
    - _需求：4.1_

- [ ] 11. 列表性能优化（React.memo + useCallback）
  - [~] 11.1 为 BBTalkCard 添加自定义比较函数 `arePropsEqual`
    - 在 `mobile/src/components/BBTalkCard.tsx` 中实现 `arePropsEqual` 函数
    - 比较字段：`item.id`、`item.content`、`item.updatedAt`、`item.isPinned`、`item.visibility`
    - tags 数组：比较长度 + 每个 tag 的 `id`
    - attachments 数组：比较长度 + 每个 attachment 的 `uid`
    - 回调函数和 theme 使用引用比较
    - 将 `arePropsEqual` 传递给 `React.memo` 的第二个参数
    - _需求：5.2, 5.3_

  - [ ]* 11.2 编写属性测试：React.memo 自定义比较函数的正确性
    - **属性 3：React.memo 自定义比较函数的正确性**
    - **验证：需求 5.3**
    - 使用 `fast-check` 生成随机 BBTalkCardProps 对
    - 验证所有关键字段相同时返回 `true`
    - 验证任一关键字段变化时返回 `false`
    - 测试文件：`mobile/__tests__/components/BBTalkCard.test.ts`

  - [~] 11.3 在 HomeScreen 中使用 useCallback 包裹所有回调
    - 使用 `useCallback` 包裹 `renderItem`（FlatList 的渲染函数）
    - 使用 `useCallback` 包裹传递给 BBTalkCard 的所有回调：`showMenu`、`toggleVisibility`、`handleDelete`、`showLocation`、`setPreviewImage`
    - 确保 `useCallback` 的依赖数组正确，避免闭包陷阱
    - _需求：5.1, 5.4_

- [ ] 12. 最终检查点 — 全部功能验证
  - 确保所有测试通过
  - 确认 HomeScreen 行数 < 300 行（需求 1.7）
  - 确认 Web 端删除撤销和骨架屏功能正常（需求 2）
  - 确认 ErrorHandler 正确分类错误并显示中文提示（需求 3）
  - 确认版本检测不影响 App 正常启动（需求 4）
  - 确认列表滚动性能无退化（需求 5）
  - 如有问题请询问用户

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号，确保可追溯性
- 检查点任务确保增量验证，及时发现问题
- 属性测试验证设计文档中定义的 3 个正确性属性
- 单元测试验证特定场景和边界条件
- 需求 1（HomeScreen 拆分）和需求 5（性能优化）存在联动：BBTalkCard 的 React.memo 在任务 2 中创建骨架，在任务 11 中完善比较函数
