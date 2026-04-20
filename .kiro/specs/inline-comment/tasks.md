# 内联评论功能任务

## Task 1: 回滚详情页改动
- [ ] 删除 `BBTalkDetailScreen.tsx`
- [ ] 从 `App.tsx` 移除 BBTalkDetail 路由和 import
- [ ] HomeScreen 恢复 `onEdit={onNavigateCompose}`（点击卡片内容进入编辑）
- [ ] 移除 `onNavigateDetail` 回调

## Task 2: 创建 CommentInputModal 组件
- [ ] 新建 `mobile/src/components/CommentInputModal.tsx`
- [ ] 底部弹出 Modal，包含 TextInput + 发送按钮
- [ ] 弹出时自动聚焦
- [ ] 调用 `bbtalkApi.createComment` 发送评论
- [ ] 发送成功回调 `onCommentAdded`

## Task 3: 创建 InlineComments 组件
- [ ] 新建 `mobile/src/components/InlineComments.tsx`
- [ ] 懒加载评论列表（展开时才请求）
- [ ] 默认显示最多 3 条，超过显示"查看全部"
- [ ] 展开/收起切换
- [ ] 长按评论弹出删除确认
- [ ] 紧凑排列：`用户名：内容  时间`

## Task 4: 改造 BBTalkCard
- [ ] Footer 新增评论按钮 `💬 N`，点击触发 `onComment` 回调
- [ ] BBTalkCardProps 新增 `onComment: (item: BBTalk) => void`
- [ ] Footer 下方渲染 `InlineComments`（当 commentCount > 0 时）
- [ ] 更新 `arePropsEqual` 比较函数

## Task 5: 改造 SwipeableBBTalkCard
- [ ] 透传 `onComment` prop

## Task 6: 改造 HomeScreen
- [ ] 新增 `commentTarget` state
- [ ] 新增 `handleComment` 回调
- [ ] 渲染 `CommentInputModal`
- [ ] 评论成功后刷新对应卡片的评论列表
