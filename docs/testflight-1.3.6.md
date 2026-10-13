# TestFlight 1.3.6（17）

- 日期：2026-10-13。
- 发布源码：`6e3f1b1ef1f5c3832ef1fe1cda563739debc79b0`（master），已推送。
- Bundle ID：`com.chewy.bbtalk`；EAS production，生产服务 `https://bbtalk.cone387.top`。
- [iOS 构建](https://expo.dev/accounts/cone387/projects/mobile/builds/b2423a21-9aa0-48f0-a9ab-3f925a59338a)：`FINISHED`，北京时间 17:20:20 构建成功。
- [TestFlight 提交](https://expo.dev/accounts/cone387/projects/mobile/submissions/bab0d44b-307d-4cf9-81a3-866e992daa1d)：`ERRORED`，北京时间 17:20:37 结束；没有上传成功。
- Apple 返回 `EAS_ASC_REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`：必须由开发者账号持有人查看并接受缺失或过期的协议。入口：[App Store Connect 协议](https://appstoreconnect.apple.com/business)；如有提示，同时处理 [Apple Developer Program 许可协议](https://developer.apple.com/account)。

## 已完成验证

- 发布前本地 102 套 / 1240 项单测、8 套 / 61 项界面集成、TypeScript 检查通过。
- 下载实际签名 IPA 核对：Bundle ID `com.chewy.bbtalk`、版本 `1.3.6`、构建号 `17`、runtimeVersion `1.3.6`、`UIUserInterfaceStyle=Automatic` 均正确。
- [本次 GitHub CI](https://github.com/cone387/ChewyBBTalk/actions/runs/38374279900) 的移动端 1240 项测试通过，但覆盖率检查失败：行 94.31% / 要求 99%，分支 86.86% / 要求 93%，函数 86.82% / 要求 95%；部分文件也未达到原有覆盖率门槛。未降低基线，不能将 CI 标记为全绿。
- 云端签名构建成功不等于 TestFlight 已发布。当前尚未完成 Apple 上传、处理或测试分组验证，也未提交 App Store 正式发布。

## 本版测试重点

1. 搜索历史即查、清空恢复列表、关键词与标签筛选移除。
2. 草稿目录与恢复提示、附件逐项失败重试、首页语音入口。
3. 长文摘要、多图预览、紧凑评论、明确的公开状态。
4. 日历选择年月、原地分页阅读、离线缓存和失败页重试。
5. 离线保存后退出/重启、联网与前台恢复自动同步、账号切换隔离、编辑冲突确认。
6. 隐私锁隐藏历史编辑内容；连续相同内容的快速录入、清理短暂失败不重复提交或误删草稿。

原生键盘、动态大字体、录音权限、系统强杀恢复仍需设备实测，见 [移动端验收说明](../mobile/RELEASE_READINESS.md)。

## 协议处理后的恢复操作

继续提交同一个已成功构建的安装包，无需增加构建号或重新构建：

```sh
cd mobile
npx eas-cli submit --platform ios --profile production --id b2423a21-9aa0-48f0-a9ab-3f925a59338a --non-interactive --wait
```

本机 EAS CLI 的 Windows Shell 自动识别会卡在 `Get-CimInstance`，PowerShell 可先设置 `$env:SHELL='powershell.exe'` 后再运行。该设置仅影响当前进程环境，不修改项目配置。
