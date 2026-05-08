# Implementation Plan: ChewyBBTalk Mobile 主屏小组件

## 概述

按"原生脚手架 → JS 数据源 → 配置 UI → 双端渲染 → Deep Link → 隐私与性能"的顺序实施。原生部分必须用 dev client 验证（Expo Go 无法加载自定义原生模块）。属性测试集中在 datasource / payload 裁剪逻辑。

技术栈：Expo SDK 54 + React Native 0.81 + TypeScript + Swift (WidgetKit) + Kotlin (Glance)

## Tasks

- [ ] 1. 原生脚手架与 Config Plugin
  - [ ] 1.1 创建自定义 Expo Config Plugin `mobile/plugins/withHomeWidget.js`
    - 在 `app.json` 的 plugins 数组中注册该 plugin
    - iOS 侧：追加 App Group entitlement（`group.com.chewy.bbtalk`），声明 WidgetExtension target 所需资源路径
    - Android 侧：注入 AppWidget provider 的 receiver 声明与 meta-data 到 AndroidManifest.xml
    - 编写 README 说明本地运行 `expo prebuild --clean` 的流程
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ] 1.2 新建 Expo Module `mobile/modules/home-widget/`
    - 配置 `expo-module.config.json`，声明 iOS/Android 平台与模块名 `HomeWidget`
    - 实现 JS 封装 `src/index.ts`：`isSupported`、`writeWidgetData`、`reloadWidget`、`readWidgetData`
    - 非受支持平台（Web / Expo Go）降级为 no-op，打印 warning
    - _Requirements: 1.4, 1.5_

  - [ ] 1.3 实现 iOS 原生模块 `HomeWidgetModule.swift`
    - 使用 `FileManager.default.containerURL(forSecurityApplicationGroupIdentifier:)` 写入 `widget-data.json`
    - 调用 `WidgetCenter.shared.reloadAllTimelines()` 触发刷新
    - 处理权限与路径异常，统一抛出 `HomeWidgetError.*`
    - _Requirements: 1.3, 1.4, 1.6_

  - [ ] 1.4 实现 Android 原生模块 `HomeWidgetModule.kt`
    - 写入 `context.filesDir/widget-data.json`
    - 通过 `GlanceAppWidget.updateAll(context)` 触发刷新
    - _Requirements: 1.4, 1.6_

- [ ] 2. Checkpoint — 原生脚手架验证
  - Ensure `eas build --profile development` 在 iOS / Android 都能产出安装包
  - JS 侧调用 `writeWidgetData` 与 `reloadWidget` 不报错
  - App Group 文件写入后可在 iOS 主 App 内通过 `readWidgetData` 读回
  - 若失败先停下，与用户同步遇到的平台问题

- [ ] 3. Widget_DataSource（JS 侧核心逻辑）
  - [ ] 3.1 新建 `mobile/src/services/widget/types.ts`
    - 定义 `WidgetConfig`、`WidgetItem`、`WidgetPayload` 类型
    - 对齐 design.md 中 JSON 契约
    - _Requirements: 3.2, 3.3_

  - [ ] 3.2 新建 `config.ts`：`loadWidgetConfig` / `saveWidgetConfig`
    - AsyncStorage 键 `bbtalk.widget.config`
    - 无配置时返回 DEFAULT_CONFIG（`recent` + N=5 + 公开）
    - 计算 `configHash`（SHA1 前 6 位）
    - _Requirements: 2.7_

  - [ ] 3.3 新建 `datasource.ts`：`selectWidgetItems` 与 `toWidgetItem`
    - 实现四种策略（pinned / recent / tags / manual）
    - 实现 includePrivate 过滤
    - content 截断到 200 字符，tags 裁剪到 3 个
    - _Requirements: 2.2, 3.2, 6.3_

  - [ ] 3.4 新建 `index.ts`：`syncWidget` / `clearWidget`
    - `syncWidget`：读取 Redux store（从 `store.getState()`），调用 `selectWidgetItems` 组装 payload，调用 Bridge 写入并 reload
    - `clearWidget`：写入空 payload，reason 决定 `locked` / `authenticated` 字段
    - JSON 过大时执行三级裁剪循环（减 items → 截 content → 去 thumbnail）
    - _Requirements: 3.1, 3.2, 3.7, 6.1, 7.3_

  - [ ]* 3.5 编写 datasource 属性测试 `__tests__/widget/datasource.property.test.ts`
    - **Property 1: 配置筛选稳定性** — 随机生成 BBTalk 列表与 config，断言长度与子集关系
    - **Property 2: 可见性过滤** — includePrivate=false 时结果全为 public
    - **Property 4: manual 顺序保持** — manual 策略输出顺序与 manualUids 一致
    - 使用 fast-check，每个 property 至少 100 次迭代
    - **Validates: Requirements 2.2, 2.3, 4.1-4.3, 6.3**

  - [ ]* 3.6 编写 payload 属性测试 `__tests__/widget/payload.property.test.ts`
    - **Property 3: payload 裁剪** — `toWidgetItem` 输出 content ≤200、tags ≤3
    - **Validates: Requirements 3.2, 7.3**

- [ ] 4. 接入 Redux 触发点
  - [ ] 4.1 在关键 bbtalkSlice action 后调用 `syncWidget()`
    - fetchBBTalks.fulfilled / fetchMore.fulfilled
    - createBBTalk / updateBBTalk / deleteBBTalk / togglePin
    - 不阻塞 UI，使用 `void syncWidget().catch(console.warn)`
    - _Requirements: 3.1_

  - [ ] 4.2 登录成功 / 登出 / 防窥 lock / unlock 时触发
    - 登录：`syncWidget()`
    - 登出：`clearWidget('logout')`
    - Privacy_Guard lock：`clearWidget('locked')`
    - unlock：`syncWidget()`
    - _Requirements: 3.7, 6.1_

- [ ] 5. Checkpoint — 数据管线验证
  - Ensure all property tests pass
  - 在 dev client 里观察：发布一条 BBTalk 后，`readWidgetData` 能读到新内容
  - 若属性测试失败或原生写入未生效，停下与用户同步

- [ ] 6. Widget_Config_Screen 配置页
  - [ ] 6.1 新建 `mobile/src/screens/WidgetConfigScreen.tsx`
    - 布局：顶部尺寸预览卡片（small/medium/large 横滑）→ 策略单选 → 策略相关控件 → includePrivate 开关 → 保存按钮
    - 使用现有 Theme_System 与通用组件（SegmentedControl、TagPickerModal）
    - _Requirements: 2.1, 2.2, 2.3, 2.5_

  - [ ] 6.2 在 SettingsScreen 个性化区块追加"主屏小组件"入口
    - 图标：apps（@expo/vector-icons Ionicons）
    - 点击跳转 `WidgetConfig` 路由
    - _Requirements: 2.1_

  - [ ] 6.3 BBTalk 选择器组件 `WidgetManualPicker.tsx`
    - 复用 HomeScreen 列表 UI + 多选模式
    - 支持关键词搜索、已选顺序可拖动调整
    - 上限 10 条
    - _Requirements: 2.3_

  - [ ] 6.4 保存流程
    - 调用 `saveWidgetConfig` → `syncWidget()` → Toast 提示
    - 错误捕获并友好提示
    - _Requirements: 2.6_

- [ ] 7. iOS Widget Extension 渲染
  - [ ] 7.1 在 `ios/HomeWidget/` 实现 WidgetBundle 与 TimelineProvider
    - `WidgetDataLoader`：读取 App Group 下 `widget-data.json`，反序列化为 `WidgetPayload`
    - `HomeWidgetTimelineProvider`：生成两条 entry（now / now+30m），policy `.after(now+30m)`
    - _Requirements: 3.4, 3.5, 3.6_

  - [ ] 7.2 实现三种尺寸 View
    - `SmallWidgetView`：新建按钮 + 1 条卡片
    - `MediumWidgetView`：新建按钮 + 3 条紧凑卡片
    - `LargeWidgetView`：新建按钮 + 6 条卡片
    - 置顶条目加 `📌`，含图条目右侧缩略图
    - 深色模式使用 `Color(UIColor.systemBackground)` 自适应
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 7.3 空状态与锁定状态
    - items 为空：展示"暂无内容，点击记录一下 👇"
    - payload.locked=true：展示"已锁定 🔒"
    - payload.authenticated=false：展示"请登录"
    - _Requirements: 3.6, 4.6, 6.2_

- [ ] 8. Android AppWidget 渲染（Glance）
  - [ ] 8.1 在 `android/app/src/main/java/com/chewy/bbtalk/widget/` 新建 Glance Widget
    - `HomeBBTalkWidget`：`GlanceAppWidget` 子类，`provideGlance` 读取 JSON 并渲染
    - `HomeBBTalkWidgetReceiver`：`GlanceAppWidgetReceiver` 子类
    - `res/xml/home_bbtalk_widget_info.xml`：尺寸 / 预览图 / resizeMode
    - _Requirements: 4.1-4.5_

  - [ ] 8.2 实现三种尺寸 Composable
    - 根据 `LocalSize.current` 判断 small / medium / large
    - 样式与 iOS 视觉一致
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ] 8.3 空状态 / 锁定 / 未登录占位 Composable
    - _Requirements: 3.6, 4.6, 6.2_

- [ ] 9. Checkpoint — 渲染验证
  - Ensure widget 在双端 small/medium/large 三种尺寸下能正确渲染当前 Redux 数据
  - 若任一端出现显著视觉问题（颜色偏差、裁剪异常、崩溃），停下与用户同步

- [ ] 10. Deep Link 与入口跳转
  - [ ] 10.1 扩展 `mobile/src/navigation/linking.ts`
    - prefixes: `['chewybbtalk://', 'https://bbtalk.cone387.top/app']`
    - 配置 Compose / BBTalkDetail / Home 路由
    - _Requirements: 5.2, 5.3_

  - [ ] 10.2 在 ComposeScreen 处理 `source=widget`
    - `route.params.source === 'widget'` 时 `useEffect` 自动聚焦输入框
    - _Requirements: 5.4_

  - [ ] 10.3 在 BBTalkDetail / Compose 编辑模式处理 `uid`
    - 从 Redux / API 加载目标 BBTalk，失败则 replace 到 Home 并 Toast
    - _Requirements: 5.6, 5.7_

  - [ ] 10.4 未登录拦截
    - AuthGate 保存 pending route，登录成功后自动 replace 到 pending route
    - _Requirements: 5.5_

  - [ ] 10.5 iOS Widget Link 与 Android clickable Intent
    - 新建按钮：`chewybbtalk://compose?source=widget`
    - 条目卡片：`chewybbtalk://edit/{uid}`
    - Android 主 Activity 加 `launchMode="singleTask"` + scheme intent-filter
    - _Requirements: 5.1, 5.2, 5.6_

- [ ] 11. 隐私与可观测性
  - [ ] 11.1 防窥联动
    - 在 privacyGuardSlice 的 lock / unlock action 后触发 `clearWidget('locked')` / `syncWidget()`
    - _Requirements: 6.1, 6.2_

  - [ ] 11.2 includePrivate 默认关闭 + 风险提示
    - 在 WidgetConfigScreen 勾选时弹 Alert 风险说明（一次性）
    - _Requirements: 6.3_

  - [ ] 11.3 调试信息
    - SettingsScreen 点击版本号 5 次解锁"小组件调试"子页
    - 子页展示：上次同步时间、payload 大小、最近一次错误
    - _Requirements: 8.3_

  - [ ] 11.4 reload 失败降级
    - `syncWidget` 中记录连续失败次数，超过 3 次进入 5 分钟冷却期（仅写文件、不 reload）
    - _Requirements: 8.4_

- [ ] 12. Final Checkpoint — 全功能验证
  - 手动走一遍以下场景：
    - 全新安装 → 添加 small/medium/large 三种 widget
    - 发布 / 编辑 / 删除 BBTalk → widget 1 分钟内更新
    - 点击新建 → 进入 Compose，输入框聚焦
    - 点击条目 → 进入编辑页
    - 防窥锁定后 → widget 显示"已锁定 🔒"
    - 登出 → widget 显示"请登录"
    - 配置 manual 策略 → widget 按用户顺序展示
  - 性能自测：主 App 冷启动增量 < 100ms，widget 渲染 < 200ms
  - 全部通过后询问用户是否发布到 TestFlight / 内部分发

## Notes

- 带 `*` 的任务为属性测试，可在首次 MVP 后再补；建议上线前至少完成 3.5（datasource 属性测试）。
- Glance 依赖 Kotlin/Compose 工具链，首次构建会显著增加 Android 构建时间（约 +30-60s）。
- iOS Widget Extension 的 bundleIdentifier 需要在 App Store Connect 提前创建（`com.chewy.bbtalk.HomeWidget`），否则 TestFlight 上传会失败。
- Universal Link 域名 `bbtalk.cone387.top/app` 需要在服务端托管 `apple-app-site-association` 文件（本期可先跳过，只做 custom scheme）。
