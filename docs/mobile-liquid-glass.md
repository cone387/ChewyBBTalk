# 手机端 Liquid Glass 适配

适配范围是 `mobile/`（Expo / React Native App 及其 Web 预览）。玻璃材质用于悬浮导航、工具栏及必要浮层；搜索、标签、正文、设置表单、错误信息和防窥遮罩使用普通表面，避免连续胶囊和叠加模糊抢占内容。

## 材质与平台

- `src/components/GlassSurface.tsx`：独立、不拦截触摸的材质底层。iOS 在系统、编译产物及原生 API 均支持时使用 `expo-glass-effect`；否则使用现有 `expo-blur`。能力探测抛错也降级，不要求旧安装包一定包含新模块。
- Web 使用模糊加高不透明度底色；Android 使用实色、细边框和阴影，避免列表滚动时的大面积模糊开销。
- `src/theme/GlassPreferences.tsx` 在读取辅助功能偏好前保持实色；监听降低透明度与减少动态效果，以及 Web 对应的媒体查询。玻璃材质不用于遮挡敏感内容。
- `src/theme/materials.ts` 集中维护卡片、输入框、胶囊和弹层圆角、触控尺寸及底栏预留空间。现有五套主题保留品牌色，背景改为中性色，并校正浅色次要文字的对比度。
- iOS 返回按钮和滑动返回继续由 UIKit 管理；Android / Web 自定义返回控件采用玻璃圆形底座。没有替换路由或修改返回逻辑。
- 原生玻璃本体及其祖先保持 `opacity: 1`；按压反馈通过前景颜色呈现。原生服务选择面板内的关闭按钮使用实色底座，避免嵌套玻璃材质。

## 页面与组件核对表

此表区分代码核查和实际运行验证，不代表所有设备均已真机验收。

| 页面 / 组件 | 处理 |
| --- | --- |
| `App`、`MainTabs` | 保留原生返回；悬浮胶囊底栏、选中底色、键盘显隐、减少动态效果及防窥时隐藏 |
| `HomeScreen`、`SearchBar`、`TagTabs`、`BatchToolbar` | 普通搜索框、下划线标签选中态、玻璃新建按钮、批量操作触控区域、列表与按钮给底栏留位 |
| `ComposeScreen`、`DraftStatus` | 对称的普通顶部操作栏、通栏底部工具栏；预览入口放在工具栏；保留草稿提示、键盘避让与锁定记录流程 |
| `CalendarScreen`、`CalendarDayRecords` | 普通上下月箭头、年月选择浮层、底栏留白；保留分页、离线缓存和详情返回位置 |
| `SettingsScreen`、`SectionCard` | 分组实色卡片统一圆角，底栏留白，菜单按钮语义 |
| `AboutScreen`、`AccountSecurityScreen`、`AdvancedSettingsScreen`、`CacheManagementScreen`、`DataManagementScreen`、`PrivacySettingsScreen`、`ProfileEditScreen`、`StorageSettingsScreen`、`ThemeSettingsScreen` | 统一命名卡片和表单控件的圆角、输入字号及按钮尺寸；开关、滑块、危险操作保留既有交互 |
| `LoginScreen`、`PasswordRecoveryScreen` | 表单与按钮统一，修复 320px 下密码显隐按钮溢出；服务选择玻璃面板、显式关闭按钮和底部安全区 |
| `TagManagementScreen`、`TagPickerModal`、`VisibilityPickerModal` | 标签编辑和选择浮层统一；选择状态、取消/确认按钮尺寸和减少动态效果 |
| `DraftsScreen`、`OutboxScreen`、`DraftNotice`、`OutboxNotice`、`OutboxSync` | 草稿与同步列表使用统一实色卡片；通知保持可读底色，核查现有 48pt 操作入口；同步行为不变 |
| `RecordDetailScreen`、`BBTalkCard`、`CalendarRecordCard`、`SwipeableBBTalkCard` | 正文不模糊；记录卡片圆角统一；核查更多、评论及侧滑操作的命中区域和现有手势 |
| `InlineComments`、`CommentInputModal`、`UndoToast` | 评论操作最小触控区域、玻璃输入浮层、输入标签、背景遮罩、撤销提示与减少动态效果 |
| `AudioPlayerButton`、`AudioPlayScreen`、`VideoPlayerButton` | 音频卡片圆角和独立播放按钮；视频保留原生播放控件，延迟加载和隐私暂停行为不变 |
| `ImageViewer`、首页图片预览控制 | 保留缩放与拖动手势；关闭、上一张、下一张为 48pt 玻璃按钮，关闭位置遵循顶部安全区 |
| `VoiceRecordingOverlay` | 统一浮层材质与按钮圆角，减少动态效果时停用脉冲；保留录音资源和长按录音流程 |
| `PrivacyBoundary`、`PrivacyLoading`、`PrivacyLockOverlay`、`AppBackgroundBlur`、`ScreenCaptureProtection` | 保留实色隐私边界与系统遮挡策略；解锁表单控件统一，身份确认浮层遵循减少动态效果 |
| `SkeletonCard`、`EmptyState`、`LoadingPlaceholder`、`ErrorBoundary`、`ErrorFallback` | 骨架与内容卡片轮廓对齐；其余保持简洁的加载、空态和故障兜底，不引入材质依赖 |
| `LandingScreen`、`LandingScreen.web` | 公开介绍页，不属于 App 导航操作层，保留现有宣传布局 |

## 验证与发布

### 2026-10-15：录音层级与手动深色主题补查

录音浮层曾被导航容器中的底栏盖住。现在按实际录音浮层可见状态隐藏底栏并阻止切换，结束、取消和页面卸载时恢复；录音组件留在原位置，保持长按松手及上滑取消的触摸响应。Web 点击命中回归先复现问题，修复后 390px 深色和 320px 浅色均完成开始、计时、取消、再次录音及附件生成流程。

操作菜单此前只读取系统主题，导致应用手动深色时仍出现白色菜单。Web 弹窗和 iOS 系统弹窗现读取应用解析后的主题；Android 原生 Alert 不支持该选项，不能据此宣称 Android 手动主题已统一。144 项定向测试、TypeScript 和三平台 JS 导出通过。

原生验收运行 38713804662 已完成但未通过：构建使用 `CODE_SIGNING_ALLOWED=NO`，模拟器 Keychain 返回 -34018，登录无法持久化。工作流改用模拟器 ad-hoc 签名，并将工作流变更纳入旧二进制复用校验；该修正仍需下一次产物验证。新增媒体与录音验收使用 loopback 合成数据，录音结果必须等可播放附件出现后才截图。构建 1.3.15（29）不含本节修正，不作为最终 TestFlight 发布包。

### 2026-10-15：评论层级的截图回归

补查媒体卡片、图片预览、视频、评论、批量操作、标签/可见性选择和录音浮层时，320px 截图发现评论输入被底部导航覆盖。页面内的绝对定位不能跨越导航容器的层级，单纯增大 zIndex 无法修复。评论输入改用独立透明 Modal，保留键盘避让、退场动画和关闭行为，呈现完成后再次确认输入焦点。

真实 Chromium 回归在修复前用 `elementFromPoint` 确认输入框被覆盖，修复后 320px 浅色和 390px 深色均通过点击命中检查，并逐张检查稳定后的浮层截图。22 项评论定向测试、TypeScript 和三平台导出通过；独立复核未发现阻塞问题。此项 Web 证据不替代正在执行的原生键盘验收。源码 `7afa214` 已推送，1.3.15（29）安装包构建完成并核对包内生产接口、runtime 和版本；尚未据此宣称原生视觉或 TestFlight 验收完成。

### 2026-10-15：全组件复核与原生验收

继续处理截图返工以外的组件状态：统一公开/私密/好友可见标签，约束录音转写与附件队列高度，补齐服务选择和年月选择的键盘避让、头像失败回退、系统减少动态效果、图片双指切换和换图复位。账号、个人信息、存储及找回密码表单按原生导航高度避让键盘；Android 编辑器不再叠加系统已处理的键盘高度。普通设置卡片去掉多余阴影，危险操作和加载状态使用主题语义色。

原生验收使用 GitHub Actions 上的 Xcode 26.3、iPhone 16 / iOS 26.0 模拟器，编译实际 Release 应用，再用 Maestro 操作界面。服务只绑定 runner 的 loopback，数据均为合成内容，不连接生产记录。运行证据保存在 Actions `ios-native-visual` artifact 和本地 `mobile/test-results/native-visual-<run>/`。

验收确实发现了 Web 和组件测试未暴露的问题：服务选择弹窗的触摸背景将所有子控件合并为一个无障碍节点。服务、标签和可见性弹窗背景已取消分组；卡片外层同样取消分组，自定义服务的选择与删除成为并列控件。使用真实无障碍树定位问题，没有用坐标点击绕过它。尚未完成的原生流程不能计为通过，最终运行及发布结果另行记录。

共享布局已检查 390px 浅色/深色和 320px 浅色：首页、日历、设置及全部设置子页、草稿、同步列表、空白/有内容/编辑/锁定编辑器，包含预览返回、底部操作可达和横向溢出检查。当前 107 套 / 1,429 项单测、13 套 / 97 项集成与 TypeScript 检查通过；弹窗与卡片无障碍修正另经 40 项定向回归。

### 2026-10-15：根据 TestFlight 截图返工

1.3.14 (26) 的五张用户截图暴露了视觉验收遗漏：编辑弹层顶部空洞、连续大胶囊、底栏贴边且选中块呈矩形、卡片留白过大、设置头像空白。此前代码检查和 Web 预览不足以证明 iPhone 成品质量。以下为后续本地修正，尚未进入该 TestFlight 构建。

- 底栏使用 `start/end` 覆盖导航库的默认定位；圆角施加到实际 `PlatformPressable`，并为图标和标签分配完整高度。直接声明既有版本的 elements 依赖，不升级导航库。
- 编辑模态路由增加局部 SafeAreaProvider；顶部采用对称操作区，预览移至底部工具栏；快速记录缩短解锁按钮文字，保留完整无障碍标签。提交中保留主色按钮，确保白色加载指示器可见。
- 搜索和标签去掉重复玻璃底座；卡片缩小间距，并显式覆盖 Markdown 默认段落上下边距；倒计时改为新建按钮旁的次要控件。
- 日历收紧栅格与顶部导航；设置图标统一色彩，头像加载中及失败时始终保留文字回退。原生玻璃不再额外叠白色边框。

正式 Expo Web 导出通过隔离的合成数据在 Chromium 中检查，未读取或修改真实记录。截图位于 `mobile/test-results/glass-correction/`：390px 浅色/深色、320px 浅色下的首页、日历、设置及底部、空白/有内容/编辑/锁定编辑器。检查了预览切换返回和设置底部操作可达。编辑器的蓝色焦点线来自 Web 键盘可访问性样式，不是原生 iOS 分隔线。

本次 TypeScript、三平台 JS 导出、106 套单元测试（1,424 条）及 13 套集成测试（97 条）通过。首次全量运行有一条既有离线缓存属性测试失败；保留其日志后，以原 seed `-122771915` 单独重放及再次全量运行均通过，未修改该测试或缓存实现，原因尚未确认。视觉返工通过独立代码复核。

这些证据仅覆盖共享布局和 Web 降级材质。iPhone 原生模态安全区、键盘弹出/收起、Liquid Glass 光学效果及大字体仍待设备验收，不能以 Web 截图或单元测试替代。

### 首轮适配记录

自动验证使用移动端完整单元测试、`test:integration`、TypeScript 检查和 Expo iOS / Android / Web 的 JS 导出。新增材质测试覆盖原生可用、API 不可用、缺原生模块、Android、偏好初始化以及运行中降低透明度；现有集成测试覆盖底栏导航、防窥边界、编辑器与评论等行为。

2026-10-15 验证：106 套单元测试、1,423 条通过；13 套集成测试、97 条通过；TypeScript 检查与三平台 JS 导出通过。JS 导出不等同于 Xcode / Gradle 原生二进制构建。

浏览器人工核对了 320×640 与 390×844 的登录/编辑布局、返回按钮和深色服务选择面板。Web 只可验证降级材质与布局，不能证明 iOS 原生光学效果或系统键盘行为。

启用真正的原生效果需要包含 `expo-glass-effect`、使用支持 Liquid Glass 的工具链重新构建 iOS 二进制；旧安装包运行 JS 更新时会使用降级材质。项目使用 `runtimeVersion.policy = appVersion`，正式发布新增原生依赖时应按发布流程更新 App 版本并生成新构建，再发布对应 runtime 的更新。

发布前仍需真机核对：支持 Liquid Glass 的 iOS、旧版 iOS、Android；深浅主题、降低透明度、减少动态效果、大字体、键盘弹出、底部手势区域、滑动返回、录音与防窥恢复。Windows 本次开发环境未执行这些真机验收。

参考：[Apple 材质指南](https://developer.apple.com/design/human-interface-guidelines/materials)、[Expo SDK 54 GlassEffect](https://docs.expo.dev/versions/v54.0.0/sdk/glass-effect/)。
