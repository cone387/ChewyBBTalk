# 需求文档：ChewyBBTalk Mobile v1.1 增强

## 简介

本文档定义 ChewyBBTalk Mobile v1.1 版本的增强功能需求。v1.0 已上架 App Store，v1.1 聚焦两个方向：**用户体验增强**（分享、手势操作、Markdown 实时预览、批量操作）和**技术基础建设**（离线缓存）。目标是让用户在日常使用中获得更自然、更高效的交互体验，同时为弱网/无网场景提供基本的内容浏览能力。

技术栈：Expo SDK 54 + React Native 0.81 + TypeScript + Redux Toolkit  
后端：Django 5.2 + DRF，API 地址 https://bbtalk.cone387.top

## 术语表

- **App**：ChewyBBTalk Mobile 应用程序
- **BBTalk**：碎碎念，应用中的核心内容单元（一条微博客帖子），包含 content、tags、attachments、visibility 等字段
- **Home_Screen**：首页列表页面，展示 BBTalk 列表，已拆分为 BBTalkCard、SearchBar、TagTabs 等子组件
- **Compose_Screen**：发布/编辑页面，支持 Markdown 编辑、附件上传、标签、定位等功能
- **BBTalkCard**：单条碎碎念卡片组件，负责渲染一条 BBTalk 的内容、附件、标签和操作菜单
- **Share_Service**：分享服务模块，负责将 BBTalk 内容组装并调用系统分享接口
- **Gesture_Handler**：手势处理模块，负责识别和响应列表项上的滑动手势
- **Markdown_Previewer**：Markdown 实时预览组件，在编辑时同步渲染 Markdown 格式化内容
- **Batch_Mode**：批量操作模式，允许用户多选 BBTalk 并执行批量动作
- **Offline_Cache**：离线缓存模块，负责将 BBTalk 数据和附件元信息持久化到本地存储
- **Cache_DB**：本地缓存数据库，使用 SQLite 或 MMKV 实现
- **Redux_Store**：应用全局状态管理，基于 Redux Toolkit
- **FlatList**：React Native 提供的高性能列表组件，用于渲染碎碎念列表

## 需求

### 需求 1：分享单条碎碎念

**用户故事：** 作为用户，我希望将一条碎碎念分享到微信或其他应用，以便与朋友分享我的想法和记录。

#### 验收标准

1. WHEN 用户在 BBTalkCard 的操作菜单中点击"分享"选项, THE Share_Service SHALL 调用系统原生分享面板（iOS Share Sheet / Android Share Intent），展示可分享的目标应用列表
2. THE Share_Service SHALL 将 BBTalk 的文本内容和标签组装为分享文本，格式为：正文内容 + 换行 + 标签列表（如 `#标签1 #标签2`）
3. WHEN BBTalk 包含图片附件, THE Share_Service SHALL 将图片文件包含在分享内容中，支持同时分享文本和图片
4. WHEN BBTalk 包含多张图片附件, THE Share_Service SHALL 将所有图片一并包含在分享内容中
5. WHEN BBTalk 仅包含非图片附件（音频、视频、文件）, THE Share_Service SHALL 仅分享文本内容，不包含非图片附件
6. IF 系统分享面板调用失败或用户取消分享, THEN THE Share_Service SHALL 提供"复制到剪贴板"的降级选项，并在复制成功后显示提示
7. WHILE 图片附件正在下载准备分享时, THE Share_Service SHALL 显示加载指示器，阻止重复触发分享操作
8. WHEN App 运行在 Web 平台, THE Share_Service SHALL 优先使用 Web Share API，若不可用则直接复制文本到剪贴板

### 需求 2：手势操作

**用户故事：** 作为用户，我希望通过滑动手势快速操作碎碎念（左滑删除、右滑置顶），以获得更自然高效的交互体验。

#### 验收标准

1. WHEN 用户在 BBTalkCard 上向左滑动超过 80 像素, THE Gesture_Handler SHALL 显示红色"删除"操作区域
2. WHEN 用户释放左滑手势且滑动距离超过阈值, THE Gesture_Handler SHALL 触发删除操作（复用现有的乐观删除 + 撤销机制）
3. WHEN 用户在 BBTalkCard 上向右滑动超过 80 像素, THE Gesture_Handler SHALL 显示蓝色"置顶/取消置顶"操作区域
4. WHEN 用户释放右滑手势且滑动距离超过阈值, THE Gesture_Handler SHALL 触发置顶或取消置顶操作（根据当前置顶状态切换）
5. WHEN 用户滑动距离未超过阈值并释放手势, THE Gesture_Handler SHALL 将卡片以弹性动画回弹到原始位置
6. WHILE 用户正在滑动一张卡片, THE Gesture_Handler SHALL 关闭其他已展开的滑动操作区域，确保同一时刻只有一张卡片处于滑动展开状态
7. WHILE 批量操作模式处于激活状态, THE Gesture_Handler SHALL 禁用滑动手势，避免与多选操作冲突
8. THE Gesture_Handler SHALL 使用 60fps 的原生动画驱动滑动过程，滑动过程中无明显卡顿或掉帧

### 需求 3：Markdown 编辑实时预览

**用户故事：** 作为用户，我希望在编辑碎碎念时实时预览 Markdown 渲染效果，以便确认格式是否符合预期。

#### 验收标准

1. THE Compose_Screen SHALL 在编辑区域提供"编辑"和"预览"两种模式的切换按钮
2. WHEN 用户切换到预览模式, THE Markdown_Previewer SHALL 使用 react-native-markdown-display 渲染当前编辑内容的 Markdown 格式化结果
3. THE Markdown_Previewer SHALL 支持渲染以下 Markdown 语法：标题（h1-h6）、粗体、斜体、删除线、行内代码、代码块、引用、有序列表、无序列表、链接、图片链接
4. WHEN 用户切换回编辑模式, THE Compose_Screen SHALL 恢复文本编辑器并保持光标位置和内容不变
5. THE Markdown_Previewer 的渲染样式 SHALL 与 Home_Screen 中 BBTalkCard 的 Markdown 渲染样式保持一致
6. THE Markdown_Previewer SHALL 适配当前激活的主题配色（背景色、文字色、代码块背景色等）
7. WHEN 编辑内容为空, THE Markdown_Previewer SHALL 显示占位提示文字"暂无内容可预览"

### 需求 4：批量操作

**用户故事：** 作为用户，我希望通过长按进入多选模式，批量删除、修改标签或修改可见性，以便高效管理大量碎碎念。

#### 验收标准

1. WHEN 用户在 Home_Screen 长按任意一张 BBTalkCard 超过 500 毫秒, THE Batch_Mode SHALL 激活批量操作模式，并将该 BBTalk 标记为已选中
2. WHILE 批量操作模式处于激活状态, THE Home_Screen SHALL 在每张 BBTalkCard 左侧显示圆形复选框，已选中的卡片显示填充状态
3. WHILE 批量操作模式处于激活状态, THE Home_Screen SHALL 在顶部显示批量操作工具栏，包含"全选"、"删除"、"改标签"、"改可见性"按钮和已选数量计数
4. WHEN 用户点击"全选"按钮, THE Batch_Mode SHALL 选中当前列表中的所有 BBTalk
5. WHEN 用户点击"删除"按钮且有至少一条 BBTalk 被选中, THE Batch_Mode SHALL 显示确认对话框，确认后逐条执行删除操作并从列表中移除
6. WHEN 用户点击"改标签"按钮且有至少一条 BBTalk 被选中, THE Batch_Mode SHALL 显示标签选择面板，用户选择标签后将所选标签应用到所有选中的 BBTalk
7. WHEN 用户点击"改可见性"按钮且有至少一条 BBTalk 被选中, THE Batch_Mode SHALL 显示可见性选择面板（公开/私密/好友），用户选择后将可见性应用到所有选中的 BBTalk
8. WHEN 用户点击工具栏的关闭按钮或按下系统返回键, THE Batch_Mode SHALL 退出批量操作模式，清除所有选中状态，恢复正常列表交互
9. IF 批量操作过程中某条 BBTalk 的更新请求失败, THEN THE Batch_Mode SHALL 在操作完成后汇总显示失败条目数量和错误原因
10. WHILE 批量操作正在执行（API 请求进行中）, THE Batch_Mode SHALL 显示进度指示器并禁用工具栏按钮，防止重复提交

### 需求 5：离线缓存

**用户故事：** 作为用户，我希望在弱网或无网络环境下仍能浏览已加载过的碎碎念，以便在地铁、飞机等场景下继续使用应用。

#### 验收标准

1. WHEN BBTalk 列表数据从 API 成功加载后, THE Offline_Cache SHALL 将 BBTalk 数据（包括 content、tags、visibility、isPinned、createdAt、updatedAt 等字段）持久化到 Cache_DB
2. WHEN App 启动且网络不可用时, THE Offline_Cache SHALL 从 Cache_DB 读取最近缓存的 BBTalk 数据并填充到 Redux_Store，使 Home_Screen 能够展示缓存内容
3. WHEN App 启动且网络可用时, THE Offline_Cache SHALL 优先从 Cache_DB 加载缓存数据快速展示，同时在后台发起 API 请求获取最新数据并更新缓存
4. WHEN 网络请求成功返回新数据后, THE Offline_Cache SHALL 将 Cache_DB 中的旧数据替换为最新数据
5. THE Offline_Cache SHALL 缓存图片附件的 URL 和元信息（uid、type、filename），但不缓存图片二进制文件本身
6. WHILE 用户正在浏览缓存数据且网络不可用, THE Home_Screen SHALL 在顶部显示"离线模式"提示条，告知用户当前展示的是缓存内容
7. WHILE 网络不可用, THE Home_Screen SHALL 禁用下拉刷新和无限滚动加载功能，避免触发无效的网络请求
8. IF 用户在离线状态下尝试执行写操作（新建、编辑、删除）, THEN THE App SHALL 显示提示"当前处于离线模式，该操作需要网络连接"
9. THE Offline_Cache SHALL 在缓存数据中记录最后同步时间戳，并在"离线模式"提示条中显示"最后同步于 XX 分钟前"
10. WHEN 用户在数据管理页面点击"清除缓存", THE Offline_Cache SHALL 清除 Cache_DB 中的所有缓存数据
