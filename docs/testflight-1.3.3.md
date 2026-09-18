# TestFlight 1.3.3（14）

- 日期：2026-09-18。
- 发布源码：`426670f38954416d48c08474dca25960522c59fa`（master）；快速记录功能提交为 `d9acef8`。
- Bundle ID：`com.chewy.bbtalk`。
- EAS production，远程构建号自动递增，runtimeVersion 为 `1.3.3`。
- [iOS 构建](https://expo.dev/accounts/cone387/projects/mobile/builds/c72d2ca3-754a-4d61-baa3-2eb053ed75f2)：`FINISHED`，成功。
- [TestFlight 提交](https://expo.dev/accounts/cone387/projects/mobile/submissions/85836b59-a787-4667-9a62-091885d9e942)：`FINISHED`，2026-09-18 16:37:43（北京时间）上传成功。
- 提交日志明确跳过等待 Apple 构建处理。已确认上传成功，未确认测试者可安装；最终处理状态可在 [App Store Connect](https://appstoreconnect.apple.com/apps/6762428762/testflight/ios) 查看。未提交 App Store 正式发布。

## 本轮范围

锁定首页直接进入空白编辑器，查看历史时才解锁；连续保存后仍保持锁定。取消解锁保留输入，锁定编辑器不展示旧草稿、历史标签或旧提交。快速记录草稿独立保存，解锁后的普通编辑器优先恢复原草稿，再依次恢复快速记录草稿。禁用「锁定时允许新建」时保留解锁页。

评估根目录 ROADMAP 和现有移动端能力后，没有必须在本轮新增的功能。AI、Widget、OCR 等继续按实际反馈单独安排。

## 发布前验证

- 211 项移动端单元测试、11 项界面集成测试通过。
- TypeScript 检查、iOS 生产 JS/Hermes 包导出通过。
- Expo Doctor 18/18 项检查通过。
- [发布提交 CI](https://github.com/cone387/ChewyBBTalk/actions/runs/35324631042)：移动端、后端通过；整体未全绿。桌面更新器测试在 Linux 上收到 `unsupported`；Web lint 的测试文件存在两处 `no-empty-pattern`。两部分均不在本次修改范围，未将全仓 CI 描述为通过。
- 界面测试存在 VirtualizedList 的 act 提示，不影响断言通过。

## 真机测试重点

1. 已锁定时冷启动，直接显示空白编辑器，历史内容不闪现。
2. 键盘和附件工具栏布局，连续保存两条记录后仍保持锁定。
3. Face ID / Touch ID、密码解锁及取消解锁；取消后当前输入保留。
4. 保留原草稿后在锁定模式输入新草稿，确认两者互不覆盖，解锁后依次可恢复。
5. 存在旧的待确认提交时，锁定页不显示其正文；新输入保留，解锁后处理原提交。
6. 关闭「锁定时允许新建」后，恢复原解锁页。

自动化测试使用模拟原生桥接，不能代替以上真机验证。
