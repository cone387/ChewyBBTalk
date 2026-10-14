# TestFlight 1.3.8（19）

- 日期：2026-10-14。
- 发布源码：`c007e1775237e4eb5bd8858dd0765cdd8ff9a707`（master），已推送。
- Bundle ID：`com.chewy.bbtalk`；EAS production，生产服务 `https://bbtalk.cone387.top`。
- [iOS 构建](https://expo.dev/accounts/cone387/projects/mobile/builds/d075edf2-3229-4d72-9545-a07c98abc751)：`FINISHED`，北京时间 12:12:23 构建成功。
- [TestFlight 提交](https://expo.dev/accounts/cone387/projects/mobile/submissions/399d9a36-561f-4152-ad59-0bc34233c1c8)：`FINISHED`，上传任务无错误。
- App Store Connect API 确认北京时间 12:13:25 上传；复核时已处理完成（`VALID`），内部测试状态 `IN_BETA_TESTING`，自动通知开启。现有 `bbtalk` 内部测试组的构建列表包含 19，可在 [TestFlight](https://appstoreconnect.apple.com/apps/6762428762/testflight/ios) 查看。

Apple 构建 ID：`c19a1f71-a9cd-41c6-9e9c-92e92d41dbfc`；最低 iOS 15.1，未过期，无加密合规阻塞。以上确认服务端已开放测试，不代表通知已送达或设备已自动安装新版。

## 改动

1. 首页去掉多余标题与左侧图标，直接显示搜索框和简洁标签栏；“管理”固定在右侧，上滑收起搜索区、标签栏吸顶。移除设置页旧的标签栏显示开关。
2. 日历记录卡片增加时间、标签、Markdown 正文、图片网格、附件名称与类型、置顶和可见性；预览有上限，列表中不初始化音视频播放器，点击仍经过原有隐私守卫。
3. 打开旧记录而未修改、全部还原或成功保存后不再留下多余草稿提示。旧版完整且未变化的编辑快照安全过滤，真实未保存的修改继续保留，提示区区分编辑草稿与未完成的新记录。

## 验证

- 本地 102 套 / 1272 项单测、11 套 / 85 项界面集成、TypeScript 和 iOS/Android/Web 导出通过。
- 下载实际签名 IPA 并在内存中检查：Bundle ID `com.chewy.bbtalk`、版本 `1.3.8`、构建 `19`、RuntimeVersion `1.3.8`、`UIUserInterfaceStyle=Automatic` 均正确。
- [源码 CI](https://github.com/cone387/ChewyBBTalk/actions/runs/38509551991) 的移动端覆盖率步骤失败。覆盖率仍未达到原有门槛：行 93.34% / 99%，分支 85.16% / 93%，函数 85.90% / 95%，未降低基线，不能称为 CI 全绿。
- 浏览器控制连接不可用，未完成本轮截图验收；当前未连接 iPhone，原生键盘、触摸命中、实际帧率和大字体视觉效果仍需真机复验。详细记录见 [移动端验收说明](../mobile/RELEASE_READINESS.md)。

## 真机测试重点

- 首页搜索与历史点击、横向标签滚动、固定管理入口、连续上下滚动吸顶、下拉刷新、锁定后解锁和批量模式。
- 日历有记录/无记录日期、分页、富媒体预览、点击进入详情以及返回阅读位置。
- 旧记录打开后直接退出、修改后还原、保存后退出；真实未保存的正文、标签、附件和位置修改可恢复。

本次沿用现有内部测试分发范围，不提交 App Store 正式发布。
