# TestFlight 1.3.4（15）

- 日期：2026-09-18。
- 发布源码：`f9ed918ec32f544317bb871377b9106c20a7636f`（master）。
- Bundle ID：`com.chewy.bbtalk`。
- EAS production，远程构建号自动递增，runtimeVersion 为 `1.3.4`。
- [iOS 构建](https://expo.dev/accounts/cone387/projects/mobile/builds/988721d0-a41c-4481-82d5-2c7987c584d0)：`FINISHED`，成功。
- [TestFlight 提交](https://expo.dev/accounts/cone387/projects/mobile/submissions/1fb24484-c71c-4ce4-8496-ed9eba1cabe2)：`FINISHED`，2026-09-18 18:11:53（北京时间）上传成功。
- 已确认上传成功，尚未确认 Apple 处理完成或测试者可安装；最终状态见 [App Store Connect](https://appstoreconnect.apple.com/apps/6762428762/testflight/ios)。未提交 App Store 正式发布。

## 更新内容

- 点击「解锁查看历史」直接调用 Face ID / 指纹；密码验证使用小弹窗。
- 保存成功仅提示「已保存」。
- 首页新建按钮、编辑器麦克风支持按住录音、松手结束、上滑取消；首页轻点仍新建文字记录。
- 提前松手、权限申请、应用中断和页面退出时清理录音，避免延迟启动或重复保存。

## 验证

- 211 项单元测试、18 项界面集成测试通过。
- TypeScript 检查和 iOS 生产 JS/Hermes 包导出通过。
- [发布提交 CI](https://github.com/cone387/ChewyBBTalk/actions/runs/35332844265)：移动端、后端通过；桌面和 Web 任务失败，全仓 CI 未全绿。此前失败背景见 [1.3.3 发布记录](testflight-1.3.3.md)。

## 真机测试重点

1. 直接生物识别、取消认证、无生物识别时密码弹窗，以及失败后再次认证。
2. 首页和编辑器按住录音、松手结束；连续录音不重复保存。
3. 上滑取消，滑回后松手完成；取消录音不生成记录或附件。
4. 首次麦克风/语音权限提示、准备期间提前松手、后台中断、离开页面，不应留下继续录音的麦克风。
5. 验证录音附件可播放、转写可用性、录音时长与键盘布局。

自动化测试使用模拟原生桥接，不能代替真机麦克风、手势及生物识别验证。
