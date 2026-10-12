## Why

用户发现 Web 隐私设置缺少自动防窥总开关。页面目前只提供时长和倒计时选项，首页将计时固定为开启。

## What Changes

- 补齐“启用自动防窥”，使用本地 `privacy_enabled` 保存选择并同步同页及跨标签页。
- 关闭时停止自动计时并禁用相关设置，保留已选时长和倒计时偏好；开启后重新计时。
- 保持现有默认开启行为及已锁定页面的显式解锁流程。

## Capabilities

### Modified Capabilities
- `privacy-lock`: 补齐 Web 自动防窥配置。

## Impact

仅 Web 设置、首页启用条件及回归测试，无后端、部署配置或移动端改动。
