# Implementation Plan: ChewyBBTalk Desktop 悬浮球

## 概述

本 spec 的首版只看三件事：**Compose 编辑框的质感**、**Ball 拖动的手感**、**Ball 位置体验的智能**。任务顺序按这个优先级编排。登录 / 设置 / 托盘 / AI 扩展位 / 打包等按"能用即可"标准后置。

技术栈：Electron + React + TypeScript + Vite + electron-builder + electron-store + keytar

## 里程碑

| 里程碑 | 范围 | 交付价值 |
|--------|------|---------|
| **M1: Ball 样机** | Task 1 + 2 | Ball 能显示、丝滑拖动、吸边、记忆位置 — 就算没登录也能感受到"这个小球做得很用心" |
| **M2: Compose 精品** | Task 3 + 4 + 5 | 从 Ball 点"新建"弹出小巧的编辑窗，写完就能发到后端 — 核心功能闭环 |
| **M3: 完整首版** | Task 6~10 | 登录 / 设置 / 托盘 / 快捷键 / AI 占位 |
| **M4: 发布** | Task 11 + 12 | 三端安装包 + 文档 |

## Tasks

---

### 里程碑 M1：Ball 样机

- [ ] 1. 工程骨架
  - [ ] 1.1 新建 `desktop/` 目录
    - `package.json`（electron、vite、react、typescript 等）
    - `tsconfig.json`（分 main / preload / renderer 三套）
    - `.gitignore` 加 `dist/` `out/` `release/`
    - 仓库根 `package.json` 追加 `desktop:dev`、`desktop:build` 脚本
    - _Requirements: 1.1, 1.4_

  - [ ] 1.2 Vite 多 entry 配置
    - `vite.config.ts` 配 ball / compose / settings / login 四个 HTML 入口
    - dev 走 `server`，prod 产物写到 `dist/renderer/`
    - _Requirements: 1.4_

  - [ ] 1.3 Electron 主进程骨架 `src/main/main.ts`
    - `app.whenReady` 创建 Ball 窗口（登录、托盘、IPC 都先不做）
    - 配置 CSP：`default-src 'self'; connect-src 'self' https://bbtalk.cone387.top`
    - _Requirements: 1.1, 1.6_

  - [ ] 1.4 preload 脚本 `src/preload/preload.ts`
    - `contextBridge.exposeInMainWorld('desktop', ...)` 暴露白名单 API
    - 本里程碑只需要 `ball.*` 与 `shell.openExternal` 子域
    - _Requirements: 9.1_

- [ ] 2. Ball 窗口与交互（**P0 重点**）
  - [ ] 2.1 创建 Ball 窗口 `src/main/windows/ballWindow.ts`
    - 无边框 / 透明 / 始终置顶 / 不显示于任务栏
    - `setAlwaysOnTop(true, 'screen-saver')` + `setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: false})`
    - `width/height = 80`（含阴影缓冲），`hasShadow: false`（自渲染）
    - _Requirements: 2.1_

  - [ ] 2.2 Ball 视觉 `src/renderer/ball/Ball.tsx`
    - 56px 圆形，径向渐变 `#3B82F6 → #2563EB`
    - 外圈 2px 高光 + 柔投影 `0 8px 24px rgba(59,130,246,0.35)`
    - 中心 24px `+` 图标
    - 按下缩放 1.05 反馈；拖动中 `cursor: grabbing`；释放 spring 回弹
    - 吸边时可见半球显示 4px 主色竖条指示
    - _Requirements: 2.2, 2.3, 2.4, 2.6_

  - [ ] 2.3 拖拽逻辑（**rAF 节流、DPI 安全**）
    - `useBallDrag` hook：mousedown 采集初始位置；move > 4px 进入拖动状态
    - `mousemove` 只更新 `latestOffset`，真正的 IPC 在 `requestAnimationFrame` 里发一次
    - IPC: `ball:setPosition(x, y)`，主进程用 `screen.dipToScreenPoint` 转成物理像素
    - 拖动时 `document.body.classList.add('ball-dragging')`
    - _Requirements: 2.5, 2.7, 2.8, 2.9_

  - [ ] 2.4 吸边与偏好吸附点（**P0 位置智能**）
    - `ball:snapToNearestEdge`：基于 `display.workArea` 计算四边距离，< 40px 吸附
    - 隐藏半球通过 `setPosition` 让窗口中心越界 28px 实现
    - `learnSnapPoint` + `findPreferredSnap`：同一边缘 hit ≥ 3 次且方差 < 30px 升级为偏好点
    - 吸附用自实现 spring 动画 `animateSetPosition(win, tx, ty, 300ms)`（不用 Electron 的 animate 参数）
    - _Requirements: 2.11~2.20_

  - [ ] 2.5 位置持久化与显示器热插拔
    - `electron-store` 键 `ball.position` `ball.snapPreferred`
    - 启动时根据 `displayId` 还原；如目标 display 不存在，回退到主屏右下角
    - `screen.on('display-added' | 'display-removed' | 'display-metrics-changed')` → `ensureVisible()` 保证 Ball 至少 50% 可见
    - 首次启动默认主屏右下，距右 24 / 距下 120
    - _Requirements: 2.17, 2.18, 2.19_

  - [ ] 2.6 全屏自动隐藏（默认开启，可关闭）
    - 轮询 + 事件监听前台窗口是否全屏
    - 全屏 → `win.hide()`；恢复 → `win.show()`
    - 设置页暴露总开关；省电模式降帧到 30fps（需求 2.22）
    - _Requirements: 2.21, 2.22_

  - [ ] 2.7 Ball Menu 组件
    - 单击 Ball（非拖动）弹出线性下拉菜单
    - 菜单项：新建 / 打开 Web / 设置
    - 根据 `snappedEdge` 与可用空间决定弹出方向
    - 点击空白 / `Esc` 关闭；双击 Ball 直达新建；右键弹系统菜单
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 3. **Checkpoint M1** — Ball 手感达标
  - 三端手动走一遍：拖动不抖、不漂、不卡（高刷显示器观察 60/120fps）
  - 跨屏拖动平滑，跨屏瞬间无瞬移
  - 吸边动画流畅，收回 / 展开无闪烁
  - 连续 3 次同位置吸边后自动记忆，第 4 次拖近自动吸到偏好点
  - 拔掉外接屏幕后 Ball 自动回到主屏右下
  - 重启电脑后 Ball 回到上次位置
  - **若其中任一项体验不达标，停下与用户同步，不进入 M2**

---

### 里程碑 M2：Compose 精品

- [ ] 4. Compose 窗口（**P0 重点**）
  - [ ] 4.1 创建 Compose 窗口 `src/main/windows/composeWindow.ts`
    - 默认 440×300，无边框 + 始终置顶 + 圆角 + 自渲染阴影
    - macOS `vibrancy: 'hud'`；Windows `backgroundMaterial: 'acrylic'`
    - 关闭 = 隐藏（不销毁，保留 renderer 便于秒开）
    - _Requirements: 4.1, 4.2_

  - [ ] 4.2 三层布局 `src/renderer/compose/ComposeWindow.tsx`
    - 顶部 36px 标题栏：`-webkit-app-region: drag` + 左侧状态圆点 + 右侧 hover 出关闭按钮
    - 中部主体：`GrowingTextarea`（3~8 行自适应） + 轻量 Markdown 高亮 overlay（不改变字符数）
    - 底部 40px 操作栏：AI ✨ / Visibility / 字数 / 发布按钮（含 `⌘⏎` 提示）
    - 主题 token 与视觉规范对齐 design.md
    - _Requirements: 4.3, 4.4, 4.5_

  - [ ] 4.3 GrowingTextarea 高度自适应
    - `useLayoutEffect` 监听 value 变化，计算 `scrollHeight` 并 clamp 到 [66, 462]
    - IPC `compose:setContentHeight(nextH)`，主进程 `animateResize(win, {height: 36+h+40}, 160ms)`
    - 窗口超出当前 display `workArea` 时自动偏移回可见区
    - _Requirements: 4.6, 4.7, 4.8_

  - [ ] 4.4 状态圆点与连接态
    - 绿色 = 已登录可发布；黄色 = 离线（走 outbox）；红色 = 鉴权失效（点击跳 Login）
    - 数据源：`navigator.onLine` + 最近一次 API 响应状态
    - _Requirements: 4.18_

  - [ ] 4.5 发布流程
    - `publish()`：loading 按钮 → API `POST /api/bbtalks/` → 成功 Toast → 600ms → textarea 渐隐 → 窗口缩小消失
    - `compose:closeWithAnimation`：主进程 200ms ease-in 缩放到 80% + opacity 0，然后 `hide()`
    - 失败：底部 24px 红色错误条，1 秒自动收起，不关闭
    - 空白内容（仅空格 / 制表符 / 换行）拒绝提交
    - _Requirements: 4.9, 4.10, 4.11, 4.12_

  - [ ] 4.6 键盘交互
    - `Ctrl/Cmd + Enter` 触发发布
    - `Esc` 最小化到任务栏，不销毁不弹确认
    - `Ctrl/Cmd + W` 弹三选确认：保留草稿 / 清空并关闭 / 取消
    - _Requirements: 4.13, 4.14_

  - [ ] 4.7 草稿持久化与异常恢复
    - 内容 change → debounce 2s 写 `compose.draft`
    - 启动时读取并还原到 textarea
    - 进程崩溃后再次打开检测到非空草稿 → 底部提示"已恢复未保存的草稿"
    - _Requirements: 4.16, 4.17_

  - [ ] 4.8 离线发送队列
    - 离线状态下发布 → 写入 `compose.outbox` + 显示黄色 Toast
    - `netStatusWatcher` 在 `online` 事件后 flush outbox，逐条重试
    - _Requirements: 4.19_

  - [ ] 4.9 图片拖入上传
    - `drop` 监听 → FileReader → IPC `upload:attachment`
    - 主进程 multipart 上传到 `/api/v1/bbtalk/attachments/`
    - 拖入时在 textarea 上方出现虚线 overlay；上传期间用 `![uploading...]()` 占位，成功后替换为 `![](url)`
    - 限制 3 张、单张 ≤ 10MB
    - _Requirements: 4.20, 4.21_

  - [ ] 4.10 轻量 Markdown 高亮（不做完整渲染）
    - 基于正则识别 `**bold**` / `*italic*` / `#`标题 / `` `code` `` / `[text](url)`，在 textarea 上方叠一层 canvas 或 div 绘制样式
    - 字符数统计基于原始字符
    - _Requirements: 4.15_

- [ ] 5. **Checkpoint M2** — Compose 精品达标
  - 从 Ball 点"新建"到 Compose 弹出 < 500ms
  - 输入时高度平滑增长，不抖不闪
  - `Ctrl/Cmd+Enter` 发布到后端成功，Web 版能看到新条目
  - 发布动效（Toast → 渐隐 → 缩小消失）一气呵成
  - 失败时错误条展示清晰、内容不丢失
  - 拖入图片成功插入；占位符替换平滑
  - 断网发布写入 outbox，恢复后自动发送
  - 进程 kill 再打开，草稿自动恢复并有提示
  - **若有体验不达标，停下与用户同步**

---

### 里程碑 M3：完整首版

- [ ] 6. 登录与鉴权
  - [ ] 6.1 `src/main/auth.ts`
    - `login / getAccessToken / logout`；refresh token → keytar；access token → 主进程内存
    - 距过期 < 5 分钟自动 refresh
    - _Requirements: 5.2, 5.3, 5.4_

  - [ ] 6.2 登录窗口 `LoginWindow.tsx`
    - API 地址 / 用户名 / 密码；默认 `https://bbtalk.cone387.top`
    - 登录成功关闭窗口 + 显示 Ball
    - _Requirements: 5.1_

  - [ ] 6.3 启动时登录态判断
    - `main.ts` 启动先调 `getAccessToken`：成功显示 Ball；失败弹 Login
    - Compose 发布遇 401 → 状态圆点变红 → 点击圆点跳 Login
    - _Requirements: 5.1, 5.4, 4.18_

- [ ] 7. 设置窗口
  - [ ] 7.1 Settings 窗口 Shell
    - Tabs：通用 / Ball / 快捷键 / 账号 / **AI（占位灰色）** / 关于
    - 数据通过 `settings:get` / `settings:set` 读写，IPC 广播即时生效
    - _Requirements: 5.5_

  - [ ] 7.2 通用 Tab
    - API 地址 / Web URL / 开机启动 / 发布后系统通知 / 全屏时隐藏 Ball
    - 开机启动：`app.setLoginItemSettings`（Win/macOS）或 `.desktop` autostart（Linux）
    - _Requirements: 5.5, 5.6, 6.5_

  - [ ] 7.3 Ball Tab
    - 尺寸（小 40 / 中 56 / 大 72）、主色
    - 设置改动即时生效（IPC 广播到 Ball 渲染进程）
    - _Requirements: 5.5_

  - [ ] 7.4 快捷键 Tab
    - 输入框录入快捷键；`globalShortcut.isRegistered` 检测冲突，冲突红字提示不保存
    - _Requirements: 5.5, 6.4_

  - [ ] 7.5 账号 Tab
    - 当前用户名 / API 地址 / 退出登录按钮
    - _Requirements: 5.7, 5.8_

  - [ ] 7.6 AI Tab（占位灰色不可用）
    - Provider 下拉：Noop / OpenAI / Ollama / 自定义（除 Noop 外全部 disabled）
    - API Key 输入框 stub（能保存能读回，但不触发调用）
    - _Requirements: 10.5_

  - [ ] 7.7 关于 Tab
    - 版本号 / GitHub 链接 / 开源依赖列表
    - _Requirements: 9.4_

- [ ] 8. 系统集成
  - [ ] 8.1 托盘 `src/main/tray.ts`
    - 图标 + Tooltip + 右键菜单（新建 / 打开 Web / 显示隐藏 Ball / 设置 / 关于 / 退出）
    - 左键点击切换 Ball 显隐
    - _Requirements: 6.1, 6.2_

  - [ ] 8.2 全局快捷键 `src/main/hotkey.ts`
    - 默认：`CommandOrControl+Shift+B` 切换 Ball、`CommandOrControl+Shift+N` Compose
    - 动态 re-register；冲突时回退默认
    - _Requirements: 6.3, 6.4_

  - [ ] 8.3 系统通知
    - 发布成功：`new Notification({title, body: content.slice(0,20)})`
    - 设置关闭开关
    - _Requirements: 6.5_

- [ ] 9. AI 扩展底座（占位，只搭骨架）
  - [ ] 9.1 `src/main/ai/types.ts` 定义 `AIProvider` 接口
    - `summarize / polish / continue / chat`
    - _Requirements: 10.1_

  - [ ] 9.2 `NoopAIProvider` 实现
    - 全部返回占位文案
    - _Requirements: 10.2_

  - [ ] 9.3 IPC 桥接 `ai:summarize/polish/continue` 与流式 `ai:chat:start`
    - preload 白名单暴露给渲染
    - _Requirements: 10.3_

  - [ ] 9.4 Compose 斜杠命令 + AI ✨ 浮层（只搭 UI 壳）
    - `/` 触发命令面板；`Esc` 关闭
    - AI ✨ 点击弹 240×180 浮层："AI 功能即将上线"
    - _Requirements: 10.4_

- [ ] 10. **Checkpoint M3** — 完整首版走查
  - 登录 → Ball → Compose 发布 → 系统通知
  - 设置页修改主色 / 尺寸 / 快捷键全部即时生效
  - 托盘菜单每一项可用
  - 全局快捷键 Win/Mac 都能触发
  - 空闲 CPU < 1%、内存 < 150MB（需求 8.1）
  - AI 占位浮层 / 斜杠面板可见可关闭
  - 若体验不达标，停下与用户同步

---

### 里程碑 M4：发布

- [ ] 11. 属性测试与单元测试
  - [ ]* 11.1 `snap.property.test.ts` — Property 1: 吸边方向选择（需求 2.11）
  - [ ]* 11.2 `store.property.test.ts` — Property 2: 位置持久化往返（需求 2.18）
  - [ ]* 11.3 `hotkey.property.test.ts` — Property 3: 快捷键冲突不破坏状态（需求 6.4）
  - [ ]* 11.4 `draft.property.test.ts` — Property 4: 草稿幂等（需求 4.16）
  - [ ]* 11.5 `snapPreferred.property.test.ts` — Property 5: 偏好吸附点收敛（需求 2.20）
  - [ ]* 11.6 `height.property.test.ts` — Property 6: GrowingTextarea 高度单调（需求 4.8）
  - [ ]* 11.7 `publish.property.test.ts` — Property 7: 发布输入校验（需求 4.9）
  - [ ] 11.8 关键单元测试
    - `api/client.test.ts`：401 自动 refresh
    - `BallMenu.test.tsx`：渲染、点击、弹出方向
    - `ComposeWindow.test.tsx`：Ctrl+Enter 触发发布、Esc 最小化

- [ ] 12. 打包与分发
  - [ ] 12.1 `electron-builder.yml`
    - Windows NSIS、macOS DMG（arm64 + x64）、Linux AppImage
    - 代码签名占位（用户自备证书）
    - _Requirements: 1.2_

  - [ ] 12.2 接入 electron-updater（只挂模块，不发更新）
    - _Requirements: 1.3_

  - [ ] 12.3 README 与发布文档
    - 使用指南、已实现 / 待规划矩阵、AI 接入路线、故障排查
    - _Requirements: 7.3, 10.6_

- [ ] 13. **Final Checkpoint** — 发布准备
  - 三端分别打包 → install → 启动 → 登录 → 发布 → 退出
  - 空闲 CPU < 1%、内存 < 150MB
  - 询问用户是否发到 GitHub Release

## Notes

- 带 `*` 的任务为属性测试，建议 M4 发布前至少完成 11.1、11.2、11.5（吸边 / 位置 / 偏好吸附点 — 都是 P0 体验支撑）。
- macOS 代码签名 / 公证比 Windows / Linux 复杂；首版用"右键打开"绕过 Gatekeeper 即可，正式分发再补签名。
- Linux AppImage 在 Wayland 下 `alwaysOnTop` 偶发失效（KDE Plasma 6 已知问题），README 里注明。
- AI 功能本期**只搭骨架**：接口、IPC、Noop 实现、UI 占位。真正接 OpenAI / Ollama 放到下一期，不影响本期交付。
- 后续扩展功能（剪贴板监听、截图贴图、最近 5 条、划词保存等）作为下一期规划，README 的"待规划"矩阵里列出即可。
