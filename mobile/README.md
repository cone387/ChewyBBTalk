# ChewyBBTalk Mobile

基于 Expo + React Native 的碎碎念移动端应用。

首发准备与本轮实现、邮件配置、测试结果及真机验收项见 [RELEASE_READINESS.md](RELEASE_READINESS.md)。

## 快速开始

```bash
cd mobile
npm install
npx expo start
```

- 按 `w` 在浏览器中预览
- 按 `i` 打开 iOS 模拟器
- 用 Expo Go 扫码在真机上运行

## 项目结构

```
mobile/
├── App.tsx                    # 入口：页面导航、主题
├── src/
│   ├── config.ts              # API 地址配置（支持多服务器）
│   ├── types/index.ts         # 类型定义
│   ├── navigation/MainTabs.tsx # 底部导航：记录、日历、我的
│   ├── theme/
│   │   └── ThemeContext.tsx    # 多主题系统（5套主题）
│   ├── components/
│   │   ├── AudioPlayerButton.tsx  # 卡片内音频播放器
│   │   ├── VideoPlayerButton.tsx  # 卡片内视频播放器
│   │   └── VoiceRecordingOverlay.tsx # 语音录入浮层
│   ├── services/
│   │   ├── auth.ts            # JWT 认证（SecureStore）
│   │   └── api/
│   │       ├── apiClient.ts   # HTTP 客户端（自动 token 刷新）
│   │       ├── bbtalkApi.ts   # BBTalk CRUD + 置顶 + 日期聚合
│   │       ├── tagApi.ts      # 标签 CRUD
│   │       ├── mediaApi.ts    # 附件上传
│   │       └── userApi.ts     # 用户信息更新
│   ├── store/
│   │   ├── index.ts           # Redux store
│   │   ├── hooks.ts           # useAppDispatch / useAppSelector
│   │   └── slices/
│   │       ├── bbtalkSlice.ts # BBTalk 状态管理
│   │       └── tagSlice.ts    # 标签状态管理
│   └── screens/
│       ├── LoginScreen.tsx           # 登录/注册 + 服务器选择
│       ├── HomeScreen.tsx            # 首页列表 + 防窥 + 搜索
│       ├── ComposeScreen.tsx         # 发布/编辑（Markdown + 附件 + 语音）
│       ├── CalendarScreen.tsx        # 日历回顾，选择日期查看记录
│       ├── SettingsScreen.tsx        # 设置主页
│       ├── ProfileEditScreen.tsx     # 个人信息编辑
│       ├── ThemeSettingsScreen.tsx    # 主题切换
│       ├── PrivacySettingsScreen.tsx  # 防窥设置
│       ├── StorageSettingsScreen.tsx  # S3 存储配置
│       ├── DataManagementScreen.tsx   # 数据导入导出
│       ├── CacheManagementScreen.tsx  # 缓存管理
│       └── AudioPlayScreen.tsx       # 独立音频播放页
```

## 已实现功能

### 认证
- JWT Token 登录/注册，Token 自动刷新
- SecureStore 存储 token（Web 端 fallback localStorage）
- 多服务器地址管理（支持 self-hosted）
- 登录成功自动清除防窥锁定

### 首页
- BBTalk 列表（下拉刷新 + 无限滚动）
- Markdown 渲染（标题、粗体、斜体、代码、引用、链接、列表）
- 搜索（header 内嵌搜索栏）
- 标签筛选 + 日期筛选（header 显示 filter badge）
- 置顶功能（置顶的 BBTalk 排在最前，带金色📌标记）
- 图片预览（全屏 + 双指缩放）
- 音频卡片内播放（进度条 + 播放/暂停）
- 视频卡片内嵌画面播放（原生控件 + 全屏）
- 文件附件卡片（点击打开）
- 卡片操作：点击阅读，详情页显式编辑，`···` 菜单（编辑/置顶/取消置顶/删除），可见性切换
- 长按 FAB 语音录入（录音 + 语音转文字 + 自动保存）
- 错误弹窗支持复制内容

### 语音录入
- 长按新建按钮触发录音
- 设备端语音转文字（iOS SFSpeechRecognizer，需 dev build）
- Expo Go 优雅降级（仅录音不转文字）
- 录音自动上传为音频附件
- 编辑页工具栏也有麦克风按钮（语音追加到内容）

### 发布/编辑
- Markdown 编辑 + 工具栏快捷插入
- `#标签` 自动识别 + 快速标签选择
- 图片/视频/文件/语音上传
- GPS 定位、可见性切换、字数统计
- 草稿自动保存（400ms、切后台落盘、重启恢复），附件失败保留并可重试

### 防窥模式
- 可配置超时时长（1-60 分钟）
- 倒计时显示（点击立即锁定，长按进设置）
- 密码解锁 + 生物识别（Face ID / Touch ID）
- 锁定时可选允许新建 + 语音录入
- 登录成功自动解除锁定

### 主题系统
- 5 套主题：默认蓝、深色、清新绿、玫瑰红、活力橙
- 全页面适配（首页、设置、防窥、存储、数据管理）
- 主题选择持久化到 AsyncStorage
- 可视化预览选择

### 底部导航
- 记录：列表、搜索、标签快捷筛选与新建记录
- 日历：按月回顾，选择有记录的日期筛选对应记录
- 我的：个人信息、标签管理及分组设置
- 切换页面保留记录位置；防窥锁定后隐藏导航，解锁后恢复

### 设置
- 个人信息编辑（独立页面，API 对接）
- 主题设置
- 防窥设置
- 存储设置（S3 配置管理）
- 数据管理（导入导出 JSON/ZIP）
- 缓存管理（按类型统计大小，一键清理媒体缓存）

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Expo SDK 54 + React Native |
| 语言 | TypeScript |
| 状态管理 | Redux Toolkit |
| 导航 | React Navigation (Native Stack) |
| 音频 | expo-audio（录音 + 播放） |
| 视频 | expo-video（内嵌播放） |
| 语音识别 | @react-native-voice/voice（设备端 STT） |
| 存储 | expo-secure-store, AsyncStorage |
| 文件 | expo-file-system, expo-document-picker, expo-image-picker |
| 定位 | expo-location |
| 生物识别 | expo-local-authentication |
| Markdown | react-native-markdown-display |

## 开发注意事项

### API 地址
- `src/config.ts` 中 `LAN_IP` 需要改成你电脑的局域网 IP（真机调试用）
- 用户可在登录页配置自定义服务器地址

### iOS 音频播放
- FastAPI 本地附件 preview/download 支持 HTTP Range（206）；S3 附件经权限检查后跳转签名地址。
- 原生列表仅检查本地缓存，点击音频后才下载并播放；失败显示重试，避免滚动列表时自动下载所有录音。
- 音频缓存按账号与来源区分，下载成功后才转为正式缓存，避免换源误播或中断文件被当成完整音频。旧缓存不再复用，可在缓存管理中清理。
- 原生播放保留本地缓存策略；当前服务的私有附件携带认证，外部签名地址不携带本站令牌。Web 使用远程源。

### FastAPI 3.0 适配与升级

- App 与服务端需要一起升级；旧协议 JWT/刷新令牌升级后需要重新登录。账号数据、草稿和待提交标识保留，不要通过清除应用数据处理登录失效。
- API 采用无尾斜杠路径、字符串数组标签、`items/total/page/page_size/has_more` 分页和 PATCH 局部编辑；修改或清除位置会提交 `context`。完整规则见 [FastAPI 契约](../docs/fastapi-contract.md)。
- 新上传附件默认私有，包括未发布和上传后取消的草稿附件；公开发布后由后端同步附件可见性。此修复不追溯更改旧版本已上传的公开附件，管理员应核对历史未发布附件。
- 上传、导入和导出通过共享文件请求服务处理认证：明确 401 才刷新并重试一次；网络中断或 5xx 不自动重放写请求。上传 60 秒、导入导出 120 秒超时，包含响应体读取；刷新请求 10 秒超时。
- 切换账号或服务器后取消旧文件请求并丢弃迟到结果，导出保存和系统分享前再次核对会话。取消请求不代表服务器已撤销导入；超时后先核对数据，再决定是否重试。
- 导入分别展示标签、记录、附件、评论、存储配置及错误明细；`partial`、附件/评论跳过或逐行错误会显示“导入部分完成”。422 与业务错误显示具体字段和原因。
- 重新登录后，未确认的记录提交可先核对回执，再重试原提交，避免误发重复记录。

### Expo Go 限制
- `@react-native-voice/voice` 需要 dev build，Expo Go 中自动降级为仅录音
- Face ID 需要独立构建
- `app.json` 已配置好所有权限

### 缓存管理
- 音频/视频下载到 `FileSystem.cacheDirectory`，文件名前缀 `audio_`/`video_`/`voice_`
- 清理缓存只删除这些前缀的文件，不影响 Expo 系统缓存（字体、图标等）

## 待开发功能

- [ ] 后端语音转文字（Whisper API / faster-whisper，作为设备端 STT 的 fallback）
- [ ] 存储迁移（本地 ↔ S3）
- [ ] 推送通知（FCM / APNs）
- [ ] 深度链接（分享链接打开 App）
- [x] SQLite 离线读取缓存（按服务器与账号隔离）
- [ ] 离线写入补发、冲突处理与同步队列
- [x] EAS 生产构建与提交配置
- [ ] TestFlight 真机验收与正式商店提交
- [ ] Sign in with Apple（可选；加入第三方登录时重新评估审核要求）
- [ ] 国际化
- [x] App 图标和启动屏资源已配置（发布前核验最终素材）
