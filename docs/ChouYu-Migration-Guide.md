# ChouYu → ChewyBBTalk Desktop 移植指南（精简版）

## 目标

BBTalk Desktop 已经有完整的 Ball + Compose 发布流程。移植的目标是**增强 Compose 编辑体验**，从 ChouYu 中提取有价值的编辑器交互功能，让"快速记录"更顺手。

---

## 现状对比

| | ChewyBBTalk Compose (现有) | ChouYu InputArea |
|--|---------------------------|------------------|
| 文本输入 | ✅ textarea | ✅ textarea |
| 草稿自动保存 | ✅ | ❌ (靠 memory 模块) |
| 发布到 BBTalk | ✅ | ✅ (插件形式) |
| 图片附件 | ❌ (工具栏有图标但未实现) | ✅ 拖拽/粘贴/文件选择 |
| 截图 | ❌ | ✅ desktopCapturer + 裁剪 |
| 文件附件 | ❌ | ✅ 拖拽/对话框 |
| 字数统计 | ✅ | ❌ |
| 可见性选择 | ❌ (硬编码 private) | ❌ |
| 快捷键发布 | ✅ Ctrl+Enter | ✅ Enter (无 Shift) |
| 登录集成 | ✅ 内嵌登录面板 | ✅ (插件设置中) |
| Markdown 预览 | ❌ | ❌ |
| 标签/定位 | ❌ (占位按钮) | ❌ |

---

## 值得移植的功能（按优先级）

### P0：图片附件支持

**来源：** `ChouYu/src/renderer/src/components/ChatPanel/InputArea.tsx`

**功能：**
- 拖拽图片文件到编辑区 → 显示缩略图预览
- 点击附件按钮 → 打开文件选择对话框
- 支持多个附件，可逐个删除
- 图片点击可放大预览

**需要的代码：**
```
InputArea.tsx 中的:
- handleDrop / handleDragOver / handleDragLeave
- handleFileSelect (调用 window.electronAPI.openFileDialog)
- attachments state + attachment-list UI
- previewImage overlay
```

**需要新增的 IPC：**
```typescript
// main process
ipcMain.handle('compose:open-file-dialog', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  const fs = require('fs');
  const path = require('path');
  const ext = path.extname(filePath).toLowerCase();
  const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext);
  if (isImage) {
    const data = fs.readFileSync(filePath);
    const base64 = `data:image/${ext.slice(1)};base64,${data.toString('base64')}`;
    return { type: 'image', data: base64, name: path.basename(filePath) };
  }
  const text = fs.readFileSync(filePath, 'utf-8');
  return { type: 'text', data: text, name: path.basename(filePath) };
});
```

**发布时处理：**
- 图片需要先上传到 BBTalk 后端（如果后端支持），或转为 base64 内嵌
- 需确认 BBTalk API 是否支持图片字段

---

### P1：截图功能

**来源：** `ChouYu/src/renderer/src/components/ScreenCapture/ScreenCapture.tsx`

**功能：**
- 点击截图按钮 → 隐藏 Compose 窗口 → 全屏截取 → 显示裁剪框 → 确认后作为附件

**需要的代码：**
```
ScreenCapture/ScreenCapture.tsx  — 裁剪 UI 组件
ScreenCapture/ScreenCapture.css  — 样式
```

**需要新增的 IPC：**
```typescript
// main process
import { desktopCapturer } from 'electron';

ipcMain.handle('compose:take-screenshot', async (_, hideWindow?: boolean) => {
  const composeWin = getComposeWindow();
  if (hideWindow && composeWin) composeWin.hide();

  // 短暂延迟让窗口完全隐藏
  await new Promise(r => setTimeout(r, 200));

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: screen.getPrimaryDisplay().workAreaSize
  });

  if (hideWindow && composeWin) composeWin.show();

  if (!sources.length) return null;
  return sources[0].thumbnail.toDataURL();
});
```

**注意：** 截图裁剪 UI 需要一个临时的全屏窗口或在 Compose 窗口中 overlay 显示。考虑到 Compose 窗口较小（440×160），建议：
- 方案 A：临时创建一个全屏透明窗口做裁剪（更好的体验）
- 方案 B：在 Ball overlay 窗口中渲染裁剪 UI（复用现有窗口）

推荐方案 B，因为 Ball overlay 本身就是全屏透明窗口。

---

### P2：可见性选择器

**来源：** ChouYu BBTalk 插件中硬编码了 `visibility: 'private'`，但 BBTalk API 支持多种可见性。

**功能：**
- 工具栏的 🔒 按钮改为可点击的下拉选择
- 选项：公开 / 仅好友 / 私密
- 选择后持久化到 electron-store

**实现（无需从 ChouYu 移植，直接新写）：**
```typescript
// store schema 扩展
compose: {
  draft: '',
  visibility: 'private' as 'public' | 'friends' | 'private'
}

// ComposeWindow.tsx 中
const [visibility, setVisibility] = useState<string>('private');
useEffect(() => {
  // 从 store 读取上次选择
  window.desktop.compose.getVisibility().then(setVisibility);
}, []);
```

---

### P3：Ctrl+V 粘贴图片

**来源：** ChouYu 的 InputArea 支持从剪贴板粘贴图片

**功能：**
- 在 textarea 中 Ctrl+V → 检测剪贴板是否有图片 → 有则作为附件

**实现：**
```typescript
// ComposeWindow.tsx textarea 上添加
const handlePaste = (e: React.ClipboardEvent) => {
  const items = Array.from(e.clipboardData.items);
  const imageItem = items.find(item => item.type.startsWith('image/'));
  if (imageItem) {
    e.preventDefault();
    const blob = imageItem.getAsFile();
    if (!blob) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAttachments(prev => [...prev, {
        type: 'image',
        data: reader.result as string,
        name: `粘贴图片.png`
      }]);
    };
    reader.readAsDataURL(blob);
  }
};
```

---

## 不需要移植的部分

| ChouYu 功能 | 原因 |
|-------------|------|
| AI 对话引擎 | 目标是快速发布，不需要 AI 对话 |
| 消息历史/记忆 | 不需要对话历史 |
| 插件系统 | BBTalk 功能已内建 |
| 宠物角色/动画 | Ball 设计已足够 |
| 主动问候/久坐提醒 | 与快速记录场景无关 |
| 剪贴板监听 | 可以后续单独考虑，不是核心 |
| 命令菜单 (`/` 指令) | 单一发布场景不需要 |
| 模型选择器 | 不需要 AI |
| Settings 面板 | BBTalk Desktop 已规划自己的设置 |

---

## 实施计划

### Step 1：附件基础设施

1. 在 `ComposeWindow.tsx` 中新增 `attachments` state
2. 添加附件预览 UI（缩略图列表 + 删除按钮）
3. 实现拖拽上传（`onDrop` / `onDragOver`）
4. 实现粘贴图片（`onPaste`）
5. 新增 `compose:open-file-dialog` IPC handler
6. 工具栏 📎 按钮接入文件选择

### Step 2：发布时携带图片

1. 确认 BBTalk API 图片上传接口（是否支持 multipart 或 base64）
2. 修改 `publish()` 函数，发布时附带图片
3. 如果后端不支持图片，先做本地预览 + 提示"暂不支持图片发布"

### Step 3：截图功能

1. 新增 `compose:take-screenshot` IPC handler
2. 在 Ball overlay 中新增 ScreenCapture 组件
3. 工具栏截图按钮触发截图流程
4. 裁剪完成后将图片传回 Compose 窗口作为附件

### Step 4：可见性选择

1. 工具栏 🔒 按钮改为下拉菜单
2. 持久化选择到 electron-store
3. 发布时使用选中的 visibility 值

---

## Compose 窗口增强后的目标 UI

```
┌─────────────────────────────────────────┐
│                                       × │  ← titlebar
├─────────────────────────────────────────┤
│ [img1] [img2]                     ✕  ✕  │  ← 附件预览区（有附件时显示）
├─────────────────────────────────────────┤
│                                         │
│  记一下点什么…                           │  ← textarea
│                                         │
├─────────────────────────────────────────┤
│ 🔒▾  🏷️  📎  📷      42  [发布 ⌘⏎]    │  ← toolbar
└─────────────────────────────────────────┘
     ↑    ↑   ↑   ↑
     │    │   │   └── 截图（P1）
     │    │   └────── 文件选择（P0）
     │    └────────── 标签（未来）
     └─────────────── 可见性选择（P2）
```

**窗口高度自适应：**
- 无附件时：160px（现有）
- 有附件时：200px（+40px 预览区）
- 需要调用 `composeWindow.setSize()` 或用 CSS 自适应

---

## 从 ChouYu 直接可复制的代码片段

| 文件 | 复制内容 | 放置位置 |
|------|---------|---------|
| `InputArea.tsx` | `handleDrop`, `handleDragOver`, `handleDragLeave` | `ComposeWindow.tsx` |
| `InputArea.tsx` | `attachments` state + `attachment-list` JSX | `ComposeWindow.tsx` |
| `InputArea.tsx` | `previewImage` overlay JSX | `ComposeWindow.tsx` |
| `ScreenCapture.tsx` | 整个组件 | `src/renderer/ball/ScreenCapture.tsx` |
| `ScreenCapture.css` | 整个文件 | `src/renderer/ball/screenCapture.css` |

样式需要适配 Compose 窗口的毛玻璃/白色背景风格，ChouYu 的样式是暗色透明风格。

---

*文档版本：v2.0 — 精简为编辑器增强*
