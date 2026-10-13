## Why

FastAPI 3.0 主协议已接入移动端，但草稿附件公开、文件请求认证分散、导入反馈不完整及编辑上下文漏传影响实际使用。音频列表自动下载与过时说明也需要一起修正。

## What Changes

- 附件上传默认私有，发布时沿用后端的记录可见性同步。
- 文件上传、导入导出复用带一次 401 刷新、超时、会话隔离和错误解析的请求服务。
- 导入展示部分成功、附件及评论统计和具体错误；编辑提交 context。
- 音频卡片点击后加载，保留缓存播放与失败重试；更新 FastAPI 升级说明。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `attachment-storage`: 移动上传私有默认与文件请求保护。
- `data-portability`: 移动导入完整结果反馈。
- `bbtalk-content`: 编辑上下文与按需音频加载。

## Impact

修改 mobile/src/services/api/mediaApi.ts、bbtalkApi.ts、auth.ts、screens/DataManagementScreen.tsx、components/AudioPlayerButton.tsx、screens/AudioPlayScreen.tsx、mobile/README.md；新增文件请求服务及相关回归测试。无新依赖、部署配置或数据库迁移。
