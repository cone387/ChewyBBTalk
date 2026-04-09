# ChewyBBTalk Mobile

基于 Expo + React Native 的碎碎念移动端应用。

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
├── App.tsx                    # 入口：导航、侧滑抽屉、防窥锁定
├── src/
│   ├── config.ts              # API 地址配置（支持多服务器）
│   ├── types/index.ts         # 类型定义（与 Web 端一致）
│   ├── services/
│   │   ├── auth.ts            # JWT 认证（SecureStore / localStorage）
│   │   └── api/
│   │       ├── apiClient.ts   # HTTP 客户端（自动 token 刷新）
│   │       ├── bbtalkApi.ts   # BBTalk CRUD
│   │       ├── tagApi.ts      # 标签 CRUD
│   │       └── mediaApi.ts    # 附件上传
│   ├── store/
│   │   ├── index.ts           # Redux store
│   │   ├── hooks.ts           # useAppDispatch / useAppSelector
│   │   └── slices/
│   │       ├── bbtalkSlice.ts # BBTalk 状态管理
│   │       └── tagSlice.ts    # 标签状态管理
│   └── screens/
│       ├── LoginScreen.tsx         # 登录/注册 + 服务器选择
│       ├── HomeScreen.tsx          # 首页列表 + 防窥 + 搜索
│       ├── ComposeScreen.tsx       # 发布/编辑（Markdown + 附件）
│       ├── DrawerContent.tsx       # 侧滑抽屉（标签筛选）
│       ├── SettingsScreen.tsx      # 设置主页
│       ├── PrivacySettingsScreen.tsx  # 防窥设置
│       ├── StorageSettingsScreen.tsx  # S3 存储配置
│       └── DataManagementScreen.tsx   # 数据导入导出
```

## 已实现功能

### 认证
- JWT Token 登录/注册
- Token 自动刷新（并发控制，防止多次刷新）
- SecureStore 存储 token（Web 端 fallback 到 localStorage）
- 多服务器地址管理（支持 self-hosted）

### 首页
- BBTalk 列表（下拉刷新 + 无限滚动）
- Markdown 渲染（标题、粗体、斜体、代码、引用、链接、列表）
- 搜索（header 内嵌搜索栏，实时过滤）
- 标签筛选（侧滑抽屉，可折叠，带颜色圆点）
- 图片预览（全屏 + 双指缩放）
- 非图片附件卡片（视频/音频/文件，点击打开）
- 卡片操作：点击编辑，`···` 菜单（编辑/置顶/删除），可见性切换，定位信息查看
- 右下角 FAB 新建按钮

### 发布/编辑
- Markdown 编辑（纯文本输入，工具栏快捷插入 B/I/H/列表/引用/代码/链接）
- `#标签` 自动识别 + 标签栏显示（带删除按钮）
- 快速标签选择（从已有标签列表选择）
- 光标位置感知（所有插入操作在光标处）
- 图片/视频/文件上传
- GPS 定位
- 可见性切换（公开/私密）
- 字数统计
- 草稿自动保存（新建模式，返回时缓存，发布后清除）
- 工具栏：单行横向滚动（媒体工具 + Markdown 工具）

### 防窥模式
- 可配置超时时长（1-60 分钟滑块）
- 倒计时显示（可开关）
- 倒计时点击立即锁定，长按进入防窥设置
- 锁定后全屏遮罩 + 密码解锁
- 生物识别解锁（Face ID / Touch ID，需独立构建）
- 锁定状态持久化（刷新不可破解）
- 锁定时可选允许新建 BBTalk（可配置）
- 总开关（可完全关闭防窥）
- 触摸/滚动/导航回来自动重置计时器
- 锁定时自动关闭侧滑抽屉，禁止侧滑打开

### 设置
- 用户信息编辑（显示名称、简介）
- 防窥设置（超时、倒计时、允许新建、总开关）
- 存储设置（S3 配置列表，创建/激活/测试/删除）
- 数据管理（导出 JSON/ZIP，导入 JSON/ZIP）
- 退出登录（固定底部）

### 侧滑抽屉
- 纯 Animated API 实现（无第三方动画库依赖）
- 左边缘滑动手势打开（PanResponder）
- 标签列表（可折叠/展开，带颜色圆点和计数）
- 底部用户信息 + 设置入口

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Expo SDK 54 + React Native |
| 语言 | TypeScript |
| 状态管理 | Redux Toolkit |
| 导航 | React Navigation (Native Stack) |
| 图标 | @expo/vector-icons (Ionicons) |
| 存储 | expo-secure-store, AsyncStorage |
| 文件 | expo-file-system, expo-document-picker, expo-image-picker |
| 定位 | expo-location |
| 生物识别 | expo-local-authentication |
| Markdown | react-native-markdown-display |
| 分享 | expo-sharing |

## 与 Web 端的关系

- `types/` 类型定义与 Web 端一致
- `services/api/` 接口层逻辑从 Web 端复用，适配了异步 token 获取
- `store/` Redux 逻辑与 Web 端一致
- 发布的 BBTalk 自动标记 `source.platform: 'mobile'`，Web 端能识别并显示手机图标

## 开发注意事项

### API 地址
- `src/config.ts` 中 `LAN_IP` 需要改成你电脑的局域网 IP（真机调试用）
- 用户可在登录页配置自定义服务器地址（持久化到 AsyncStorage）

### Expo Go 限制
- Face ID 在 Expo Go 中不可用（缺少 NSFaceIDUsageDescription），需要 `eas build` 独立构建
- `app.json` 已配置好 Face ID 权限，构建后自动生效

### 文件系统
- expo-file-system v19 API 变化大，导出用 `expo-file-system/next`（新 API）+ `expo-file-system/legacy`（writeAsStringAsync base64）
- Web 端不支持 expo-file-system，导出用 blob URL 下载
- ZIP 导出必须用 `writeAsStringAsync` + `encoding: 'base64'` 写真正的二进制

### 防窥模式
- 锁定状态存在 AsyncStorage `privacy_locked` 中，防止刷新破解
- 定时器每秒轮询 AsyncStorage 读取设置变更（超时时长、开关等）
- PanResponder 用 `useRef` 跟踪锁定状态（闭包捕获问题）

### 草稿
- 新建模式：`beforeRemove` 事件保存草稿到 `compose_draft`
- 发布成功：先 `await removeItem`，再设 `publishedRef = true`，再 `goBack`
- `publishedRef` 防止 `beforeRemove` 把已清除的草稿重新存回去

### 侧滑抽屉
- 不使用 `@react-navigation/drawer`（依赖 reanimated，Expo Go 兼容性差）
- 不使用 `react-native-reanimated`（Expo Go 中 Worklets 运行时报错）
- 用 RN 内置 `Animated.timing` + `PanResponder` 实现
- `isOpen` 和 `isLocked` 用 `useRef` 跟踪（PanResponder 闭包问题）

## 待开发功能

- [ ] 用户信息编辑 API 对接
- [ ] 置顶功能
- [ ] 存储迁移（本地 ↔ S3）
- [ ] 推送通知（FCM / APNs）
- [ ] 深度链接（分享链接打开 App）
- [ ] 离线缓存（SQLite / MMKV）
- [ ] EAS Build 独立构建 + 应用商店上架
- [ ] Sign in with Apple（App Store 要求）
- [ ] 主题切换（深色模式）
- [ ] 国际化
