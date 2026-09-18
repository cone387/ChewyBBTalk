# ChewyBBTalk Desktop — 悬浮球

一个常驻桌面的气泡入口，点一下就能记录想法。编辑框默认不置顶，可通过标题栏固定置顶。

## 0.2.0 桌面优化

- 系统浏览器授权登录，保留密码登录兼容旧服务器。授权码两分钟有效、仅可兑换一次，使用 PKCE 和随机 loopback 回调。
- refresh token 使用 Electron safeStorage 加密；旧明文自动迁移。系统加密不可用时仅在内存保存，会在账号页提示。
- 离线与登录过期分开显示；启动、网络重连和休眠唤醒恢复会话，401 单次刷新重试。
- 截图、拖拽和文件选择通过主进程上传。附件先保存到本地草稿，逐项显示状态，失败可重试；关闭编辑器上传继续，重启后中断项可重试。
- 草稿按服务器和账号隔离，关闭前保存文字和附件。输入法选词回车不发布。
- 自定义服务器设置真正持久化；切服需要重新登录，旧草稿保留。编辑框按悬浮球/鼠标所在屏幕定位。
- 应用、安装包、窗口、悬浮球和托盘采用同一气泡标识；`npm run icons` 从 SVG 生成 PNG、ICO、ICNS 及 macOS 模板托盘图标。

部署时必须同步更新后端与 Web：在 `backend` 执行 `uv sync --frozen` 和 `uv run python chewy_space/manage.py migrate`，然后构建发布 Web。迁移 0007 创建授权表，0008 按现有文章可见性修正已引用附件权限。旧服务器可继续用密码登录，新浏览器授权入口为 `/desktop/authorize`。

后端附件依赖锁定 PyPI `chewy-attachment[django-s3]==0.5.2`。私密附件预览需要认证，Web 和移动端应一起更新对应鉴权加载逻辑；Web 私密视频在用户点击后加载。

草稿位于 Electron 用户数据目录的 `chewybbtalk.json` 和 `draft-files/`。上传成功不等于发布成功，发布确认后才清理当前附件草稿。

## 0.2.1 自动更新

Windows 安装版启动 15 秒后检查更新，此后每 6 小时检查一次。新版本自动下载并校验，下载完成后通知用户，在“设置 → 关于”中点击“保存草稿并重启安装”。普通退出不会自动安装；草稿保存失败会取消安装并保留编辑窗口。检查/下载失败可以重试，也可从桌面发布页手动下载。

0.2.0 及更早版本没有更新检查逻辑，需要手动安装一次 0.2.1。后续自动更新依赖已发布的桌面更新源。开发模式不请求正式更新，macOS 暂提供手动下载。

发布流程和验证记录见 [UPDATES.md](UPDATES.md)。

## 0.2.2 窗口抖动修复

编辑框不再分八步调整原生窗口尺寸，而是一次设置最终尺寸与屏幕内位置。Windows 禁用无边框窗口的隐形厚边框，避免设置 440 宽后实际宽度变成 425 的偏差。附件区不再随窗口压缩，输入框预留滚动条空间；悬浮图片预览不参与窗口高度计算，登录提示高度变化会及时计入。

回归测试记录每次输入后的原生 resize 事件，并检查尺寸持续稳定，覆盖 100%、125%、150% 缩放。

## 0.2.3 鼠标交互、圆角和位置记忆

- 编辑框、登录或设置窗口打开期间，暂时隐藏全屏悬浮球覆盖层，避免它在输入窗口上方继续参与鼠标转发和透明合成。相关窗口全部关闭或最小化后恢复悬浮球；仍可通过托盘和快捷键操作。
- 透明窗口配合白色圆角内容区恢复真实圆角；保留无厚边框的稳定尺寸，移除编辑器顶部和工具栏的背景模糊。
- 首次在鼠标所在屏幕的工作区居中；用户拖动后分别记住编辑、设置和登录窗口坐标，再次打开或重启后恢复，屏幕变化时约束到可见区域。
- 未发布更新清单（404）显示“桌面更新通道尚未发布版本”，与网络失败、文件校验失败分别提示。
- 新增启用 GPU、创建真实悬浮层并显示编辑窗口的联调：连续鼠标移动不触发窗口移动/缩放，截图角落 alpha 为 0，中心为 255，关闭重开恢复坐标。

## 0.2.4 输入焦点与悬浮球恢复

- 新打开编辑框自动聚焦输入框，重新唤起已有编辑框也会把焦点交给输入框，可以直接打字。
- 暂停悬浮球时清除悬停定时器和动画，在不可见期间回到停靠位置；恢复后等待鼠标实际移动才重新展开，不回放隐藏期间的动画。
- 已显示过的悬浮球使用透明度隐藏/恢复，鼠标转发仍暂停，避免原生窗口反复 show/hide 带来的系统动画。吸边动画改为无回弹的缓出。
- 回归覆盖直接键入、已有窗口重新聚焦、实际拖动吸边、开关编辑框后连续 45 帧位置不变，以及恢复期间没有新的原生 show 事件。

原有交互基础：

1. **Compose 编辑框** — 小巧精致，为后续 AI（摘要 / 润色 / 续写 / 对话）预留架构位。
2. **Ball 拖动手感** — 60fps 跟手，任何 DPI / 多显示器下不抖不漂。
3. **Ball 位置体验** — 吸边、跨屏、记忆、偏好吸附点。

详细 spec 见 [`.kiro/specs/desktop-floating-ball/`](../.kiro/specs/desktop-floating-ball/)。

## 本地开发

```bash
# 安装依赖（首次会下载 Electron，较慢）
npm install

# 开发模式：启动 Vite dev server + Electron
npm run dev

# 类型检查
npm run typecheck

# 运行属性测试 + 单元测试（Vitest）
npm test
```

## 构建打包

```bash
# 只构建产物到 out/
npm run build

# 打包 Windows 安装包
npm run package:win
```

## 进度与里程碑

已实现悬浮球与菜单、编辑发布、附件上传、登录、设置、托盘、全局快捷键和打包配置。

Windows 安装版支持自动检查和下载更新，以及保存草稿后重启安装。

后续：多显示器/DPI 与全屏行为真机验收，签名安装包、macOS 自动更新及目标设备安装升级验收；AI 另行迭代。

## 目录结构

```
desktop/
├── electron.vite.config.ts      # 构建配置（多 entry）
├── tsconfig.{node,web}.json     # 分层类型检查
├── vitest.config.ts             # 测试配置
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts             # 入口
│   │   ├── store.ts             # electron-store 封装
│   │   ├── windows/
│   │   │   └── ballWindow.ts    # Ball 窗口创建
│   │   ├── ball/
│   │   │   ├── snap.ts          # 吸边 + 偏好吸附点（纯函数）
│   │   │   ├── animate.ts       # Spring 动画
│   │   │   └── __tests__/       # 属性测试
│   │   └── ipc/
│   │       └── ballIpc.ts       # Ball 相关 IPC handler
│   ├── preload/
│   │   └── index.ts             # contextBridge 白名单
│   ├── renderer/
│   │   └── ball/                # Ball 渲染进程
│   │       ├── index.html
│   │       ├── main.tsx
│   │       ├── Ball.tsx
│   │       ├── useBallDrag.ts
│   │       └── ball.css
│   └── shared/                  # 主进程 / 渲染进程共用
│       ├── constants.ts         # 视觉 + 行为常量
│       └── ipc-types.ts         # IPC 类型契约
```

## 设计决策速记

- **拖动 60fps 不用 transform**：用 `setPosition` 直接定位窗口，CSS transform 只做缩放反馈，避免位置和缩放叠加。
- **IPC rAF 节流**：mousemove 只更新 latestOffset，每帧发一次 IPC，避免 IPC 队列溢出导致卡顿。
- **DPI 安全**：主进程 `screen.dipToScreenPoint` 把 DIP 转物理像素；macOS 原生就是 DIP 跳过转换。
- **吸边不用 Electron animate 参数**：自实现 spring，避免 Windows 已知卡顿 bug。
- **偏好吸附点**：同一 display / edge 聚集 3 次以上的坐标自动升级为"记忆点"，用户越用越顺手。

## 已知限制

- Linux Wayland 下 `alwaysOnTop` 偶发失效（KDE Plasma 6 已知问题），首版不做 workaround。
- 首次启动 `npm install` 下载 Electron 较慢，可用 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 环境变量加速。
