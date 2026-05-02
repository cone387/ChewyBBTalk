# 认证（auth）

> 描述用户注册、登录、JWT 颁发与刷新、登出、删除账户等认证能力。

## Purpose

本系统采用 User / Identity 分离的认证模型：User 持有用户资料，Identity 表示一种登录方式，一个 User 可绑定多个 Identity。当前实现以「密码」类型 Identity 为主，为后续 OAuth / 微信 / 邮箱验证码扩展预留接口。

## Requirements

### Requirement: 用户注册
系统 SHALL 提供 `POST /api/v1/bbtalk/auth/register/` 接口，接受 `username` + `password`（可选 `email`、`display_name`），创建 User + 密码 Identity，并直接返回 JWT token 对。

#### Scenario: 成功注册
- **WHEN** 提交合法的 `{ username, password }`
- **THEN** 系统创建 User 与 password Identity，返回 `{ access, refresh, user }`，HTTP 201

#### Scenario: 用户名冲突
- **WHEN** username 已存在
- **THEN** 系统返回 400，提示「用户名已被占用」

#### Scenario: 弱密码拒绝
- **WHEN** password 长度 < 6 或不满足强度规则
- **THEN** 系统返回 400 与具体原因

### Requirement: 密码登录
系统 SHALL 提供 `POST /api/v1/bbtalk/auth/token/` 接口，接受 `username` + `password`，验证成功后返回 JWT token 对。

#### Scenario: 登录成功
- **WHEN** 用户名密码正确
- **THEN** 返回 `{ access, refresh }`，并更新 User.last_login

#### Scenario: 登录失败
- **WHEN** 用户名不存在或密码错误
- **THEN** 返回 401，错误信息保持模糊（不暴露是用户名错还是密码错）

### Requirement: Token 刷新
系统 SHALL 提供 `POST /api/v1/bbtalk/auth/token/refresh/`，使用未过期的 refresh token 换取新的 access token。

#### Scenario: 刷新成功
- **WHEN** 提交有效 refresh token
- **THEN** 返回新的 access token

#### Scenario: refresh 已过期或在黑名单
- **WHEN** 提交无效 refresh token
- **THEN** 返回 401

### Requirement: 登出（黑名单）
系统 SHALL 提供 `POST /api/v1/bbtalk/auth/token/blacklist/`，将 refresh token 加入黑名单使其失效。

#### Scenario: 客户端登出
- **WHEN** 用户点击「退出登录」
- **THEN** 客户端调用黑名单接口并清除本地存储的 token

### Requirement: 当前用户信息
系统 SHALL 提供 `GET /api/v1/bbtalk/user/me/`，返回当前已认证用户的资料。

#### Scenario: 获取个人资料
- **WHEN** 已认证用户请求
- **THEN** 返回 `{ id, username, email, display_name, avatar, bio, is_staff, ... }`

### Requirement: 删除账户
系统 SHALL 提供 `POST /api/v1/bbtalk/user/delete-account/`，要求二次密码确认，删除该用户及其所有数据（BBTalk、Tag、Comment、Attachment 元数据、StorageSettings）。

#### Scenario: 密码正确
- **WHEN** 用户提交正确密码
- **THEN** 系统级联删除该用户所有数据并返回 204

#### Scenario: 密码错误
- **WHEN** 用户提交错误密码
- **THEN** 返回 400，提示「密码错误」

### Requirement: 移动端 token 持久化
移动端 SHALL 使用 `expo-secure-store` 保存 access/refresh token，避免明文存储。

#### Scenario: 应用重启后免登录
- **WHEN** 用户上次登录后关闭 App，再次打开
- **THEN** 客户端从 SecureStore 读取 token，自动恢复登录状态（若 token 仍有效）

### Requirement: Identity 扩展接口
系统 SHALL 在 Identity 表中预留 `provider` / `provider_user_id` 字段，便于后续接入 OAuth、微信、邮箱验证码等登录方式而无需修改 User 表。
