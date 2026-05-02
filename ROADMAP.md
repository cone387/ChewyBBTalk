# ChewyBBTalk · 迭代路线图（建议）

> 这份文档收集了产品下一阶段的迭代建议，按优先级排列，作为后续规划的参考。
> 不是承诺，按需取舍。具体落地时再用 OpenSpec 流程拆成 change。

---

## 🔥 高优先级（建议优先做）

### 1. 全文搜索

**痛点**：碎碎念越积越多后，"上次我记的那条..." 找不到。

**方案**：
- SQLite：启用 [FTS5 虚表](https://www.sqlite.org/fts5.html)，对 `BBTalk.content` 建索引
- PostgreSQL：使用 `pg_trgm` + `tsvector`，支持中文分词（`zhparser` / `jieba`）
- 前端：搜索框 + 按标签 / 时间范围 / 是否含附件过滤
- 接口：`GET /api/bbtalk/search/?q=xxx&tag=xxx&from=xxx`

**预估**：后端 2-3 天，前端 1-2 天。

### 2. mobile / frontend 双前端统一

**痛点**：`frontend/`（React + Vite）与 `mobile/`（Expo + RN Web）功能重复，维护双倍成本。

**方案**：
- 评估 `mobile/` 的 Web 输出是否能完全替代 `frontend/`
- 把 `mobile/` Web 构建产物挂到 nginx，下线 `frontend/`
- 桌面端独有功能（如键盘快捷键、拖拽上传）补到 mobile 的 web-only 分支

**收益**：维护成本减半 + 三端 UI 完全一致。

### 3. 数据备份自动化

**痛点**：现在依赖用户手动导出。

**方案**：
- 后端：Celery 定时任务（每日 / 每周）自动打包 SQLite + media 到指定目录
- 可选上传到 S3 / 阿里云 OSS
- 前端：用户面板可下载最近 N 份备份
- 配置项：保留份数、加密密码

---

## 💎 中优先级（提升体验）

### 4. AI 辅助

按子能力分阶段：

- **智能标签**：根据 content 自动建议标签（本地 LLM 或 OpenAI API）
- **智能回顾**："去年今日"、"上周思考"，邮件 / 推送提醒
- **语义搜索**：用 `pgvector` + embedding，搜「焦虑」能找出「最近压力大」
- **OCR**：图片附件提取文字，纳入搜索索引（Tesseract / 苹果 Vision）
- **语音转文字**：录音附件自动转写（Whisper / 苹果 Speech）

### 5. 实时多端同步

**痛点**：iOS 写完后，桌面端要刷新才能看到。

**方案**：Django Channels + WebSocket，broadcast `bbtalk_created/updated/deleted` 事件。前端订阅后实时更新列表。

### 6. 双因素认证（2FA）

**方案**：TOTP（Google Authenticator 兼容） + 备用码。`django-otp` 即可接入。

### 7. 评论扩展为多人协作

**当前**：评论模型已存在，但仅作者自己使用。

**扩展方向**：
- 邀请好友（生成邀请链接 / 二维码）评论指定 BBTalk
- 权限粒度：私密 / 仅好友可见 / 公开
- 类似 Day One 的「Shared Journals」

---

## 🛠 中长期（工程健康度）

### 8. 测试覆盖 + CI

- 后端：补充 `pytest-django`，目标覆盖率 70%+
- 移动端：扩展 `__tests__/`，关键 hooks 与 service 层 100%
- GitHub Actions：push / PR 自动跑测试 + lint + 类型检查

### 9. 监控与日志

- Sentry 接入（前后端错误上报）
- 后端结构化日志（JSON），可对接 Loki / ELK
- API 性能监控（慢查询 / N+1）

### 10. 国际化（i18n）

- 移动端：`i18n-js` 或 `react-i18next`
- 后端：Django 自带 i18n
- 至少：中文（已有）、英文
- App Store 国际化文案 + 截图

### 11. 性能优化

- 列表：`@shopify/flash-list` 替换 `FlatList`
- 图片：缩略图 + 懒加载，原图按需下载
- API 分页：游标分页替换 offset
- 后端 Redis 缓存热数据

---

## 🎨 产品 / 交互层

### 12. 写作辅助

- 写作模板（晨间日记 / 复盘 / 灵感记录）
- iOS Widget（首屏快速写一条）
- macOS / Windows 原生快捷键（如 ⌘N 新建）
- CLI：`chewy add "今天的灵感"` 终端速记

### 13. 数据可视化

- 写作热力图（GitHub-style）
- 标签使用分布（饼图 / 词云）
- 时间线视图（按月 / 季归档）
- 字数统计、连续记录天数

### 14. 第三方集成

- 微信读书 / 豆瓣：导入读书笔记
- Telegram bot：发消息给 bot 自动建一条 BBTalk
- IFTTT / 快捷指令：iOS Siri 语音速记
- RSS 输出（公开标签的 BBTalk 转 RSS）

---

## 推荐近期 Sprint

如果要选 3 个最先做：

1. **全文搜索** — 用户体验立竿见影，工程量适中
2. **AI 智能标签** — 差异化卖点，App Store 上架时是亮点
3. **frontend 下线计划** — 长期减负，让维护更轻

---

## 流程

具体落地时按 OpenSpec 工作流：

```
openspec change create <name>   # 立项
openspec change validate <name> # 校验
# 实施 → tests → review
openspec archive <name>         # 完成归档
```

详见 [openspec/](./openspec/) 与 [.github/skills/](./.github/skills/)。
