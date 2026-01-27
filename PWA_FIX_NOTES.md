# PWA 问题修复说明

## 修复的问题

### 1. PWA 模式下顶部蓝色空间
**原因**: 状态栏样式设置不当，主题色为蓝色 (#4F46E5)，与应用背景色不一致

**修复**:
- 将 `theme-color` 从蓝色改为灰白色 (#F9FAFB)，与应用背景色 `bg-gray-50` 一致
- 在 body 元素上设置背景色 `#F9FAFB`，确保整体风格统一
- 保持 `apple-mobile-web-app-status-bar-style` 为 `default`，使用系统默认样式
- 在 CSS 中添加安全区域适配，使用 `env(safe-area-inset-*)` 处理刘海屏和底部指示器
- 更新 PWA manifest 的主题色和背景色为 `#F9FAFB`

### 2. PWA 过段时间打开后绕开防窥模式
**原因**: 防窥状态虽然保存到 localStorage，但在应用初始化时没有立即检查和跳转

**修复**:
- 在 App.tsx 中添加 `PrivacyModeChecker` 组件，在路由初始化时检查防窥状态
- 如果检测到 `bbtalk_privacy_mode=true`，立即跳转到 `/locked` 页面
- 优化 usePrivacyMode hook，确保初始化时正确恢复防窥状态
- 防止通过刷新、后退/前进等方式绕过防窥模式

## 修改的文件

1. `frontend/index.html` - 更新 meta 标签，设置主题色为 #F9FAFB
2. `frontend/src/index.css` - 添加安全区域适配，设置 body 背景色
3. `frontend/src/App.tsx` - 添加防窥模式检查组件
4. `frontend/src/hooks/usePrivacyMode.ts` - 优化状态恢复逻辑
5. `frontend/vite.config.ts` - 更新 PWA manifest 配置，主题色改为 #F9FAFB

## 测试建议

1. 在 iOS Safari 中添加到主屏幕，检查顶部颜色是否与应用背景一致
2. 进入防窥模式后，尝试刷新页面、关闭应用重新打开，确认是否仍然锁定
3. 在不同设备上测试安全区域适配（刘海屏、底部指示器）
4. 检查 PWA 启动画面的背景色是否与应用一致
