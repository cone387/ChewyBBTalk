# 需求文档：ChewyBBTalk Mobile 主屏小组件（Home Screen Widget）

## 简介

为 ChewyBBTalk Mobile 增加 iOS / Android 主屏小组件（以下简称"小组件"）。小组件提供两类能力：

1. **展示类**：在主屏上直接显示用户挑选的若干条碎碎念（BBTalk），支持多尺寸（small / medium / large）。用户可在 App 内配置哪些记录进入小组件（置顶、按标签、按最近 N 条等策略）。
2. **动作类**：小组件顶部或角落提供"新建"按钮，点击后通过 deep link 直接打开 App 并进入发布页（Compose_Screen），无需额外点击。

技术栈：Expo SDK 54 + React Native 0.81 + TypeScript。iOS 侧采用 WidgetKit + Swift，Android 侧采用 Glance / RemoteViews；两侧共用本地数据源（App Group / SharedPreferences），由 Expo 主进程写入。

后端：Django 5.2 + DRF，现有 `/api/bbtalks/` 接口，支持 `?is_pinned=true&ordering=...` 等过滤。

## 术语表

- **App**：ChewyBBTalk Mobile 应用程序。
- **BBTalk**：碎碎念，应用中的核心内容单元。
- **Widget**：主屏小组件，独立于 App 进程，由系统调度渲染。
- **Widget_Small / Widget_Medium / Widget_Large**：iOS 三种尺寸，分别约 155×155 / 329×155 / 329×345 pt；Android 对应 2×2 / 4×2 / 4×4 网格。
- **Widget_Config_Screen**：App 内的小组件配置页面，用户选择数据源策略与展示条目。
- **Widget_DataSource**：小组件数据源模块，负责从 App 内 Redux_Store 或本地缓存中提取将要展示的 BBTalk 列表，并写入 App Group（iOS）或 SharedPreferences（Android）。
- **Widget_Native_Module**：原生侧小组件实现。iOS 使用 WidgetKit + TimelineProvider；Android 使用 Glance 或 AppWidgetProvider。
- **Widget_Bridge**：React Native 原生模块，暴露 `reloadWidget`、`writeWidgetData` 等方法给 JS 调用。
- **Compose_Screen**：App 内的发布/编辑页面。
- **Deep_Link**：`chewybbtalk://compose?source=widget` 等形式的自定义 URL。
- **App_Group**：iOS 上 App 与 Widget 扩展共享数据的容器标识（如 `group.com.chewy.bbtalk`）。
- **Refresh_Policy**：小组件刷新策略，包含手动刷新、定时刷新（iOS TimelineProvider）、写入后立即刷新。
- **Widget_Entry_Filter**：筛选规则，包括"置顶"、"指定标签"、"最近 N 条"、"手动选中的 UID 列表"。

## 需求

### 需求 1：小组件工程结构与原生模块接入

**用户故事：** 作为开发者，我需要在现有 Expo 项目中接入 iOS WidgetKit 扩展和 Android AppWidget，以便 React Native 侧可以向小组件写入数据并触发刷新。

#### 验收标准

1. THE 项目 SHALL 通过 Expo Config Plugin（或 `expo prebuild` + 手动 iOS/Android 原生工程修改）引入 WidgetExtension target 和 Android AppWidget provider。
2. WHEN 开发者执行 `eas build --profile production`, THE EAS_Build SHALL 产出包含 Widget 扩展的 iOS IPA 和包含 AppWidget 的 Android APK/AAB。
3. THE App SHALL 声明 App_Group 标识 `group.com.chewy.bbtalk`，并在 iOS 主 App target 与 Widget Extension target 的 entitlements 中启用该 App_Group。
4. THE Widget_Bridge SHALL 暴露 JS 方法 `writeWidgetData(payload: WidgetPayload)`、`reloadWidget(): Promise<void>` 和 `isWidgetSupported(): boolean`。
5. WHEN App 运行在 Expo Go 或 Web 平台, THE Widget_Bridge SHALL 使 `isWidgetSupported` 返回 `false`，其余方法变为 no-op 并打印 warning，不抛异常。
6. THE 原生侧 SHALL 使用 JSON 文件（而非 Realm/SQLite）在 App_Group / SharedPreferences 中存储数据，文件名固定为 `widget-data.json`，以降低跨进程读写复杂度。

### 需求 2：小组件配置页

**用户故事：** 作为用户，我希望在 App 内选择"哪些碎碎念展示在小组件上"，包括按规则自动选择或手动置顶，以便小组件内容与我的关注点一致。

#### 验收标准

1. THE App SHALL 在设置页（SettingsScreen）的"个性化"区块提供"主屏小组件"入口，点击进入 Widget_Config_Screen。
2. THE Widget_Config_Screen SHALL 提供以下四种数据源策略，用户同一时刻只能选择一种：
   - `pinned`：仅展示置顶 BBTalk（`is_pinned=true`），按 `update_time` 降序。
   - `recent`：展示最近 N 条 BBTalk，N 可选 3 / 5 / 10。
   - `tags`：展示指定标签列表中的最近 N 条（N 同上），用户可多选标签。
   - `manual`：用户手动从 BBTalk 列表里挑选至多 10 条，按挑选顺序排列。
3. WHEN 用户选择 `manual` 策略并点击"添加"按钮, THE Widget_Config_Screen SHALL 打开一个 BBTalk 选择器（可复用现有列表 + 多选模式），支持按关键词搜索。
4. THE Widget_Config_Screen SHALL 提供"可见性过滤"开关，默认仅展示 `public` 与 `private` 中的 `public` 条目，用户可勾选"允许展示私密条目"（勾选时在页内显示警示："小组件在锁屏状态下也可能被旁人看到"）。
5. THE Widget_Config_Screen SHALL 提供三种尺寸的预览卡片，所见即所得，实时反映当前配置。
6. WHEN 用户修改配置并点击"保存", THE Widget_Config_Screen SHALL 持久化配置到 AsyncStorage（键 `bbtalk.widget.config`），调用 Widget_DataSource 重新生成 `widget-data.json`，并调用 `reloadWidget()`。
7. IF 用户未做任何配置, THEN THE Widget SHALL 默认使用 `recent` + N=5 + 仅 `public`。

### 需求 3：小组件数据同步

**用户故事：** 作为用户，我希望小组件内容与 App 保持同步，不必频繁打开 App 才能更新。

#### 验收标准

1. WHEN App 成功加载或刷新 BBTalk 列表（Home_Screen pull-to-refresh、无限滚动完成、发布新 BBTalk、删除 BBTalk、修改置顶状态等）, THE Widget_DataSource SHALL 基于当前 Widget_Config 重新计算目标列表并写入 `widget-data.json`，随后调用 `reloadWidget()`。
2. THE Widget_DataSource SHALL 对写入内容进行裁剪：单条 content 截断到 200 字符，附件仅保留首张图片的本地或 CDN URL，标签列表最多 3 个。
3. THE Widget_DataSource SHALL 在 `widget-data.json` 中附加 `generatedAt`（ISO 时间戳）和 `configHash`（配置指纹），以便原生侧判断是否需要重渲染。
4. WHILE App 处于后台或被杀死, THE Widget（iOS）SHALL 通过 TimelineProvider 每 30 分钟尝试重新读取 `widget-data.json` 并刷新显示；Android AppWidget 每 30 分钟由系统调度 `onUpdate`。
5. THE iOS Widget SHALL 读取 App_Group 的 `widget-data.json`，不进行任何网络请求；Android Widget 同理。
6. IF `widget-data.json` 不存在或解析失败, THEN THE Widget SHALL 显示占位 UI（文案"打开 App 以加载内容"+ 新建按钮）。
7. WHEN 用户在 App 内执行登出, THE App SHALL 清空 `widget-data.json` 内容（保留文件，仅置为空列表 + 未登录标记）。

### 需求 4：小组件渲染与尺寸适配

**用户故事：** 作为用户，我希望小组件在不同尺寸下呈现合适数量的信息，视觉与 App 保持一致。

#### 验收标准

1. THE Widget_Small SHALL 展示最多 1 条 BBTalk：顶部一行"新建"按钮 + 单条卡片（时间 + 2 行内容 + 1 个标签）。
2. THE Widget_Medium SHALL 展示最多 3 条 BBTalk：顶部"新建"按钮 + 3 行紧凑卡片（时间 + 1 行内容）。
3. THE Widget_Large SHALL 展示最多 6 条 BBTalk：顶部"新建"按钮 + 6 行卡片（时间 + 2 行内容 + 标签）。
4. THE Widget SHALL 适配系统浅色 / 深色模式，颜色与 App 默认蓝主题保持一致（主色 `#3B82F6`，背景浅色 `#FFFFFF` / 深色 `#1F2937`）。
5. THE Widget SHALL 对置顶条目前加 `📌` 图标；对含图片的条目在右侧展示 32×32 缩略图（若可用）。
6. WHEN 数据源结果为空, THE Widget SHALL 显示占位文案"暂无内容，点击记录一下 👇"，同样保留新建按钮。
7. THE Widget 的文字 SHALL 全部使用系统默认字体，不引入自定义字体以减小扩展体积。

### 需求 5：新建按钮与 Deep Link

**用户故事：** 作为用户，我希望在小组件上点击"新建"按钮，直接跳到发布页面开始编辑，减少操作步骤。

#### 验收标准

1. THE Widget SHALL 在顶部或角落显示"新建"按钮（加号图标 + 可选文案"记录"），所有尺寸都必须出现该按钮。
2. WHEN 用户点击"新建"按钮, THE 系统 SHALL 打开 App 并导航至 Compose_Screen，URL 形式为 `chewybbtalk://compose?source=widget`。
3. THE App SHALL 注册 URL scheme `chewybbtalk://` 以及 Universal Link（iOS）/ App Link（Android，可选）于 `bbtalk.cone387.top/app`。
4. WHEN App 已登录并通过 Deep_Link 进入 Compose_Screen, THE Compose_Screen SHALL 自动聚焦内容输入框并弹出键盘。
5. WHEN App 未登录且收到 Deep_Link, THE App SHALL 先导航到 LoginScreen，用户登录成功后再跳转到 Compose_Screen。
6. WHEN 用户点击 Widget 上的某条 BBTalk 卡片, THE 系统 SHALL 打开 App 并导航至该条 BBTalk 的编辑页面，URL 形式为 `chewybbtalk://edit/{uid}`。
7. IF Deep_Link 携带的 uid 在 App 本地数据中不存在, THEN THE App SHALL 回退到 Home_Screen 并显示 Toast "该记录已不存在"。

### 需求 6：隐私与锁屏行为

**用户故事：** 作为用户，我希望小组件尊重防窥模式和可见性设置，不在锁屏或他人面前泄露私密内容。

#### 验收标准

1. WHEN App 处于防窥锁定状态（Privacy_Guard locked）, THE Widget_DataSource SHALL 将 `widget-data.json` 内容替换为带 `locked: true` 标记的占位数据。
2. WHEN `widget-data.json` 的 `locked` 标记为 true, THE Widget SHALL 显示"已锁定 🔒"与新建按钮（新建按钮允许在锁定下点击，由 App 处理是否跳转或再次鉴权）。
3. WHERE 用户在 Widget_Config_Screen 未勾选"允许展示私密条目", THE Widget_DataSource SHALL 从候选列表中过滤掉 `visibility != public` 的条目。
4. THE Widget SHALL 在单条卡片中仅展示 content、tags、时间，不展示位置、设备等 context 信息。
5. IF iOS 系统处于锁屏状态且用户未启用 "Show on Lock Screen"（iOS 自身设置）, THEN 本需求不再适用（由系统控制）。

### 需求 7：性能与体积

**用户故事：** 作为开发者，我希望小组件扩展足够轻量，不影响主 App 冷启动与打包体积。

#### 验收标准

1. THE Widget Extension 编译产物 SHALL 不超过 3 MB（iOS），不超过 1 MB（Android AppWidget 代码部分）。
2. THE Widget 读取 `widget-data.json` 并完成一次渲染 SHALL 在 200 ms 内完成（on-device 实测，iPhone 13 / Pixel 6 基准）。
3. THE `widget-data.json` 单次写入总大小 SHALL 不超过 32 KB；超过时按 Widget_Entry_Filter 规则继续裁剪直到满足。
4. THE Widget_DataSource 在主 App 中的同步调用 SHALL 不阻塞 UI 线程，采用异步写文件。
5. THE App 冷启动时间（TTI）SHALL 不因引入 Widget 模块而增加超过 100 ms。

### 需求 8：可观测性与降级

**用户故事：** 作为开发者，我希望在小组件异常时有明确的错误回退与日志，便于排查。

#### 验收标准

1. WHEN Widget_Bridge 的方法调用失败, THE Widget_DataSource SHALL 捕获异常并通过 `console.warn` 打印错误（包含方法名、错误信息），不抛出给上层。
2. THE Widget_Native_Module SHALL 在解析 `widget-data.json` 失败时写入原生日志（iOS `os_log`，Android `Log.w`），标签 `ChewyWidget`。
3. THE App SHALL 在设置页的"小组件"子页显示"上次同步时间"与"数据大小"两项调试信息（debug 构建可见，release 构建可通过连续点击版本号 5 次解锁）。
4. IF 连续 3 次 `reloadWidget()` 失败, THEN THE Widget_DataSource SHALL 降级为仅写文件不触发刷新，并上报埋点（复用现有 logger 即可，无需新后端接口）。
