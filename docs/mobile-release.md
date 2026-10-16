# iOS 正式包与 TestFlight

通常在 `mobile/` 执行 EAS production 构建，再提交该构建。EAS 云构建额度耗尽时，可使用仓库的 `iOS signed release` 手动工作流，在 GitHub 托管 macOS 上归档同一应用。此工作流只接受 `master`，不会自动上传 App Store Connect。

## 签名与构建

1. 在 EAS 预留一个尚未上传 Apple 的递增构建号，确认 `mobile/app.json` 的版本号；不要与另一条发布流程共用构建号。
2. 使用 [Expo 凭证同步](https://docs.expo.dev/app-signing/syncing-credentials/) 获取本应用已有的 App Store 分发证书与 profile。将以下字段组成 JSON，经标准输入写入本仓库的加密 Secret `IOS_SIGNING_BUNDLE`，不得作为命令行参数或提交到仓库：`bundleIdentifier`、`teamId`、`certificateP12`（base64）、`certificatePassword`、`provisioningProfile`（base64）。本应用限定为 `com.chewy.bbtalk` / `3GB4JPZU5X`。
3. 手动运行 `.github/workflows/ios-release.yml`，`build_number` 填预留号码。工作流在安装依赖后才注入签名 Secret，校验 profile 的应用、团队与 App Store 类型，并从临时钥匙串中选择与 profile 匹配的有效证书指纹。不要根据证书名称假定它一定叫 `Apple Distribution`。
4. 下载 `ios-signed-release-<build_number>` artifact。核对 `source.json`、IPA 的 `Info.plist`、`Expo.plist` 和内嵌应用配置：版本、构建号、生产接口和 runtime 均须正确；结合本轮 iOS 原生视觉验收结果决定是否提交。
5. 构建流程无论成功与否都会删除临时钥匙串、证书和 profile；操作者在构建终止后删除临时仓库 Secret：`gh secret delete IOS_SIGNING_BUNDLE`。Artifact 仅包含 IPA、归档/导出日志及公开构建信息，保留 7 天。

## 提交与验收

在 `mobile/` 使用 `eas submit --platform ios --profile production --path <IPA路径> --groups bbtalk --non-interactive` 提交已核对的包，沿用 EAS 管理的 App Store Connect 提交密钥。不因 CLI 返回值单独认定上传成功：以实际提交状态、Apple `VALID`、`IN_BETA_TESTING` 和 `bbtalk` 测试组包含新构建为准。中文测试说明可通过 App Store Connect 写入并回读确认。

移动端代码变更不要求重启没有变化的前后端服务。发布证据与尚未验证的平台边界记录在 [移动端验收](../mobile/RELEASE_READINESS.md)。
