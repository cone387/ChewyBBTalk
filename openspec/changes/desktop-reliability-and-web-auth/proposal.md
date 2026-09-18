## Why

桌面端存在窗口强制置顶、会话恢复不清晰、附件预览和草稿不可靠、设置未保存以及图标不统一的问题。需要完成一次覆盖真实日常使用路径的修复，并支持系统浏览器授权登录。

## What Changes

- 普通编辑窗口、可选置顶、多屏定位以及关闭前草稿保存。
- 会话状态通知、安全凭证存储、超时和刷新重试、系统浏览器一次性授权码登录。
- 主进程附件传输、本地即时预览、逐项状态与重试、持久化附件草稿和权限一致性。
- 修复设置保存、中文输入法误发；统一应用、窗口、安装包和托盘图标。
- 将 chewy-attachment 从 Git 依赖迁移至 PyPI 0.5.2。

## Capabilities

### New Capabilities
- `desktop-reliability`: 桌面窗口、草稿、附件、设置与图标的一致可靠行为。
- `desktop-browser-auth`: 系统浏览器授权和桌面会话生命周期。

### Modified Capabilities

无。

## Impact

- 桌面：`desktop/src/main/auth.ts`、`store.ts`、`index.ts`、`submissions.ts`、`windows/*`、`ipc/*`、`src/preload/index.ts`、`src/shared/ipc-types.ts`、`src/renderer/compose/*`、`login/LoginWindow.tsx`、`settings/SettingsWindow.tsx`。
- 资源：`desktop/resources/*`、`desktop/scripts/generate-icon.cjs`、`desktop/electron-builder.yml`。
- 后端：`backend/chewy_space/bbtalk/models.py`、`urls.py`、新增授权视图及迁移、附件权限与序列化、`backend/pyproject.toml`、`backend/uv.lock`。
- Web：桌面授权页面、登录及隐私锁返回路径、私密图片/视频/文件的鉴权加载。
- 移动端：图片、视频和音频携带同源 API 鉴权，兼容附件权限修复，不向外部媒体地址发送凭证。
- 补充后端、桌面单元测试和 Electron 集成验证及使用文档。
