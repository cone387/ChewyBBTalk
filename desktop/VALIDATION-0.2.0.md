# 0.2.0 验收记录

2026-09-18，Windows x64。

## 产物

- `dist/ChewyBBTalk Setup 0.2.0.exe`，约 97.4 MiB。
- 安装包内版本为 0.2.0，应用归档不包含 integration 测试入口。
- SVG 母版生成应用 PNG、Windows 多尺寸 ICO、macOS ICNS 和模板托盘资源。

## 验证

- 后端完整 `bbtalk` 91 项回归通过；授权覆盖 PKCE、一次性消费、过期和恶意回调。附件覆盖上传、预览、Range、跨用户权限、公开/私密切换、共享引用、S3 和历史数据修复。
- `makemigrations --check --dry-run` 无未生成迁移。
- 桌面 `npm run typecheck`、33 项单元测试和 Windows 打包通过。
- Web 生产构建和 31 项单元测试通过。
- 移动端 TypeScript 检查及媒体凭证来源隔离测试通过。
- 两项真实 Electron + Django + 浏览器联调通过：发布响应丢失后的幂等重试、重启恢复、账号隔离、浏览器登录及 PKCE 兑换、凭证加密、置顶开关、截图预览、部分上传失败重试、关闭保存、断网重启草稿恢复、重新连接、输入法防误发、私有图片缩略图/大图和服务器设置保存。
- 已检查实际桌面截图，附件缩略图、文件名和状态均正常显示。

复现联调：先在 desktop 执行 `npm run build:integration`，再在 frontend 执行 `npm run test:desktop`。测试使用独立用户目录和临时后端数据库。不要同时运行桌面打包：生产构建会清理联调入口。

## 发布顺序与边界

1. 在 backend 执行 `uv sync --frozen`，然后 `uv run python chewy_space/manage.py migrate`。0007 增加授权表，0008 按现有文章可见性修复已引用附件的权限。
2. 同步发布 Web，并更新移动端的私密媒体鉴权加载逻辑。
3. 安装桌面 0.2.0。系统浏览器授权需要新版后端和 Web；旧服务仍可使用密码登录。

此次完成本地代码、测试和安装包，未部署生产服务。Windows 安装包尚无签名证书；macOS 资源已生成，但未在 macOS 真机打包验收。多屏定位有纯函数测试，实际多显示器/DPI 和系统安装升级流程仍需目标设备验收。
