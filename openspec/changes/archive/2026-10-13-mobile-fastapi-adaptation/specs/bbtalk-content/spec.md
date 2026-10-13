## ADDED Requirements

### Requirement: 移动编辑上下文
移动编辑 SHALL 保留并提交显式提供的 context，支持空对象清除，未提供时不修改。

#### Scenario: 修改或清除定位
- **WHEN** 编辑器提交更新后的定位上下文
- **THEN** PATCH 包含该 context，且其他上下文字段保留

### Requirement: 音频按需加载
原生列表音频 SHALL 在点击前不发起媒体下载，已有缓存可复用；失败 SHALL 可重试，换源或卸载 SHALL 忽略旧下载结果。

#### Scenario: 浏览音频列表
- **WHEN** 多个音频卡片挂载但未点击
- **THEN** 不下载完整文件；点击后下载并播放，重复点击不重复下载

#### Scenario: 私有音频播放
- **WHEN** 播放当前服务的私有音频
- **THEN** 下载包含鉴权；外部签名地址不携带当前服务令牌；非 2xx 不作为音频缓存播放
