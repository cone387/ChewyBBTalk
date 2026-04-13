# 需求文档：ChewyBBTalk Mobile 下一阶段

## 简介

本文档分为两部分：第一部分完整记录 ChewyBBTalk Mobile 已实现的功能作为基线；第二部分详细定义下一阶段（P0 上架准备 + P1 体验优化）的新功能需求。后续阶段（P2-P4）以路线图形式概述。

ChewyBBTalk 是一个基于 Expo SDK 54 + React Native + TypeScript 的碎碎念（微博客）移动端应用，支持 Markdown 编辑、多媒体附件、语音录入、防窥模式等功能。

## 术语表

- **App**: ChewyBBTalk Mobile 应用程序
- **BBTalk**: 碎碎念，应用中的核心内容单元（一条微博客帖子）
- **API_Client**: 应用内的 HTTP 客户端模块，负责与后端通信
- **Auth_Service**: JWT 认证服务模块，管理登录、注册、Token 刷新
- **Home_Screen**: 首页列表页面，展示 BBTalk 列表
- **Compose_Screen**: 发布/编辑页面
- **Drawer**: 侧滑抽屉组件，包含日历热力图和标签筛选
- **Privacy_Guard**: 防窥模式模块
- **Theme_System**: 主题系统模块
- **Voice_Recorder**: 语音录入模块
- **Tag_Manager**: 标签管理模块
- **Cache_Manager**: 缓存管理模块
- **Data_Manager**: 数据导入导出模块
- **Storage_Settings**: S3 存储配置模块
- **EAS_Build**: Expo Application Services 构建系统
- **Skeleton_Screen**: 骨架屏，加载时显示的内容占位动画
- **Undo_Toast**: 撤销提示条，删除操作后短暂显示的可撤销通知

---

## 第一部分：现有功能基线

> 以下需求描述 App 当前已实现的功能，作为基线参考。

### 需求 B1：JWT 认证与多服务器管理

**用户故事：** 作为用户，我希望通过账号密码登录应用并支持自托管服务器，以便在不同环境下使用应用。

#### 验收标准

1. WHEN 用户提交有效的用户名和密码, THE Auth_Service SHALL 获取 JWT access token 和 refresh token 并存储到 SecureStore
2. WHEN 用户提交有效的注册信息, THE Auth_Service SHALL 创建账户并自动登录
3. WHILE access token 距过期不足 5 分钟, THE Auth_Service SHALL 自动使用 refresh token 刷新 access token
4. IF access token 已过期且刷新失败, THEN THE Auth_Service SHALL 清除认证信息并要求用户重新登录
5. WHEN App 运行在 Web 平台, THE Auth_Service SHALL 使用 localStorage 替代 SecureStore 存储 token
6. WHEN 用户在登录页输入自定义服务器地址, THE App SHALL 将该地址持久化到 AsyncStorage 并用于后续所有 API 请求
7. WHEN 用户登录成功, THE Privacy_Guard SHALL 自动清除防窥锁定状态

### 需求 B2：首页 BBTalk 列表

**用户故事：** 作为用户，我希望在首页浏览所有碎碎念，支持搜索和筛选，以便快速找到想要的内容。

#### 验收标准

1. WHEN 首页加载完成, THE Home_Screen SHALL 以分页列表形式展示 BBTalk，支持下拉刷新和无限滚动加载
2. THE Home_Screen SHALL 使用 react-native-markdown-display 渲染 BBTalk 内容中的 Markdown 格式（标题、粗体、斜体、代码、引用、链接、列表）
3. WHEN 用户在 header 搜索栏输入关键词, THE Home_Screen SHALL 按关键词筛选 BBTalk 列表
4. WHEN 用户选择标签或日期筛选条件, THE Home_Screen SHALL 按条件筛选列表并在 header 显示 filter badge
5. WHEN BBTalk 被置顶, THE Home_Screen SHALL 将该 BBTalk 排在列表最前并显示金色📌标记
6. WHEN 用户点击 BBTalk 卡片中的图片, THE Home_Screen SHALL 打开全屏图片预览并支持双指缩放
7. WHEN BBTalk 包含音频附件, THE Home_Screen SHALL 在卡片内显示音频播放器（进度条 + 播放/暂停按钮）
8. WHEN BBTalk 包含视频附件, THE Home_Screen SHALL 在卡片内嵌入视频播放器（原生控件 + 全屏支持）
9. WHEN BBTalk 包含文件附件, THE Home_Screen SHALL 显示文件卡片并支持点击打开
10. WHEN 用户点击 BBTalk 卡片, THE Home_Screen SHALL 导航到编辑页面
11. WHEN 用户点击 BBTalk 卡片的 `···` 菜单, THE Home_Screen SHALL 显示操作选项（编辑、置顶/取消置顶、删除、可见性切换）

### 需求 B3：语音录入

**用户故事：** 作为用户，我希望通过语音快速录入碎碎念，以便在不方便打字时也能记录想法。

#### 验收标准

1. WHEN 用户长按首页新建按钮, THE Voice_Recorder SHALL 开始录音并显示录音浮层
2. WHEN 录音完成且 App 运行在 dev build 环境, THE Voice_Recorder SHALL 使用 iOS SFSpeechRecognizer 将语音转换为文字
3. WHEN 录音完成且 App 运行在 Expo Go 环境, THE Voice_Recorder SHALL 仅保存录音文件而不进行语音转文字
4. WHEN 语音录入完成, THE Voice_Recorder SHALL 自动将录音上传为音频附件并创建 BBTalk
5. WHEN 用户在编辑页点击工具栏麦克风按钮, THE Voice_Recorder SHALL 录音并将转写文字追加到编辑内容

### 需求 B4：发布与编辑

**用户故事：** 作为用户，我希望使用 Markdown 编辑器创建和编辑碎碎念，支持多媒体附件和标签。

#### 验收标准

1. THE Compose_Screen SHALL 提供 Markdown 文本编辑器和工具栏快捷插入按钮
2. WHEN 用户在内容中输入 `#标签名`, THE Compose_Screen SHALL 自动识别标签并提供快速标签选择
3. THE Compose_Screen SHALL 支持上传图片、视频、文件和语音附件
4. THE Compose_Screen SHALL 提供 GPS 定位、可见性切换（公开/私密/好友）和字数统计功能
5. WHILE 用户正在编辑内容, THE Compose_Screen SHALL 自动保存草稿到本地存储

### 需求 B5：防窥模式

**用户故事：** 作为用户，我希望在离开应用一段时间后自动锁定，保护隐私内容不被他人查看。

#### 验收标准

1. THE Privacy_Guard SHALL 提供 1 到 60 分钟的可配置超时时长
2. WHILE 防窥模式启用, THE Privacy_Guard SHALL 在界面显示倒计时（点击立即锁定，长按进入设置）
3. WHEN 超时时间到达, THE Privacy_Guard SHALL 锁定应用并要求密码或生物识别（Face ID / Touch ID）解锁
4. WHERE 用户启用"锁定时允许新建"选项, THE Privacy_Guard SHALL 在锁定状态下允许新建 BBTalk 和语音录入

### 需求 B6：主题系统

**用户故事：** 作为用户，我希望选择不同的视觉主题，以获得个性化的使用体验。

#### 验收标准

1. THE Theme_System SHALL 提供 5 套主题：默认蓝、深色、清新绿、玫瑰红、活力橙
2. THE Theme_System SHALL 将主题适配应用到所有页面（首页、设置、防窥、存储、数据管理等）
3. WHEN 用户选择主题, THE Theme_System SHALL 将选择持久化到 AsyncStorage 并在下次启动时恢复
4. THE Theme_System SHALL 在主题设置页提供可视化预览

### 需求 B7：侧滑抽屉

**用户故事：** 作为用户，我希望通过侧滑抽屉快速浏览日历热力图和标签列表，以便按日期或标签筛选内容。

#### 验收标准

1. WHEN 用户从屏幕左边缘向右滑动, THE Drawer SHALL 以动画形式打开
2. THE Drawer SHALL 显示日历热力图，按月浏览，按日期聚合 BBTalk 数量
3. WHEN 用户点击日历中的日期, THE Home_Screen SHALL 筛选显示该日期的 BBTalk
4. THE Drawer SHALL 显示可折叠的标签列表，每个标签带颜色圆点和计数
5. THE Drawer SHALL 在底部显示用户信息和设置入口

### 需求 B8：设置与数据管理

**用户故事：** 作为用户，我希望管理个人信息、存储配置和应用数据，以便自定义应用行为和备份数据。

#### 验收标准

1. THE App SHALL 提供个人信息编辑页面，支持修改用户名、显示名、头像和简介
2. THE Storage_Settings SHALL 提供 S3 存储配置管理界面
3. THE Data_Manager SHALL 支持以 JSON 和 ZIP 格式导入导出 BBTalk 数据
4. THE Cache_Manager SHALL 按类型（音频、视频、语音）统计缓存大小并支持一键清理
5. THE Tag_Manager SHALL 提供独立页面支持标签的编辑、删除、改颜色和排序操作
6. THE Home_Screen SHALL 记录搜索历史并在搜索时提供快速选择

---

## 第二部分：下一阶段新功能需求（P0 + P1）

### 需求 1：EAS Build 构建配置

**用户故事：** 作为开发者，我希望配置 EAS Build 以生成可提交 App Store 的 iOS 构建包。

#### 验收标准

1. THE App SHALL 包含有效的 `eas.json` 配置文件，定义 development、preview 和 production 三个构建 profile
2. WHEN 执行 `eas build --platform ios --profile production` 命令, THE EAS_Build SHALL 生成签名的 iOS 构建包（.ipa 文件）
3. THE App SHALL 在 `app.json` 中配置有效的 `ios.bundleIdentifier`（格式为反向域名，如 `com.chewy.bbtalk`）
4. THE App SHALL 配置 iOS 代码签名所需的证书和 Provisioning Profile

### 需求 2：App 品牌资源

**用户故事：** 作为开发者，我希望为应用配置专业的图标和启动屏，以满足 App Store 上架要求。

#### 验收标准

1. THE App SHALL 包含 1024x1024 像素的应用图标，配置在 `app.json` 的 `icon` 字段
2. THE App SHALL 包含启动屏（splash screen）图片，配置在 `app.json` 的 `splash` 字段
3. THE App SHALL 在 `app.json` 中配置完整的应用名称（`name`）和版本号（`version`）
4. WHEN App 启动时, THE App SHALL 显示品牌启动屏直到应用初始化完成

### 需求 3：隐私政策

**用户故事：** 作为开发者，我希望提供隐私政策页面，以满足 App Store 审核要求。

#### 验收标准

1. THE App SHALL 提供可通过 URL 访问的隐私政策页面
2. THE App SHALL 在隐私政策中说明数据收集范围（GPS 定位、语音录音、生物识别）、数据存储方式和用户权利
3. THE App SHALL 在设置页面提供隐私政策链接入口
4. WHEN 用户首次注册, THE App SHALL 展示隐私政策链接供用户查阅

### 需求 4：App Store 上架资料

**用户故事：** 作为开发者，我希望准备完整的 App Store 上架资料，以顺利通过审核并上架。

#### 验收标准

1. THE App SHALL 准备两套 App Store 截图：6.7 英寸（iPhone 15 Pro Max）和 5.5 英寸（iPhone 8 Plus）
2. THE App SHALL 准备 App Store 元数据：应用标题（30 字符内）、副标题（30 字符内）、关键词（100 字符内）和详细描述
3. THE App SHALL 选择正确的 App Store 分类（建议：社交网络 或 生活方式）
4. THE App SHALL 准备 App 审核所需的测试账号信息

### 需求 5：公网后端部署

**用户故事：** 作为开发者，我希望将后端部署到公网服务器，以便 App Store 审核和用户正常使用。

#### 验收标准

1. THE App SHALL 配置生产环境的默认 API 地址，指向公网 HTTPS 后端
2. WHEN App 连接生产后端, THE API_Client SHALL 通过 HTTPS 协议通信
3. IF 后端服务不可达, THEN THE App SHALL 显示明确的网络错误提示而非白屏或崩溃
4. THE App SHALL 保留自定义服务器地址功能，允许用户切换到自托管实例

### 需求 6：骨架屏与加载态

**用户故事：** 作为用户，我希望在内容加载时看到骨架屏占位，而不是空白页面，以获得更流畅的体验。

#### 验收标准

1. WHILE Home_Screen 首次加载 BBTalk 列表, THE Home_Screen SHALL 显示骨架屏动画（模拟卡片布局的灰色占位块）
2. THE Skeleton_Screen SHALL 包含与 BBTalk 卡片一致的布局结构（头像区、文字行、附件区占位）
3. WHEN 数据加载完成, THE Home_Screen SHALL 以平滑过渡替换骨架屏为实际内容
4. THE Skeleton_Screen SHALL 适配当前激活的主题配色

### 需求 7：编辑退出确认

**用户故事：** 作为用户，我希望在编辑页有未保存内容时返回能收到确认提示，以避免意外丢失编辑内容。

#### 验收标准

1. WHEN 用户在 Compose_Screen 有未保存的修改并尝试返回, THE Compose_Screen SHALL 显示确认对话框（包含"放弃"和"继续编辑"选项）
2. WHEN 用户选择"放弃", THE Compose_Screen SHALL 丢弃未保存内容并返回上一页
3. WHEN 用户选择"继续编辑", THE Compose_Screen SHALL 关闭对话框并保持当前编辑状态
4. WHEN 编辑内容与原始内容相同, THE Compose_Screen SHALL 直接返回而不显示确认对话框

### 需求 8：删除撤销

**用户故事：** 作为用户，我希望删除碎碎念后有短暂的撤销机会，以防止误删重要内容。

#### 验收标准

1. WHEN 用户确认删除一条 BBTalk, THE Home_Screen SHALL 立即从列表中移除该 BBTalk 并在底部显示 Undo_Toast
2. THE Undo_Toast SHALL 显示"已删除"文案和"撤销"按钮，持续 3 秒后自动消失
3. WHEN 用户在 3 秒内点击"撤销"按钮, THE Home_Screen SHALL 恢复被删除的 BBTalk 到原位置并取消删除请求
4. WHEN Undo_Toast 超时消失且用户未点击撤销, THE Home_Screen SHALL 向后端发送实际的删除请求
5. IF 删除请求失败, THEN THE Home_Screen SHALL 恢复该 BBTalk 到列表并显示错误提示

### 需求 9：图片全屏优化

**用户故事：** 作为用户，我希望图片全屏预览支持流畅的手势缩放，以获得更好的图片浏览体验。

#### 验收标准

1. WHEN 用户打开图片全屏预览, THE Home_Screen SHALL 使用 expo-image 的手势缩放能力替代 ScrollView 方案
2. THE Home_Screen SHALL 支持双指捏合缩放和双击缩放/还原手势
3. WHEN 图片处于缩放状态, THE Home_Screen SHALL 支持单指拖动平移查看图片细节
4. WHEN 用户向下滑动未缩放的图片, THE Home_Screen SHALL 关闭全屏预览

### 需求 10：下拉刷新动画

**用户故事：** 作为用户，我希望下拉刷新时看到匹配主题色的自定义动画，以获得一致的视觉体验。

#### 验收标准

1. WHEN 用户在 Home_Screen 下拉触发刷新, THE Home_Screen SHALL 显示自定义刷新指示器
2. THE Home_Screen SHALL 使刷新指示器的颜色匹配当前激活主题的主色调
3. WHILE 数据正在刷新, THE Home_Screen SHALL 持续显示刷新动画直到数据加载完成

---

## 第三部分：后续阶段路线图（参考）

> 以下为 P2-P4 阶段的功能概述，供后续规划参考，不在本次开发范围内。

### P2 — 功能增强
- 后端语音转文字（Whisper API / faster-whisper，作为设备端 STT 的 fallback）
- 分享功能（分享单条碎碎念到微信/其他 app）
- Markdown 编辑预览模式
- 批量操作（长按多选，批量删除/改标签/改可见性）
- 存储迁移（本地 ↔ S3 附件迁移）

### P3 — 进阶功能
- 推送通知（FCM / APNs）
- 深度链接（分享链接打开 App 对应内容）
- 离线缓存（SQLite / MMKV）
- iOS 桌面 Widget
- Sign in with Apple
- 国际化（i18n 英文支持）
- iPad 分栏适配
- 手势操作（左滑删除、右滑置顶）
- 数据统计（写作频率、字数统计、标签分布图表）

### P4 — 长期规划
- Android 上架（Google Play Store）
- 端到端加密
- 多用户/社交（关注、评论、点赞）
- AI 功能（智能标签建议、内容摘要、情绪分析）
- 跨平台同步（多设备实时同步）
