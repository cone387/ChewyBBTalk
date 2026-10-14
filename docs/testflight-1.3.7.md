# TestFlight 1.3.7（18）

- 日期：2026-10-14。
- 发布源码：`ff894bb6d4a9f16cbb62e69e2395285e46a21315`（master），已推送。
- Bundle ID：`com.chewy.bbtalk`；EAS production，生产服务 `https://bbtalk.cone387.top`。
- [iOS 构建](https://expo.dev/accounts/cone387/projects/mobile/builds/5a2aebee-3114-4279-8616-4f123ec80d33)：`FINISHED`，北京时间 11:29:31 构建成功。
- [TestFlight 提交](https://expo.dev/accounts/cone387/projects/mobile/submissions/eae8c33c-81ef-4cdd-95b3-bd45d22cf207)：`FINISHED`，上传任务无错误。
- App Store Connect API 确认北京时间 11:30:23 上传，11:33 复核已处理完成（`VALID`）、内部测试状态 `IN_BETA_TESTING`，自动通知开启；现有 `bbtalk` 内部测试组的构建列表包含 18。可在 [TestFlight](https://appstoreconnect.apple.com/apps/6762428762/testflight/ios) 查看。
- EAS 套餐不支持提交时附带 `what-to-test`，首次自动提交调度被拒绝；随后复用同一构建、不附带该参数正常提交。没有重复构建或新增构建号。

Apple 构建 ID：`94f89552-269b-42d2-9ded-994cb9df56bd`；最低 iOS 15.1，未过期，无加密合规阻塞。API 确认服务端已开放测试，不代表通知已送达或设备已自动安装新版。

## 修复内容

1. 使用原生兼容库支持的方式构造查询字符串，恢复日期、标签、搜索和分页参数；旧错误日历缓存不再用于显示。
2. 删除导航已表达的重复标签提示和首页右下角单独的录音按钮；保持新建长按及编辑器录音入口。
3. 减少导航切换时的重复刷新、评论弹层引发的列表重绘、Markdown 重复解析及草稿重复序列化；评论聚焦不再等待弹簧动画结束。
4. 日历使用虚拟列表，隔离过期日期请求，保留详情返回后的分页和阅读位置。
5. 缓存读写使用异步 SQLite 和串行事务，保留回滚及账号隔离。
6. 音视频播放器按点击创建；隐藏录音浮层不分配录音器。修复录音快速关闭重开、音频模式恢复顺序和首次语音授权迟到的生命周期问题。

## 验证

- 本地 102 套 / 1271 项单测、8 套 / 70 项界面集成、TypeScript 和 iOS/Android/Web 导出全部通过。
- 下载实际签名 IPA 并在内存中检查：Bundle ID `com.chewy.bbtalk`、版本 `1.3.7`、构建 `18`、runtimeVersion `1.3.7`、`UIUserInterfaceStyle=Automatic` 均正确。
- [GitHub CI](https://github.com/cone387/ChewyBBTalk/actions/runs/38505992840) 移动端覆盖率门槛未通过；本地行覆盖率 94.20% / 要求 99%，分支 86.33% / 要求 93%，函数 87.20% / 要求 95%。未降低基线，不能称为 CI 全绿。
- 当前未连接 iPhone，不能以自动化测试代替实际帧率、原生键盘和视觉验收。具体复验步骤见 [移动端验收说明](../mobile/RELEASE_READINESS.md)。

## 真机测试重点

- 升级后联网打开日历，选择有记录、无记录日期并跨月切换，验证第二页不重复；从详情返回保留原位置。
- 连续切换底部导航、标签和搜索；点击评论后输入；滚动带长文及图片/音视频的记录列表。
- 首次录音授权、取消后再授权、快速关闭重开、结束录音后播放；测试离线恢复、账号切换和隐私锁。

本次沿用现有内部测试分发范围，不提交 App Store 正式发布。
