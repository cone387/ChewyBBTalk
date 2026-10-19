## Why

用户希望每次打开 BBTalk，先看到自己收藏的一句文案，为个人记录增加扉页体验。文案池必须属于当前账号，可以关闭，不能由管理员统一配置。

## What Changes

- 在正式 Web 增加独立文案欢迎页，登录及防窥解锁后展示；每次页面重新打开/刷新开始新一轮展示，应用内导航和短暂切后台不重复展示。
- 设置中管理个人文案、可选出处与开关，支持预览及从自己的记录加入文案。
- 服务端保存账号配置和随机轮换进度，池内用完再循环且避免相邻重复。
- 空池、关闭及网络故障不阻断记录；第一版仅实现随机轮换，不调用外部 AI。

## Capabilities

### New Capabilities
- `personal-welcome`: 私有文案池、账号开关、随机轮换及 Web 欢迎页。

### Modified Capabilities
无。

## Impact

- 后端：`backend/models/__init__.py`、新增数据库迁移、`backend/schemas/welcome.py`、`backend/services/welcome.py`、`backend/api/routes/welcome.py`、`backend/api/router.py`、`backend/backups/transfer.py`。
- Web：`frontend/src/App.tsx`、设置入口、`WelcomeSettingsPage.tsx`、欢迎页组件与服务、`BBTalkItem.tsx`。
- 验证：后端隔离/轮换/迁移/备份测试、Web 交互测试及浏览器验收。
- 新增数据库表，需要运行现有迁移命令；无新部署配置或依赖。本版不修改原生客户端，不宣称端到端加密。
