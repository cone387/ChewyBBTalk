# Implementation Plan: ChewyBBTalk Desktop 悬浮球

## 概述

任务按"工程骨架 → 主窗口 Ball → 核心动作 Compose → 登录 / 设置 / 托盘 / 快捷键 → 打包分发"的顺序推进。每个 Checkpoint 都要人工上手跑一遍，避免 Electron 跨平台细节在最后暴雷。

技术栈：Electron + React + TypeScript + Vite + electron-builder + electron-store + keytar

## Tasks

- [ ] 1. 工程骨架
  - [ ] 1.1 新建 `desktop/` 目录
    - `package.json`（声明 electron、vite、react 等依赖）
    - `tsconfig.json`（分 main / preload / renderer 三套配置，路径 alias）
    - `.gitignore` 加入 `dist/`、`out/`
    - 仓库根 `package.json` 追加 `desktop:dev`、`desktop:build` 脚本
    - _Requirements: 1.1, 1.4_

  - [ ] 1.2 Vite 多 entry 配置
    - `vite.config.ts` 设置 `build.rollupOptions.input` 包含 ball / compose / settings / login 四个 HTML 入口
    - 开发模式下走 `server`，生产模式产物写到 `dist/renderer/`
    - _Requirements: 1.4_

  - [ ] 1.3 Electron 主进程骨架 `src/main/main.ts`
    - `app.whenReady` 创建 Ball 窗口、Tray、注册 IPC
    - `app.on('window-all-closed')` 不退出，保持后台
    - 配置 CSP：`default-src 'self'; connect-src 'self' https://bbtalk.cone387.top`
    - _Requirements: 1.1, 1.6, 6.6_

  - [ ] 1.4 preload 脚本 `src/preload/preload.ts`
    - `contextBridge.exposeInMainWorld('desktop', ...)` 暴露白名单 API
    - 所有 API 返回 Promise
    - _Requirements: 9.1_

- [ ] 2. Ball 窗口与交互
  - [ ] 2.1 创建 Ball 窗口 `src/main/windows/ballWindow.ts`
    - 配置：无边框 / 透明 / 始终置顶 / 不显示于任务栏
    - `setAlwaysOnTop(true, 'screen-saver')` + `setVisibleOnAllWorkspaces(true)`
    - _Requirements: 2.1_

  - [ ] 2.2 Ball 渲染组件 `src/renderer/ball/Ball.tsx`
    - 56px 圆形蓝底按钮，中心 `+` 图标
    - 点击 / 双击 / 右键事件绑定
    - _Requirements: 2.2, 3.1, 3.4, 3.5_

  - [ ] 2.3 拖拽逻辑
    - mousedown → 采集 screenX/Y，move > 4px 判定为拖拽
    - 拖拽时 IPC 调用 `ball:setPosition`，主进程 `win.setPosition`
    - _Requirements: 2.3, 2.7_

  - [ ] 2.4 吸边 `ball:snapToNearestEdge`
    - 基于 `screen.getDisplayMatching` + workArea 计算最近边
    - < 40px 吸附，隐藏半球（通过 `setPosition` 越界 + CSS 补偿）
    - 鼠标进入 1.5s 后收回、进入时展开 200ms 过渡
    - _Requirements: 2.4, 2.5, 2.6_

  - [ ] 2.5 位置持久化
    - `electron-store` 键 `ball.position`，启动时还原
    - 首次启动默认主屏右下角（距右 24、距下 120）
    - _Requirements: 2.8_

  - [ ] 2.6 全屏自动隐藏（可选但默认开启）
    - 定时器轮询当前所在 display 的 workArea 与前台窗口关系
    - 检测到全屏时 `win.hide()`，恢复时 `win.show()`
    - 设置中提供总开关
    - _Requirements: 2.9_

  - [ ] 2.7 Ball Menu 组件
    - 单击 Ball 弹出菜单，三项：新建 / 打开 Web / 设置
    - 根据 snappedEdge 决定弹出方向
    - 点击空白 / `Esc` 关闭
    - _Requirements: 3.1, 3.2, 3.3, 3.6_

- [ ] 3. Checkpoint — Ball 独立可用
  - Ensure 三端都能正常：显示 / 拖动 / 吸边 / 单击菜单 / 双击直达
  - 若吸边或跨显示器有问题，停下与用户同步
  - _Requirements: 2.*, 3.*_

- [ ] 4. Compose 窗口
  - [ ] 4.1 创建 Compose 窗口 `src/main/windows/composeWindow.ts`
    - 420×360 无边框 + 始终置顶 + 按需打开关闭
    - _Requirements: 4.1_

  - [ ] 4.2 Compose 渲染组件 `src/renderer/compose/ComposeWindow.tsx`
    - 顶部拖动条 + 关闭按钮
    - 多行 `<textarea>`，支持 Markdown（可选 Tab 切换预览）
    - 底部字数 + "发布"按钮 + 键盘提示
    - 复用 `frontend/src/components/MarkdownRenderer.tsx` 的思路，视情况简化
    - _Requirements: 4.1, 4.2_

  - [ ] 4.3 草稿持久化
    - 内容 change 后 debounce 2s 写 `electron-store` `compose.draft`
    - 窗口显示时读取草稿回填
    - _Requirements: 4.9_

  - [ ] 4.4 API client 与发布
    - 渲染侧 `api/client.ts` 封装 axios
    - 请求前 `window.desktop.auth.getAccessToken()` 获取 token
    - `POST /api/bbtalks/` 发布
    - _Requirements: 4.3_

  - [ ] 4.5 发布成功 / 失败 UI
    - 成功：Toast + 清空 + 500ms 后关闭 + 系统通知
    - 失败：底部错误提示，保留内容
    - _Requirements: 4.4, 4.5, 6.5_

  - [ ] 4.6 键盘快捷键
    - `Ctrl/Cmd + Enter` 发布
    - `Esc` 关闭（有未发布内容时二次确认）
    - _Requirements: 4.6, 4.7_

  - [ ] 4.7 图片拖入上传
    - drop 监听 → FileReader → IPC `upload:attachment`
    - 主进程 multipart 上传到 `/api/attachments/`
    - 插入 Markdown 图片语法到 content
    - 最多 3 张 / 单张 ≤ 10MB，超限 Toast 提示
    - _Requirements: 4.8_

- [ ] 5. Checkpoint — Compose 可用
  - Ensure 从 Ball 点击"新建" → Compose 打开 → 写字 → Ctrl/Cmd+Enter 发布 → 在 Web 版能看到新条目
  - 拖入图片 → 能正确上传并插入 Markdown
  - _Requirements: 4.*_

- [ ] 6. 登录与鉴权
  - [ ] 6.1 `src/main/auth.ts`
    - `login(username, password, apiUrl)`：调 `/api/auth/token/`，refresh → keytar，access → 主进程内存
    - `getAccessToken()`：距过期 < 5 分钟自动 refresh
    - `logout()`：清空 keytar + 内存
    - _Requirements: 5.2, 5.3, 5.4_

  - [ ] 6.2 登录窗口 `LoginWindow.tsx`
    - 字段：API 地址 / 用户名 / 密码
    - 默认 API `https://bbtalk.cone387.top`
    - 登录成功后关闭窗口并显示 Ball
    - _Requirements: 5.1_

  - [ ] 6.3 应用启动时判断登录态
    - `main.ts` 启动时 `getAccessToken` 成功则显示 Ball，失败则弹登录窗口
    - _Requirements: 5.1, 5.4_

- [ ] 7. 设置窗口
  - [ ] 7.1 Settings 窗口 Shell
    - Tabs：通用 / Ball / 快捷键 / 账号 / 关于
    - 数据通过 `settings:get` / `settings:set` 读写
    - _Requirements: 5.5_

  - [ ] 7.2 通用 Tab
    - API 地址 / Web URL / 开机启动 / 发布后系统通知 / 全屏时隐藏 Ball
    - 开机启动通过 `app.setLoginItemSettings`（双平台）或 `.desktop` autostart（Linux）
    - _Requirements: 5.5, 5.6, 6.5_

  - [ ] 7.3 Ball Tab
    - 尺寸（小 40 / 中 56 / 大 72）、主色
    - 设置改动即时生效（IPC 广播到 Ball 渲染进程）
    - _Requirements: 5.5_

  - [ ] 7.4 快捷键 Tab
    - 输入框录入快捷键，`globalShortcut.isRegistered` 检测冲突
    - 冲突时红字提示，不保存
    - _Requirements: 5.5, 6.4_

  - [ ] 7.5 账号 Tab
    - 显示当前用户名、API 地址
    - "退出登录"按钮
    - _Requirements: 5.7, 5.8_

  - [ ] 7.6 关于 Tab
    - 版本号、GitHub 链接、开源依赖列表
    - _Requirements: 9.4_

- [ ] 8. 系统集成
  - [ ] 8.1 托盘 `src/main/tray.ts`
    - 图标 + Tooltip + 右键菜单
    - 点击托盘 → toggle Ball
    - _Requirements: 6.1, 6.2_

  - [ ] 8.2 全局快捷键 `src/main/hotkey.ts`
    - 默认：`CommandOrControl+Shift+B` 切换 Ball、`CommandOrControl+Shift+N` Compose
    - 支持动态 re-register
    - _Requirements: 6.3, 6.4_

  - [ ] 8.3 系统通知
    - 发布成功调用 `new Notification({title, body})`
    - 可在设置关闭
    - _Requirements: 6.5_

- [ ] 9. Checkpoint — 全功能走查
  - 手动跑一遍：登录 → Ball → 拖动吸边 → 菜单 → Compose 发布 → 通知 → 设置修改 → 快捷键 → 托盘 → 退出登录
  - 三端分别走一遍，记录差异
  - _Requirements: 全部_

- [ ] 10. 属性测试与单元测试
  - [ ]* 10.1 属性测试 `snap.property.test.ts`
    - **Property 1: 吸边方向选择** — 随机位置 + 显示器工作区，断言选择最近 < 40 的边
    - **Validates: 需求 2.4, 2.7**

  - [ ]* 10.2 属性测试 `store.property.test.ts`
    - **Property 2: 位置持久化往返** — set/get 等值
    - **Validates: 需求 2.8**

  - [ ]* 10.3 属性测试 `hotkey.property.test.ts`
    - **Property 3: 快捷键冲突不破坏状态** — mock globalShortcut
    - **Validates: 需求 6.4**

  - [ ]* 10.4 属性测试 `draft.property.test.ts`
    - **Property 4: Compose 草稿幂等**
    - **Validates: 需求 4.9**

  - [ ] 10.5 关键单元测试
    - `api/client.test.ts`：401 自动 refresh
    - `BallMenu.test.tsx`：渲染与点击
    - `ComposeWindow.test.tsx`：Ctrl+Enter 触发 submit

- [ ] 11. 打包与分发
  - [ ] 11.1 配置 `electron-builder.yml`
    - Windows NSIS、macOS DMG（arm64 + x64）、Linux AppImage
    - 代码签名占位（用户可自行配置证书）
    - _Requirements: 1.2_

  - [ ] 11.2 接入 electron-updater
    - 仅接入模块与 feed URL 占位，不要求立即发布
    - _Requirements: 1.3_

  - [ ] 11.3 发布流程文档
    - README 说明本地构建命令、GitHub Actions 自动构建（可选）
    - 使用指南与故障排查
    - _Requirements: 7.3_

- [ ] 12. Final Checkpoint — 发布准备
  - 三端分别出一版安装包并走完整的 install → 启动 → 登录 → 发布 → 退出流程
  - 确认空闲 CPU < 1%、内存 < 150MB（需求 8.1）
  - 整理 README 中"已实现 / 待规划"矩阵
  - 询问用户是否直接发布到 GitHub Release

## Notes

- 带 `*` 的任务为属性测试，建议在首版发布前至少完成 10.1 与 10.2。
- macOS 代码签名 / 公证比 Windows / Linux 复杂，若首版只在个人设备使用，可先跳过签名，安装时通过"右键打开"绕过 Gatekeeper。
- Linux AppImage 在 Wayland 上的置顶行为不稳定，已知问题：KDE Plasma 6 + Wayland 下 `alwaysOnTop` 偶发失效，需要在文档中说明。
- 后续扩展功能（剪贴板监听、截图贴图、最近 5 条、划词保存等）作为下一期规划，本期只在 README 列出，不实现。
