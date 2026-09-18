# 桌面自动更新

## 使用方式

从 0.2.1 起，Windows 安装版自动检查并下载更新。检查在启动 15 秒后及每 6 小时进行；“设置 → 关于”可立即检查，显示版本、下载进度、失败提示和安装按钮。下载就绪会发送系统通知。

安装仅由用户点击触发；先完成编辑器关闭保存握手，再调用 `quitAndInstall(false, true)`。保存失败或超过 16 秒则不启动安装器，可以重试。普通退出不自动安装。下载使用 electron-updater 的 SHA-512 校验及缓存；不允许降级，不使用用户 API 地址作为更新源。

0.2.0 和旧版没有更新客户端，必须先手动安装一次 0.2.1。开发模式不检查正式更新；当前 macOS 未配置签名自动更新链路，界面明确提供手动下载。

## 发布

桌面与后端使用独立版本通道。客户端固定读取：

`https://github.com/cone387/ChewyBBTalk/releases/download/desktop-stable/latest.yml`

`.github/workflows/desktop-release.yml` 支持推送 `desktop-v版本号` 标签，或从 Actions 手动运行 Desktop Release。

1. 在 desktop 使用 `npm version patch --no-git-tag-version`，提交 package.json、package-lock.json 及代码。
2. 推送相符标签，例如 `desktop-v0.2.1`。此标签不会触发后端 `v*` 发布。
3. CI 检查版本、类型、单元测试、真实 updater 下载/校验测试，构建 Windows NSIS 安装包并验证 latest.yml 的大小和 SHA-512。
4. CI 检查远端版本，拒绝重复版本及倒退发布。先上传带版本号的 exe/blockmap，成功后最后更新 latest.yml。保留旧安装包，保证已获取旧 manifest 的客户端下载仍有效。

`desktop-stable` 是固定资源通道。GitHub Release 标记为 prerelease，避免影响后端的 Latest Release；桌面通过固定 generic URL 读取稳定版 manifest，版本号只允许正式 semver。Release 创建/上传需要 Actions 的 contents:write 权限。

不能直接对 generic provider 使用 `npm run publish` 来替代该流程。手动分发时同样需要先上传 installer/blockmap，最后上传 manifest。网络不可用或通道尚未发布时，客户端显示更新失败，不会误报“已是最新版”。

首次上线需要将代码推送到 GitHub 并执行上述 workflow；此次本地实现没有推送标签或创建线上 Release。没有远端 manifest 时，自动更新尚不能获取正式版本。

## 验证记录（2026-09-18）

- 桌面类型检查、39 项单元测试通过，含定时检查、去重、进度、下载就绪、离线重试、保存完成后安装和保存超时取消。
- `node scripts/test-updater.cjs` 在真实 Electron 和 NsisUpdater 中连接隔离 loopback 源，验证新版本发现、下载成功、SHA-512 损坏拒绝及网络故障。测试文件不可执行，测试不会启动安装器或接触真实用户目录。
- 两项现有 Electron/Django/浏览器联调通过；新增更新设置 UI 联调通过，覆盖开发环境保护、进度和重启安装按钮。
- 发布 workflow YAML 可解析；打包后运行 `node scripts/verify-update.cjs` 校验真实产物。

尚未进行线上旧版本到新版本的实际安装替换验收，也没有配置代码签名证书。SHA-512 能验证下载与 manifest 一致，但不等同于代码签名。生产代码保留 electron-updater 的默认签名验证行为；未来配置 Windows 证书时需稳定维护 publisherName。
