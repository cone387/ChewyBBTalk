# TestFlight 1.3.6（17）

- 日期：2026-10-13。
- 发布源码：`6e3f1b1ef1f5c3832ef1fe1cda563739debc79b0`（master），已推送。
- Bundle ID：`com.chewy.bbtalk`；EAS production，生产服务 `https://bbtalk.cone387.top`。
- [iOS 构建](https://expo.dev/accounts/cone387/projects/mobile/builds/b2423a21-9aa0-48f0-a9ab-3f925a59338a)：`FINISHED`，北京时间 17:20:20 构建成功。
- [TestFlight 提交](https://expo.dev/accounts/cone387/projects/mobile/submissions/a90ae659-9fd1-44bc-baa4-756bc0883429)：`FINISHED`，北京时间 17:32:54 成功上传 App Store Connect；提交任务无错误。
- 用户处理 Apple 协议后，复用同一构建重试成功，先前的 `EAS_ASC_REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED` 阻塞已解除。
- 2026-10-14 通过 App Store Connect API 复核：Apple 已处理完成（`VALID`），内部测试状态为 `IN_BETA_TESTING`；构建已加入 `bbtalk` 内部测试组，可在 [TestFlight](https://appstoreconnect.apple.com/apps/6762428762/testflight/ios) 查看。

## 已完成验证

- 发布前本地 102 套 / 1240 项单测、8 套 / 61 项界面集成、TypeScript 检查通过。
- 下载实际签名 IPA 核对：Bundle ID `com.chewy.bbtalk`、版本 `1.3.6`、构建号 `17`、runtimeVersion `1.3.6`、`UIUserInterfaceStyle=Automatic` 均正确。
- [本次 GitHub CI](https://github.com/cone387/ChewyBBTalk/actions/runs/38374279900) 的移动端 1240 项测试通过，但覆盖率检查失败：行 94.31% / 要求 99%，分支 86.86% / 要求 93%，函数 86.82% / 要求 95%；部分文件也未达到原有覆盖率门槛。未降低基线，不能将 CI 标记为全绿。
- EAS CLI 确认安装包已成功上传；GraphQL 返回提交及 jobRun 均为 `FINISHED`、错误列表为空。Expo 的 `appStoreConnectBuildUpload` 仍为空，后续状态已直接通过 App Store Connect API 验证。本次未提交 App Store 正式发布。

## 2026-10-14 测试分发复核

- Apple 构建 ID：`b630bf3c-3bd3-46bf-9015-a3f0d41cf563`；版本 `1.3.6`、构建 `17`，未过期，最低 iOS 15.1。
- `processingState=VALID`、`usesNonExemptEncryption=false`，没有处理或加密合规阻塞。
- `internalBuildState=IN_BETA_TESTING`、`autoNotifyEnabled=true`。
- `bbtalk` 是内部测试组，`hasAccessToAllBuilds=true`；组的构建列表包含 17，组内 1 名测试人员状态为 `INSTALLED`。该状态只说明测试人员已有安装记录，不代表其设备已安装 17。
- 外部测试状态为 `READY_FOR_BETA_SUBMISSION`；目前没有外部测试组。本次沿用已有内部测试范围。
- 用户报告未收到更新；服务端已开放内部测试，但 API 无法确认通知是否送达或设备是否已显示新版，仍需核对手机 TestFlight 页面。未重复上传、移除测试人员或重发邀请。

## 本版测试重点

1. 搜索历史即查、清空恢复列表、关键词与标签筛选移除。
2. 草稿目录与恢复提示、附件逐项失败重试、首页语音入口。
3. 长文摘要、多图预览、紧凑评论、明确的公开状态。
4. 日历选择年月、原地分页阅读、离线缓存和失败页重试。
5. 离线保存后退出/重启、联网与前台恢复自动同步、账号切换隔离、编辑冲突确认。
6. 隐私锁隐藏历史编辑内容；连续相同内容的快速录入、清理短暂失败不重复提交或误删草稿。

原生键盘、动态大字体、录音权限、系统强杀恢复仍需设备实测，见 [移动端验收说明](../mobile/RELEASE_READINESS.md)。

## 发布工具说明

本次协议处理后复用构建 `b2423a21-9aa0-48f0-a9ab-3f925a59338a` 提交成功，未增加构建号或重新构建。上传已完成，无需再次提交同一安装包。

本机 EAS CLI 的 Windows Shell 自动识别会卡在 `Get-CimInstance`，PowerShell 可先设置 `$env:SHELL='powershell.exe'` 后再运行。该设置仅影响当前进程环境，不修改项目配置。
