# 请求预算修复实施计划

设计见 [design.md](design.md)，审计基线见 ../../../docs/request-count-audit.md。执行使用现有工作区；后端、移动端、图片缓存按独立文件范围并行，Web查询与评论由主代理实施；所有实现先补回归再验证。保留上轮未提交修改，不提交或部署。

- [x] 后端预览及分页：services/records.py、schemas/responses.py、api/routes/records.py；新增集成测试证明批量预览、分页、权限、版本变更及旧数组兼容。
- [x] Web 查询调度与取消：BBTalkPage、bbtalkSlice、apiClient/bbtalkApi；断言初始化一次、tags变化不查feed、焦点合并、过期取消且最新结果正确。
- [x] Web 评论：BBTalk模型与转换、InlineCommentSection；预览无请求、分页展开、写入更新、跨挂载复用、远端revision失效。
- [x] 图片缓存：imageCache与必要鉴权失效；测试同图并发、短期复用、重试失效、换账号及换会话拒绝旧结果。
- [x] 移动端：评论预览分页、读取取消/合并及标签管理单次刷新；覆盖真实组件与服务调用数量。
- [x] 联调与审查：后端、三端测试/类型检查、生产构建操作请求预算E2E，涵盖审计43种场景与评论扩展/权限边界。
- [x] 更新报告为修复后对照、接口文档和OpenSpec；根目录、diff检查、清理一次性文件；逐条完成验收后标记目标完成。
