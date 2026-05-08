# 需求文档：ChewyBBTalk Desktop 悬浮球（Floating Ball）

## 简介

为 ChewyBBTalk 提供一个轻量的桌面端应用，核心形态是一个**全局置顶、可在屏幕自由拖动的圆形悬浮按钮**（类似 iOS AssistiveTouch 小圆球）。首版只做极简功能：

1. 常驻桌面，永远悬浮在最前。
2. 自由拖动，并能吸附到屏幕边缘。
3. 点击弹出一个小菜单，提供"新建 BBTalk"、"跳转 Web 版"两个核心动作。
4. "新建 BBTalk"直接在本地弹出一个极简的编辑小窗口（单窗口、Markdown 文本框 + 发布按钮），发布后调用现有后端 API。
5. "跳转 Web 版"在系统默认浏览器中打开用户配置的 Web 地址（默认 `https://bbtalk.cone387.top`）。

技术栈：Electron + TypeScript + React + Vite（复用前端现有组件生态，便于后续扩展到更完整的桌面功能）。支持平台：Windows 10+、macOS 12+、Linux（X11/Wayland 尽力而为）。

后端：现有 Django 5.2 + DRF `/api/bbtalks/` 接口。桌面端通过 JWT 登录复用后端认证。

## 术语表

- **Desktop_App**：ChewyBBTalk Desktop 应用程序。
- **Ball**：桌面悬浮球窗口，圆形、无边框、始终置顶、可拖动。
- **Ball_Menu**：点击 Ball 弹出的径向或弹窗菜单，包含若干 Action。
- **Compose_Window**：极简编辑窗口，点击"新建 BBTalk"时打开，复用前端 `BBTalkEditor` 组件或重写轻量版。
- **Settings_Window**：偏好设置窗口，配置 API 地址、账号、Ball 外观等。
- **Tray**：系统托盘/菜单栏图标，提供"退出"、"显示/隐藏 Ball"、"设置"等右键菜单。
- **Global_Hotkey**：全局快捷键，默认 `Ctrl/Cmd + Shift + B` 切换 Ball 显隐，`Ctrl/Cmd + Shift + N` 直接唤起 Compose_Window。
- **Auth_Service**：与后端同款的 JWT 认证模块，将 token 保存在 OS 级安全存储（keytar / Windows Credential Manager / macOS Keychain / libsecret）。
- **API_Client**：HTTP 客户端，复用 axios 或 fetch，携带 JWT 访问后端。
- **Drag_Layer**：拖拽处理层，通过 `-webkit-app-region: drag` 或自定义 mousedown 实现；在 Electron 中使用 `BrowserWindow.setPosition`。
- **Snap_Edge**：吸边行为，Ball 靠近屏幕边缘时自动吸附并隐藏一半（鼠标移入时展开）。

## 需求

### 需求 1：桌面应用工程与打包

**用户故事：** 作为开发者，我需要搭建一个可在三大桌面平台构建与分发的 Electron 工程，以便用户下载安装后即可使用。

#### 验收标准

1. THE 项目 SHALL 新建 `desktop/` 子目录，包含 Electron 主进程（`main.ts`）、渲染进程（React + Vite）和预加载脚本（`preload.ts`）。
2. THE Desktop_App SHALL 使用 `electron-builder` 打包产出：Windows NSIS 安装包（`.exe`）、macOS DMG（`.dmg`，支持 arm64 与 x64 双架构）、Linux AppImage（`.AppImage`）。
3. THE Desktop_App SHALL 配置 `electron-updater` 以支持后续自动更新（本版本仅接入模块，不要求实际发布更新源）。
4. WHEN 开发者在仓库根执行 `npm run desktop:dev`, THE 构建系统 SHALL 启动 Vite 开发服务与 Electron 主进程，实现热更新。
5. THE Desktop_App SHALL 在 Windows、macOS、Linux 下启动后 5 秒内显示 Ball 窗口（基于 M1 MacBook Air / i5-8250U 参考机型）。
6. THE Desktop_App SHALL 配置 CSP（Content Security Policy）禁止任意外部脚本加载，仅允许 `'self'` 与配置的 API 域。

### 需求 2：Ball 悬浮窗

**用户故事：** 作为用户，我希望看到一个始终悬浮在其他窗口之上的圆形小球，可以在任何屏幕位置拖动它。

#### 验收标准

1. THE Ball SHALL 是一个无边框（`frame: false`）、透明背景（`transparent: true`）、不显示于任务栏（`skipTaskbar: true`）、始终置顶（`alwaysOnTop: true, level: 'screen-saver'` 或等价配置）的 BrowserWindow。
2. THE Ball SHALL 呈现为直径 56px 的圆形按钮，主色为 `#3B82F6`（与 App/Web 默认蓝主题一致），中央显示 `+` 图标。
3. WHEN 用户按住 Ball 并拖动, THE Drag_Layer SHALL 以 60fps 跟随鼠标位置移动 Ball 窗口，全程不卡顿。
4. WHEN 用户释放鼠标且 Ball 距屏幕任意边缘 < 40px, THE Snap_Edge SHALL 将 Ball 自动吸附到该边缘，并隐藏半个球体在屏幕外（仅露出约 28px）。
5. WHEN 鼠标移入已吸边的 Ball, THE Snap_Edge SHALL 将 Ball 完整显示出来（约 200ms 过渡）。
6. WHEN 鼠标离开吸边状态下的 Ball 超过 1.5 秒, THE Snap_Edge SHALL 恢复隐藏半球状态。
7. THE Ball SHALL 在多显示器环境下支持跨屏拖动，吸边判断基于当前所在显示器的边界。
8. THE Ball 的位置 SHALL 在应用退出时持久化（`electron-store`），下次启动还原到上次位置；首次启动默认出现在主屏幕右下角，距右边缘 24px，距下边缘 120px。
9. WHEN 全屏视频 / 演示模式被系统标记, THE Ball SHALL 可被用户通过设置选择"全屏时自动隐藏"（默认开启）。

### 需求 3：Ball 菜单与核心动作

**用户故事：** 作为用户，我希望点击悬浮球可以看到常用功能入口，一键完成新建或跳转。

#### 验收标准

1. WHEN 用户单击 Ball（非拖动）, THE Ball_Menu SHALL 在 Ball 周围弹出放射状或线性菜单，包含至少以下三项：
   - "新建" → 打开 Compose_Window
   - "打开 Web" → 调用系统默认浏览器打开配置的 Web URL
   - "设置" → 打开 Settings_Window
2. THE Ball_Menu SHALL 根据 Ball 靠近屏幕的边缘自适应弹出方向（靠右则向左弹，靠上则向下弹），避免菜单项超出屏幕。
3. WHEN 用户点击菜单外的任意区域, THE Ball_Menu SHALL 关闭。
4. WHEN 用户双击 Ball, THE Desktop_App SHALL 直接打开 Compose_Window（作为快捷方式，跳过菜单）。
5. WHEN 用户右键点击 Ball, THE Desktop_App SHALL 显示操作系统原生菜单，包含"打开 Web"、"设置"、"隐藏 Ball"、"退出"。
6. THE Ball_Menu 展开 / 收起动画 SHALL 在 200ms 内完成，采用 ease-out 缓动。

### 需求 4：Compose 编辑窗口

**用户故事：** 作为用户，我希望点击"新建"就能立刻打开一个小窗口写碎碎念，不被打断。

#### 验收标准

1. THE Compose_Window SHALL 是一个 420×360 的无边框窗口，带圆角与阴影，始终置顶（`alwaysOnTop: true`）。
2. THE Compose_Window SHALL 包含顶部拖动栏（含关闭按钮）、Markdown 文本输入区（多行）、底部操作栏（字数统计 + "发布"按钮）。
3. WHEN 用户输入内容并点击"发布", THE API_Client SHALL 调用 `POST /api/bbtalks/` 创建 BBTalk，content 字段为用户输入，visibility 默认为 `private`。
4. WHEN 发布成功, THE Compose_Window SHALL 展示一次性 Toast "已发布"，清空输入框并自动关闭（500ms 后）。
5. IF 发布失败（网络 / 鉴权 / 校验）, THEN THE Compose_Window SHALL 在底部显示错误提示，保留用户输入不关闭窗口。
6. WHEN 用户按下 `Esc`, THE Compose_Window SHALL 关闭；若有未发布的非空内容，弹出确认对话框。
7. WHEN 用户按下 `Ctrl/Cmd + Enter`, THE Compose_Window SHALL 立即触发发布。
8. THE Compose_Window SHALL 支持拖入图片（最多 3 张，单张 ≤ 10MB），通过 `POST /api/bbtalks/` 的 attachments 字段或附件接口上传；本期可先仅支持纯文本 + 图片 URL 自动转附件（图片上传详细流程见 design）。
9. THE Compose_Window SHALL 在启动时从 `localStorage` / `electron-store` 读取草稿并还原；内容变化时每 2 秒自动保存草稿。

### 需求 5：登录与设置

**用户故事：** 作为用户，我希望首次使用时输入账号密码并配置 API 地址，之后不再重复登录。

#### 验收标准

1. THE Desktop_App SHALL 在首次启动或 token 无效时显示登录窗口，收集 username、password、API 地址（默认 `https://bbtalk.cone387.top`）。
2. THE Auth_Service SHALL 调用后端 `/api/auth/token/` 获取 access token 与 refresh token，并通过 `keytar` 将 refresh token 存入 OS 安全存储。
3. WHILE access token 距过期不足 5 分钟, THE Auth_Service SHALL 自动调用 `/api/auth/token/refresh/` 刷新。
4. IF refresh token 失效, THEN THE Desktop_App SHALL 清除本地 token 并回到登录窗口。
5. THE Settings_Window SHALL 允许用户修改：API 地址、Web URL、Ball 尺寸（小 40 / 中 56 / 大 72）、主色、全屏时隐藏 Ball 开关、全局快捷键、开机启动开关。
6. WHEN 用户启用"开机启动", THE Desktop_App SHALL 通过 `app.setLoginItemSettings` 注册开机项（Windows / macOS）或写入 `.desktop` autostart 文件（Linux）。
7. WHEN 用户修改 API 地址, THE API_Client SHALL 立即使用新地址，现有 token 若不匹配则要求重新登录。
8. THE Settings_Window SHALL 允许用户退出登录，退出后返回登录窗口并隐藏 Ball。

### 需求 6：系统集成（托盘 / 快捷键 / 通知）

**用户故事：** 作为用户，我希望桌面端像常驻工具一样，不打扰但随时可召唤。

#### 验收标准

1. THE Desktop_App SHALL 在系统托盘（Windows / Linux）或菜单栏（macOS）显示图标，图标点击切换 Ball 显隐。
2. THE Tray 右键菜单 SHALL 包含：新建、打开 Web、显示/隐藏 Ball、设置、关于、退出。
3. THE Desktop_App SHALL 注册 Global_Hotkey：默认 `Ctrl/Cmd + Shift + B` 切换 Ball，`Ctrl/Cmd + Shift + N` 唤起 Compose_Window。
4. WHEN 用户在 Settings_Window 自定义快捷键, THE Desktop_App SHALL 使用 `globalShortcut.register/unregister` 动态更新。
5. WHEN BBTalk 发布成功, THE Desktop_App SHALL 通过系统通知（`Notification`）显示"已发布：<前 20 字>"（可在设置中关闭）。
6. WHEN 应用关闭主窗口（不是退出）, THE Desktop_App SHALL 继续在后台运行，Ball 持续可见，直到用户显式选择"退出"。

### 需求 7：可扩展性与占位

**用户故事：** 作为产品负责人，我希望本版只实现最小功能，但为后续功能保留清晰的扩展点。

#### 验收标准

1. THE Ball_Menu SHALL 通过配置文件（`desktop/src/config/ball-menu.ts`）声明式定义菜单项，后续添加新 Action 只需新增一项即可。
2. THE Desktop_App SHALL 在代码中保留以下功能的 TODO 占位与接口草案（不要求实现）：
   - 语音输入（按住 Ball 录音）
   - 截图 → 一键贴到 BBTalk
   - 划词保存（选中文字后右键"加入 BBTalk"）
   - 查看最近 5 条 BBTalk
   - 番茄钟 / 时间记录
   - 深色模式切换
3. THE Desktop_App SHALL 在 README 中明确列出"已实现"与"待规划"的功能矩阵，便于后续迭代。

### 需求 8：性能与稳定性

**用户故事：** 作为用户，我希望这个常驻工具足够轻，不拖慢电脑。

#### 验收标准

1. THE Desktop_App 空闲（Ball 可见、无交互）状态下的 CPU 占用 SHALL 低于 1%（M1 / i5 基准），内存占用 < 150 MB。
2. THE Ball 从启动到可交互（展示并响应点击）的耗时 SHALL < 3 秒。
3. THE Compose_Window 从触发到展示 SHALL < 500 ms。
4. THE Desktop_App SHALL 在主进程未捕获异常时写入日志文件（位置由 `app.getPath('logs')` 决定）并继续运行 Ball；仅在 Ball 渲染进程崩溃时自动拉起。
5. THE Desktop_App SHALL 处理"断网 → 恢复"场景：发布失败时允许用户重试，断网状态下显示明显提示。

### 需求 9：安全

**用户故事：** 作为用户，我希望密码与 token 不被泄露，应用行为可审计。

#### 验收标准

1. THE Desktop_App SHALL 启用 Electron `contextIsolation: true` 与 `nodeIntegration: false`，所有 Node API 通过 `preload.ts` 以 `contextBridge.exposeInMainWorld` 暴露受限 API。
2. THE Auth_Service SHALL 将 refresh token 交给 `keytar` 存储，不写入明文文件。
3. THE Desktop_App SHALL 使用 HTTPS 与后端通信；若用户在 Settings 配置了 HTTP 地址，需二次确认并记录警告。
4. THE Desktop_App SHALL 在 About 窗口列出依赖的开源组件与版本，便于合规审计。
5. THE Desktop_App SHALL 在应用更新（electron-updater）时校验签名，拒绝加载未签名或签名不匹配的更新包。
