# 手机端 Liquid Glass 适配

适配范围是 `mobile/`（Expo / React Native App 及其 Web 预览）。设计把玻璃材质用于导航、搜索、工具栏及浮层；正文、设置表单、错误信息和防窥遮罩使用实色，避免叠加模糊影响阅读与隐私。

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
| `HomeScreen`、`SearchBar`、`TagTabs`、`BatchToolbar` | 搜索和标签玻璃层、胶囊选中态、玻璃新建按钮、批量操作触控区域、列表与按钮给底栏留位 |
| `ComposeScreen`、`DraftStatus` | 顶部操作和底部工具栏统一材质；标签与工具按钮尺寸统一；保留草稿提示、键盘避让与锁定记录流程 |
| `CalendarScreen`、`CalendarDayRecords` | 上下月玻璃按钮、年月选择浮层、底栏留白；保留分页、离线缓存和详情返回位置 |
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

自动验证使用移动端完整单元测试、`test:integration`、TypeScript 检查和 Expo iOS / Android / Web 的 JS 导出。新增材质测试覆盖原生可用、API 不可用、缺原生模块、Android、偏好初始化以及运行中降低透明度；现有集成测试覆盖底栏导航、防窥边界、编辑器与评论等行为。

2026-10-15 验证：106 套单元测试、1,423 条通过；13 套集成测试、97 条通过；TypeScript 检查与三平台 JS 导出通过。JS 导出不等同于 Xcode / Gradle 原生二进制构建。

浏览器人工核对了 320×640 与 390×844 的登录/编辑布局、返回按钮和深色服务选择面板。Web 只可验证降级材质与布局，不能证明 iOS 原生光学效果或系统键盘行为。

启用真正的原生效果需要包含 `expo-glass-effect`、使用支持 Liquid Glass 的工具链重新构建 iOS 二进制；旧安装包运行 JS 更新时会使用降级材质。项目使用 `runtimeVersion.policy = appVersion`，正式发布新增原生依赖时应按发布流程更新 App 版本并生成新构建，再发布对应 runtime 的更新。

发布前仍需真机核对：支持 Liquid Glass 的 iOS、旧版 iOS、Android；深浅主题、降低透明度、减少动态效果、大字体、键盘弹出、底部手势区域、滑动返回、录音与防窥恢复。Windows 本次开发环境未执行这些真机验收。

参考：[Apple 材质指南](https://developer.apple.com/design/human-interface-guidelines/materials)、[Expo SDK 54 GlassEffect](https://docs.expo.dev/versions/v54.0.0/sdk/glass-effect/)。
