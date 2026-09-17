# 原生界面集成回归

运行 `npm run test:integration`。使用 jest-expo 与 React Native Testing Library 挂载真实 ComposeScreen / HomeScreen，
连接真实 Redux reducers、thunks、API 转换和提交持久化服务。

替换边界：原生硬件/导航事件、AsyncStorage 原生桥和 API HTTP 传输；Home 的卡片、媒体、隐私和批量操作等无关子组件隔离。
验证发布响应失败后重新挂载、原键与完整附件载荷重放、恢复前保存后来输入、持久化失败禁止请求、条件编辑明确确认、账号隔离、前台/网络刷新保留筛选，以及迟到响应不覆盖页面。

此测试补足原来的状态模拟测试，不能代替真机或操作系统进程崩溃验收；服务端并发去重由 Django 测试独立验证。
