# ChewyBBTalk Desktop — 悬浮球

一个始终悬浮在桌面之上的蓝色小球，点一下就能记录想法。首版聚焦三件事：

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

“查看发布版本”使用系统浏览器打开正式 Releases 页面；目前不提供自动检查、下载或安装更新。

后续：多显示器/DPI 与全屏行为真机验收，签名安装包和升级链路验收；AI 与自动更新另行迭代。

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
