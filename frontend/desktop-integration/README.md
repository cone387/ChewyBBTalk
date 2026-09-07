# Electron 窗口与真实后端集成

在根目录执行：

```sh
npm --prefix desktop ci
npm --prefix frontend ci
npm --prefix desktop run build:integration
npm --prefix frontend run test:desktop
```

Linux 无显示环境使用 `xvfb-run -a npm --prefix frontend run test:desktop`。
测试启动隔离临时数据库的 Django、真实 Electron 主进程/IPC/preload/ComposeWindow，以及本地透明代理。
代理在 Django 已提交后丢弃一次发布响应；测试重启完整 Electron 进程、恢复账号、点击原键重试，验证服务端只有一条记录及一份标签。
还验证切换账号后的草稿与提交隔离、旧会话拒绝、恢复前保存新草稿、网络恢复主动核对，以及长恢复面板不遮挡编辑和发布操作。

测试主进程入口只注册实际 compose/auth 模块，使用临时 userData，不加载托盘和全局快捷键。
窗口保持隐藏并关闭后台节流，截图通过 Electron capturePage 获取实际绘制结果；不覆盖用户正在运行的客户端配置。
测试不代替系统托盘、安装包、原生系统权限或真机验收。
