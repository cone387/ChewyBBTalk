# 内联评论功能设计

## 架构概览

```
BBTalkCard (卡片)
├── 内容区域（点击编辑）
├── 图片/附件
├── Footer（时间 | 评论按钮 💬 N | 可见性）
├── InlineComments（评论列表，最多3条，可展开）
└── [点击评论按钮] → CommentInputModal（底部弹窗输入框）
```

## 组件设计

### 1. BBTalkCard 改动
- Footer 区域新增评论按钮：`💬 {commentCount}`，点击触发 `onComment(item)` 回调
- Footer 下方新增 `InlineComments` 区域（条件渲染）

### 2. InlineComments 组件（新建）
文件：`mobile/src/components/InlineComments.tsx`

Props:
```typescript
interface InlineCommentsProps {
  bbtalkId: string;
  commentCount: number;
  theme: Theme;
}
```

行为：
- 初始状态：不加载评论，只显示评论计数（已在 footer 显示）
- 当 `expanded=true` 时，调用 `bbtalkApi.getComments(bbtalkId)` 加载评论
- 最多显示 3 条，超过显示"查看全部 N 条评论"
- 展开后显示全部 + "收起"按钮
- 每条评论：`用户名：评论内容  时间`，紧凑单行
- 长按评论弹出删除确认

### 3. CommentInputModal 组件（新建）
文件：`mobile/src/components/CommentInputModal.tsx`

Props:
```typescript
interface CommentInputModalProps {
  visible: boolean;
  bbtalkId: string;
  onClose: () => void;
  onCommentAdded: (comment: Comment) => void;
  theme: Theme;
}
```

行为：
- 底部弹出的 Modal，包含 TextInput + 发送按钮
- 弹出时自动聚焦键盘
- 发送成功后调用 `onCommentAdded` 回调，关闭弹窗

## 数据流

```
用户点击评论按钮
  → HomeScreen 设置 commentTarget = { bbtalkId, ... }
  → CommentInputModal 显示
  → 用户输入并发送
  → bbtalkApi.createComment(bbtalkId, content)
  → onCommentAdded 回调
  → InlineComments 刷新评论列表
  → BBTalk 的 commentCount 本地 +1
```

## HomeScreen 改动
- 新增 state: `commentTarget: string | null`（当前正在评论的 bbtalkId）
- 新增回调: `onComment(item)` → 设置 commentTarget
- 渲染 `CommentInputModal`
- 恢复 `onEdit` 为 `onNavigateCompose`（点击内容编辑）

## 不需要改动的部分
- 后端 API（已完成）
- bbtalkApi（已有 getComments/createComment/deleteComment）
- types（已有 Comment 类型）
- Redux store（commentCount 通过 API 返回，不需要单独管理评论状态）
