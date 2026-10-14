# TestFlight 1.3.9（20）

- 日期：2026-10-14。
- 发布源码：`9b748bb7b6dc8db3ae2ecc2fff94077f7092e1e2`（master），已推送。
- Bundle ID：`com.chewy.bbtalk`；EAS production，生产服务 `https://bbtalk.cone387.top`。
- [iOS 构建](https://expo.dev/accounts/cone387/projects/mobile/builds/f877664d-59cd-4680-8fa7-3ab061e39042)：`FINISHED`，北京时间 14:11:59 构建成功。
- [TestFlight 提交](https://expo.dev/accounts/cone387/projects/mobile/submissions/efa0c532-5cb3-4c21-9a19-4c71e629e0a5)：`FINISHED`，上传任务无错误。
- App Store Connect API 确认北京时间 14:12:51 上传；复核时已处理完成（`VALID`），内部测试状态 `IN_BETA_TESTING`，自动通知开启。现有 `bbtalk` 测试组的构建列表包含 20，可在 [TestFlight](https://appstoreconnect.apple.com/apps/6762428762/testflight/ios) 查看。

Apple 构建 ID：`e1d52346-ad56-4376-8d72-ecef8e9372df`；最低 iOS 15.1，未过期，无加密合规阻塞。服务端已开放测试，不代表通知已送达或设备已自动安装新版。

## 改动

1. 首页标签栏右侧“管理”文字改为图标，固定 48pt 点击区域，保留读屏名称。
2. 标签管理页移除上下箭头。列表显示颜色、名称、记录数、更多菜单和拖动手柄；长按拖动，支持跨多行和边缘自动滚动，松手自动保存。
3. 首页顺序即时同步，排序失败恢复原顺序，保存期间阻止重复操作。编辑期间禁止排序，保留名称、颜色和删除功能；读屏用户可以使用调整操作排序。

## 验证

- 102 套 / 1275 项单测、12 套 / 90 项界面集成、TypeScript 和 iOS/Android/Web 导出通过。最后两处状态同步调整另外复验 23 项单测及 15 项集成，均通过。
- 实际签名 IPA 在内存中核对：Bundle ID `com.chewy.bbtalk`、版本 `1.3.9`、构建 `20`、RuntimeVersion `1.3.9`、`UIUserInterfaceStyle=Automatic` 均正确。
- 使用真实拖动组件及模拟原生布局/手势，验证跨多行移动、未移动松手、长列表边缘自动滚动及停止、手势中断、失败回退、账号切换后的旧响应隔离。没有增加原生依赖。
- 本轮浏览器控制连接不可用，没有连接 iPhone；尚未完成截图与真机触摸验收，自动化测试不能替代实际拖动手感、大字体、深色模式和键盘遮挡检查。详见 [移动端验收说明](../mobile/RELEASE_READINESS.md)。
- [源码 CI](https://github.com/cone387/ChewyBBTalk/actions/runs/38520350337) 的移动端覆盖率步骤 `Check mobile coverage baseline` 失败；原有覆盖率门槛未调整，不能称为 CI 全绿。

## 真机复验

- 点击首页固定图标进入标签管理，确认标签横向滚动不带走入口。
- 长按右侧手柄拖到首位、末位和屏幕边缘，确认普通滑动不误触排序，松手后可以继续滚动。
- 返回首页、重新进入管理页，确认顺序一致且已保存。
- 断网排序应提示失败并恢复；更多菜单仍可编辑名称和颜色，删除关联记录仍需二次确认。

本次沿用现有内部测试分发范围，不提交 App Store 正式发布。
