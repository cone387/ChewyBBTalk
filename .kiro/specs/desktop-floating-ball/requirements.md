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

## 核心体验优先级（首版重点）

本 spec 覆盖面广，但首版做得好不好，只看三件事：

1. **Compose 编辑框的手感与质感** — 小巧、精致、一眼爱上的那种。面向未来 AI 扩展（摘要 / 润色 / 续写 / 对话 / 斜杠命令）预留架构位，但本期不实现 AI，只保留接口与 UI 插槽。
2. **Ball 拖动体验** — 60fps 跟手，任何分辨率 / DPI / 多显示器下都不跳、不抖、不卡。按下、移动、释放三个阶段各有微交互反馈。
3. **Ball 位置体验** — 吸边不突兀、展开收起有呼吸感、跨屏迁移符合直觉、首次位置合理、关机重启记忆完整。

其余需求（托盘 / 快捷键 / 自动更新 / 隐私政策 / AI 占位等）在首版只要达到"能用即可"的标准，不做过度打磨。

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

### 需求 2：Ball 悬浮窗（P0 重点）

**用户故事：** 作为用户，我希望看到一个始终悬浮在其他窗口之上的圆形小球，可以在任何屏幕位置拖动它。移动它、吸附它、召唤它的全过程都应该让我觉得"这工具很精致"。

#### 视觉规格

1. THE Ball SHALL 是一个无边框（`frame: false`）、透明背景（`transparent: true`）、不显示于任务栏（`skipTaskbar: true`）、始终置顶（`alwaysOnTop: true, level: 'screen-saver'` 或等价配置）的 BrowserWindow。
2. THE Ball SHALL 呈现为直径 56px 的圆形按钮，主色为 `#3B82F6`（与 App/Web 默认蓝主题一致），中央显示 `+` 图标（24px）。
3. THE Ball 视觉层级 SHALL 包含：外圈 2px 高光（`rgba(255,255,255,0.25)`）、主体径向渐变（从 `#3B82F6` 到 `#2563EB`）、柔和投影（`0 8px 24px rgba(59,130,246,0.35)`），整体表现为悬浮在桌面之上的实体圆球。

#### 拖动体验

4. WHEN 用户按下 Ball 但尚未移动, THE Ball SHALL 在 100ms 内轻微放大至 1.05 倍并略微下陷（模拟按键反馈），鼠标释放（未拖动）恢复到 1.0 倍。
5. WHEN 用户按下并移动超过 4px（拖拽阈值）, THE Drag_Layer SHALL 以至少 60fps 跟随鼠标位置移动 Ball 窗口，移动过程中 CPU 占用峰值 < 15%，无肉眼可见掉帧、抖动或残影。
6. WHILE 正在拖动, THE Ball SHALL 保持 1.05 倍缩放与半透明投影；鼠标释放后 300ms 内以 spring 动效恢复到 1.0 倍。
7. THE Drag_Layer SHALL 使用原生 `BrowserWindow.setPosition(x, y, animate=false)` 直接定位，不使用 CSS transform，以保证窗口像素级跟随。
8. THE Drag_Layer SHALL 对 `mousemove` 事件做 `requestAnimationFrame` 节流，避免 Electron IPC 过载导致卡顿。
9. THE Drag_Layer SHALL 在 Windows 高 DPI / macOS Retina / Linux 混合缩放（HiDPI + 非整数比缩放）下正确处理坐标转换，使用 `screen.dipToScreenPoint` / `screenToDipPoint`，不出现拖动时 Ball 漂移、跳跃、延迟。
10. WHEN 用户在拖动中释放鼠标, THE Ball SHALL 有轻微的"落地"反馈（0.15 倍垂直方向弹性动画），之后才进入吸边判断。

#### 位置体验

11. WHEN 用户释放鼠标且 Ball 距屏幕任意边缘 < 40px, THE Snap_Edge SHALL 以 300ms spring 动画将 Ball 吸附到该边缘，并隐藏 28px（半个球体）在屏幕外。
12. WHILE Ball 处于吸边状态, THE Ball 视觉 SHALL 在可见半球上显示 4px 宽的主色竖条指示（表示"可以拉出来"）。
13. WHEN 鼠标移入已吸边的 Ball（`mouseenter`）, THE Snap_Edge SHALL 在 200ms ease-out 动画内将 Ball 完整展开出来；全程视觉连续，不闪烁。
14. WHEN 鼠标离开吸边状态下的 Ball 超过 1.5 秒, THE Snap_Edge SHALL 以 200ms ease-in 恢复隐藏半球状态。
15. THE Ball SHALL 在多显示器环境下支持跨屏拖动；跨屏瞬间坐标转换必须平滑，不出现 Ball"瞬移"到另一侧的现象。
16. THE Snap_Edge 吸边判断 SHALL 基于 Ball 当前所在 display 的 `workArea`（排除 Windows 任务栏 / macOS Dock），而非全屏区域。
17. IF 用户把 Ball 拖到屏幕外（多显示器边界失效时）, THEN THE App SHALL 自动把 Ball 约束回最近 display 的 `workArea` 可见区域，至少保留 `size` 的 50% 可见。
18. THE Ball 位置 SHALL 在应用退出时持久化（`electron-store`），下次启动还原到上次位置；如果上次位置在当前已断开的显示器上（例如笔记本拔掉外接屏），THE App SHALL 回退到主屏幕的等价相对位置。
19. WHEN 应用首次启动（无历史位置）, THE Ball SHALL 出现在主显示器 `workArea` 的右下角，距右边缘 24px，距下边缘 120px。
20. WHEN 用户连续 3 次把 Ball 拖到同一边缘的相近位置, THE Snap_Edge SHALL 把这个位置记住为该 display 的"偏好吸附点"，下次拖近同一边缘时自动吸到该点（而非任意边缘点）。

#### 场景自适应

21. WHEN 全屏视频 / 演示模式被系统标记, THE Ball SHALL 可被用户通过设置选择"全屏时自动隐藏"（默认开启）。
22. WHILE 系统进入省电模式（macOS Low Power Mode / Windows 电池省电模式）, THE Drag_Layer 可以 把拖动节流降至 30fps，释放后的 spring 动画可省略，以节省电量。

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

### 需求 4：Compose 编辑窗口（P0 重点）

**用户故事：** 作为用户，我希望点击"新建"就能立刻打开一个小巧精致的编辑窗口。它不打扰我、写起来舒服、长得好看。未来它还要接 AI，不能现在就被塞满。

#### 视觉与尺寸

1. THE Compose_Window SHALL 是一个默认 **440×300** 的无边框窗口（宽高比约 1.47:1，刚好覆盖一屏 5 行正文），圆角 12px、`hasShadow: true` 或自渲染 `0 20px 60px rgba(0,0,0,0.18)` 阴影。
2. THE Compose_Window SHALL 始终置顶（`alwaysOnTop: true`），但在鼠标点击外部时自动收起到任务栏（不销毁，保留草稿）；再次唤起时恢复到上次位置与内容。
3. THE Compose_Window 布局从上到下 SHALL 分三层：
   - **顶部 36px 标题栏**：全宽拖动区（`-webkit-app-region: drag`），左侧仅一个 8×8 彩色圆点（指示连接状态：绿=已登录，黄=离线草稿，红=鉴权失效），右侧 24×24 关闭按钮（仅在 hover 时出现）。
   - **中部主体**：单行可成长的文本域（`textarea`），默认 3 行、最多展开到 8 行后内滚；字号 15px、行高 1.55、主色 `#1F2937`、placeholder `浅灰 #9CA3AF`、选中色匹配 Ball 蓝。
   - **底部 40px 操作栏**：左侧功能图标区（预留 AI 入口、标签、可见性、附件，首版仅放"可见性"与"AI ✨"占位图标），右侧实时字数 + 一个主色圆角按钮"发布"（28px 高、圆角 8px，键盘快捷提示 `⌘⏎` 以 `opacity: 0.5` 显示在按钮内部右侧）。
4. THE Compose_Window SHALL 支持跟随系统的浅色 / 深色外观：浅色背景 `#FFFFFF`、深色背景 `#1F2937`；深色模式下 placeholder、图标、阴影同步调整。
5. THE Compose_Window 的标题栏与操作栏 SHALL 使用毛玻璃效果（macOS 用 `vibrancy: 'hud'`、Windows 用 Acrylic via BrowserWindow `backgroundMaterial: 'acrylic'`，Linux fallback 纯色），与主体文本区形成层次。

#### 交互与手感

6. WHEN 用户从 Ball 菜单点击"新建", THE Compose_Window SHALL 从 Ball 当前位置以 200ms `ease-out` 动画展开到目标尺寸与位置（位置由需求 4.7 决定），并自动聚焦 textarea、弹出光标。
7. WHEN Compose_Window 显示位置会超出当前 display 的 `workArea`, THE App SHALL 自动偏移窗口到可见区域内，保证距离屏幕边缘至少 16px 间距。
8. THE Compose_Window SHALL 根据 textarea 内容自动调整窗口高度（3 行 → 300px、每多一行 +22px、最多 600px），改变过程 160ms ease 动画。
9. WHEN 用户输入内容并点击"发布"或按下 `Ctrl/Cmd + Enter`, THE API_Client SHALL 调用 `POST /api/bbtalks/` 创建 BBTalk，content 字段为用户输入，visibility 由底部选择器决定（默认 `private`）。
10. WHILE API 请求正在进行, THE Compose_Window 的"发布"按钮 SHALL 显示 loading 指示器（内联 14×14 旋转圈），按钮文本变为灰色不可点，防止重复提交。
11. WHEN 发布成功, THE Compose_Window SHALL 完成以下三步：
    - 底部操作栏从下方滑入一条 24px 高的绿色 Toast "已发布"，持续 1.2 秒；
    - textarea 渐隐到 `opacity: 0` 后 300ms 清空；
    - 窗口以 200ms `ease-in` 动画缩小并消失（不要直接 `hide()`）。
12. IF 发布失败（网络 / 鉴权 / 校验）, THEN THE Compose_Window SHALL 在底部操作栏区域显示红色错误条（24px 高），1 秒后自动收起，内容保留，窗口不关闭。
13. WHEN 用户按下 `Esc`, THE Compose_Window SHALL 最小化到任务栏（不销毁、不弹出确认框），再次召唤时内容与光标位置恢复。
14. WHEN 用户按下 `⌘W` / `Ctrl+W`, THE Compose_Window SHALL 弹出三选确认：保留草稿 / 清空并关闭 / 取消，默认高亮"保留草稿"。
15. THE textarea SHALL 支持基础 Markdown 语法高亮（标题、粗体、斜体、代码、链接）**作为视觉提示**；本期不做完整渲染预览，只在输入过程中给予轻量样式反馈（不影响字符数统计）。

#### 草稿与异常恢复

16. THE Compose_Window SHALL 在启动时从 `electron-store` 读取 `compose.draft` 并还原到 textarea；输入变化时按 `lodash.debounce` 2 秒节流写回。
17. IF 应用异常退出（进程崩溃）或系统强制关机, THEN THE Compose_Window 下次启动 SHALL 自动恢复未发送草稿并在底部显示一条提示"已恢复未保存的草稿"。
18. THE Compose_Window 左上角连接状态圆点 SHALL 反映当前可发布性：绿色 = 可正常发布；黄色 = 离线（草稿会排队稍后自动发送）；红色 = 鉴权失效（点击圆点直接跳转登录窗口）。
19. WHEN 离线状态下用户点击"发布", THE Compose_Window SHALL 把内容加入本地发送队列并展示黄色 Toast "已存入离线队列"，而不是报错。

#### 附件（简版）

20. THE Compose_Window SHALL 支持拖入图片（最多 3 张，单张 ≤ 10MB），拖入时在 textarea 上方出现虚线 overlay "松开以插入"。
21. WHEN 用户松开图片, THE Compose_Window SHALL 将图片发送到附件接口上传，上传成功后在 textarea 光标处插入 Markdown 图片语法 `![](url)`；上传期间在图片位置显示占位符 `![uploading...]()`。
22. THE Compose_Window 本期 SHALL NOT 支持视频、音频、定位等富附件，相关功能留待后续版本。

#### AI 扩展位（占位，本期不实现）

23. THE Compose_Window 底部操作栏 SHALL 预留一个"AI ✨"按钮（16×16 紫色图标），点击弹出一个宽 240px、高 180px 的浮层（锚定在按钮上方），内容为"AI 功能即将上线"占位文案。
24. THE Compose_Window SHALL 在 textarea 中识别 `/` 斜杠命令的键入，浮出候选命令面板（空列表即可），为后续插入 AI 命令（摘要 / 润色 / 续写）预留位置；本期只要能唤出空面板并可被 `Esc` 关闭即可。
25. THE Desktop_App 内部 SHALL 定义 `AIProvider` 接口（见 design.md），首版提供一个 `NoopAIProvider` 实现，不调用任何外部 API。

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

### 需求 10：AI 扩展底座（占位，本期不实现）

**用户故事：** 作为产品负责人，我希望从一开始就把 AI 扩展的"骨架"搭好，避免后面再大改 Compose 的 UI 结构。

#### 验收标准

1. THE Desktop_App SHALL 定义一个统一的 `AIProvider` 接口，覆盖以下四类能力，方法签名允许本期为空实现：
   - `summarize(text: string): Promise<string>` — 摘要
   - `polish(text: string, tone?: string): Promise<string>` — 润色
   - `continue(text: string): Promise<string>` — 续写
   - `chat(messages: ChatMessage[]): AsyncIterable<string>` — 对话式生成（流式）
2. THE Desktop_App SHALL 提供至少一个实现：`NoopAIProvider`，所有方法返回占位文本或立即 resolve 空字符串；未来可通过设置切换到 `OpenAIProvider` / `OllamaProvider` 等。
3. THE Compose_Window SHALL 将 `AIProvider` 通过 IPC 暴露给渲染进程（仅提供这四个方法，不直接传入主进程对象），保留安全边界。
4. THE Compose_Window 的 `/` 斜杠菜单与 AI ✨ 按钮浮层 SHALL 通过渲染侧 `useAI()` hook 连接 AIProvider；本期 hook 返回固定的"功能未实现"提示。
5. THE Settings_Window SHALL 预留"AI 提供商"分组 UI（灰色不可用），包含下拉菜单占位（Noop / OpenAI / Ollama / 自定义端点）、API Key 输入框（stub），本期仅能保存与读取这些值，不触发实际调用。
6. THE Desktop_App SHALL 在 README 的"待规划"矩阵中明确标注 AI 功能状态为"接口就位，提供方待接入"。
