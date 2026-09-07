# TestFlight 1.3.2（13）

- 日期：2026-09-07。
- 发布源码：`27155448487a53485220480ac4e3eb45d02b6ffa`（master）。
- Bundle ID：`com.chewy.bbtalk`。
- EAS production，远程构建号自动递增，runtimeVersion 为 `1.3.2`。
- [iOS 构建](https://expo.dev/accounts/cone387/projects/mobile/builds/fcd2c381-107b-46ff-b627-02ffbae41344)：成功。
- [TestFlight 提交](https://expo.dev/accounts/cone387/projects/mobile/submissions/1bb27399-eb1f-492b-b527-ee59b0aa52a7)：2026-09-07 21:36:53（北京时间）上传成功。
- App Store Connect 最终核验：`1.3.2 (13)` 为 `internal: in beta testing`，已可供内部测试；外部状态为 `ready for beta submission`，未提交外部 Beta 审核或 App Store 正式发布。

## 发布前验证

- 移动端单元测试：210 项通过。
- ComposeScreen / HomeScreen 界面集成测试：6 项通过。
- TypeScript 类型检查通过，iOS 生产 JS/Hermes 包导出通过。
- Expo Doctor：17/18 项通过；唯一保留提示为现有 `@react-native-voice/voice` 停止维护。本次未迁移语音库，需真机验证。
- [发布提交 CI](https://github.com/cone387/ChewyBBTalk/actions/runs/34126047771)：全部通过。
- [服务端镜像及部署](https://github.com/cone387/ChewyBBTalk/actions/runs/34126047744)：成功。

补齐 `expo-font`、`expo-asset` 原生依赖并对齐 SDK 54 补丁版本，解决重复原生模块；移除 Expo 不支持的 `ios.privacyUrl` 字段。

EAS 拒绝当前套餐通过 `--what-to-test` 提交测试说明（Enterprise 限制），因此改为对同一个 build ID 单独提交，不重复构建。测试说明保留在本文和 `mobile/CHANGELOG.md`。

## 真机测试重点

1. 弱网发布、响应丢失后查询结果及重试原提交，确认只生成一条记录。
2. 重启后恢复原提交，确认当前正文、附件、位置及可见性草稿仍保留。
3. 两个设备编辑同一记录，确认出现冲突提示并可比较最新内容。
4. 前台恢复及断网重连刷新首页，确认筛选条件和未提交搜索输入不丢失。
5. 切换账号或服务地址，确认草稿、待提交内容及旧响应不会串入新会话。
6. 冷启动、字体图标、附件访问与语音输入回归。

自动化界面测试使用模拟的原生桥接，不能代替以上真机验证。
