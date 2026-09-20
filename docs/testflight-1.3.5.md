# TestFlight 1.3.5（16）

- 日期：2026-09-20。
- 发布源码：`3491d4209aef9d9be131f6032e546772105bdcb1`（master）；功能提交为 `6d30f0b`。
- Bundle ID：`com.chewy.bbtalk`。
- EAS production，远程构建号自动递增，runtimeVersion 为 `1.3.5`；生产服务为 `https://bbtalk.cone387.top`。
- [iOS 构建](https://expo.dev/accounts/cone387/projects/mobile/builds/bce27873-d578-41aa-b65f-37483eb0eb3a)：`FINISHED`，2026-09-20 11:10:50（北京时间）构建成功。
- [TestFlight 提交](https://expo.dev/accounts/cone387/projects/mobile/submissions/6061b49e-83f9-4c9d-86b1-5bc023c18a4d)：`FINISHED`，2026-09-20 11:12:27（北京时间）上传成功。尚未确认 Apple 处理完成或测试者可安装。
- 最终 Apple 处理及测试分组状态见 [App Store Connect](https://appstoreconnect.apple.com/apps/6762428762/testflight/ios)。本次不提交 App Store 正式发布。

## 更新内容

- 本机草稿自动保存、后台落盘、退出恢复；附件上传失败保留副本并支持重试。
- 私密保存和公开发布区分；公开正文与附件前确认，语音录入进入编辑器检查后保存。
- 独立阅读页及阅读防窥，优化登录、编辑器和设置布局，支持跟随系统外观。
- 修改密码后旧访问令牌、刷新令牌失效；邮件找回根据服务端配置开放，当前生产 SMTP 尚未配置。

## 验证与发布情况

- 本轮功能代码的 214 项移动端单元测试、29 项界面集成测试、TypeScript 检查及 iOS JS/Hermes 导出通过。
- 版本配置确认：1.3.5、跟随系统外观、生产 API 地址；Expo Doctor 18/18 项通过。
- 已下载实际签名 IPA，核对 Bundle ID `com.chewy.bbtalk`、版本 `1.3.5`、构建号 `16`、运行时 `1.3.5` 及 `UIUserInterfaceStyle=Automatic` 均正确。
- 后端 100 项测试通过；发布镜像的 16 项认证测试通过；生产 PostgreSQL 迁移、修改密码及令牌失效验证通过，临时测试账号已事务回滚。
- [功能提交 CI](https://github.com/cone387/ChewyBBTalk/actions/runs/35484827411)：后端与移动端通过；Web lint 和桌面端 Linux 更新器测试的原有失败仍存在，全仓 CI 未全绿。
- EAS 自动填写 TestFlight 测试说明需要 Enterprise 套餐，因此改为不附带测试说明提交同一个构建，测试重点记录如下。
- 本地 Apple API 查询返回 401；不以 EAS 提交成功推断 Apple 已处理完成或测试者可安装。

## 真机测试重点

1. 输入后切后台、退出、强杀及重启，验证草稿恢复和保存状态；检查 iOS 返回手势的保存、丢弃、继续编辑选择。
2. 附件上传失败后离开并恢复草稿，验证本机附件保留、重试及账号隔离。
3. 连续录音、上滑取消、首次权限提示、后台中断，以及录音后编辑与保存。
4. 私密保存和公开确认；阅读页、照片预览在防窥锁定后隐藏。
5. 小屏、大字体、VoiceOver、键盘遮挡和安全区域；跟随系统深浅色切换。
6. 修改密码后旧会话失效、新密码重新登录；邮件找回显示当前服务尚未开放的说明。

自动化测试不能代替真机权限、录音、返回手势及视觉验收。其余发布前事项见 [移动端首发验收](../mobile/RELEASE_READINESS.md)。
