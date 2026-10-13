## 1. 请求与权限

- [x] 1.1 在 mediaApi 与 fileRequest 回归测试中覆盖默认私有、一次刷新、超时到响应体、会话变化、422、失败不重放；先失败后实现并复测。
- [x] 1.2 实现 fileRequest 及上传接入；为 auth 刷新补充 10 秒超时及回归测试。

## 2. 数据与编辑

- [x] 2.1 为导入部分完成、详细错误和导出会话隔离补测试，实现导入导出共享文件请求和完整结果展示。
- [x] 2.2 为更新和清空 context 补失败测试，修复 bbtalkApi PATCH 序列化并验证。

## 3. 音频与说明

- [x] 3.1 测试并实现音频按需下载、缓存、失败重试、防重复与迟到隔离，补独立音频页鉴权。
- [x] 3.2 更新 mobile/README.md、发布说明与 FastAPI 契约的移动适配和升级说明。

## 4. 验收

- [x] 4.1 运行移动端全部单测、界面集成测试、TypeScript 及后端权限/Range/导入契约测试。
- [x] 4.2 审查变更与五项要求覆盖，运行 OpenSpec 校验、根目录检查、git diff --check，记录验证及真机边界。

验收结果：1229 项移动单测、44 项界面集成、64 项后端接口测试、TypeScript 检查通过；Expo iOS/Android Hermes 与 Web 导出通过，产物在 `mobile/dist/fastapi-adaptation/`。独立复审无剩余重要问题。真机播放、S3 跳转及系统分享保留为发布验收边界，详见 `mobile/RELEASE_READINESS.md`。
