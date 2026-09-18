## ADDED Requirements

### Requirement: 系统浏览器授权
桌面 SHALL 打开系统浏览器完成 Web 登录及明确授权，并通过一次性授权码、PKCE 和 state 校验建立独立桌面会话。

#### Scenario: 已登录浏览器授权
- **WHEN** 用户在浏览器确认桌面登录
- **THEN** 桌面获得独立 token，浏览器 URL 不包含 token，授权码不可重复使用

#### Scenario: 错误或过期授权
- **WHEN** state、verifier、回调不匹配或授权过期、用户取消
- **THEN** 不建立会话，桌面显示可理解的结果并释放监听端口

### Requirement: 会话恢复与凭证保护
桌面 MUST 加密持久化 refresh token，区分恢复中、已登录、离线和失效，网络失败保留会话，401 最多刷新重试一次，登出或切服后旧异步结果不得恢复账号。

#### Scenario: 断网启动与唤醒
- **WHEN** 桌面离线启动或休眠后恢复网络
- **THEN** 保留草稿与凭证，显示离线或恢复状态，联网后恢复且不发送过期 token

#### Scenario: 明文凭证迁移
- **WHEN** 启动读取旧明文 refresh token
- **THEN** 使用系统安全存储加密并移除明文；系统不支持时仅在内存保存并提示
