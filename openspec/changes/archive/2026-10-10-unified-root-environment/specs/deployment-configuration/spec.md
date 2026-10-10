## ADDED Requirements

### Requirement: 唯一根配置

系统 SHALL 从根 `.env` 读取前后端部署配置，并仅维护根 `.env.example`。

#### Scenario: 本地和容器使用统一配置
- **WHEN** 部署者修改根文件并重启本地服务或重建容器
- **THEN** 后端、本地前端代理及部署脚本使用对应配置，无需模块级 `.env`
- **AND** 已注入的进程环境优先于后端文件值

### Requirement: 浏览器公开配置隔离

系统 SHALL 只发布明确允许的浏览器配置，并支持预构建镜像的运行时配置。

#### Scenario: 修改站点名称和 API 地址
- **WHEN** 容器读取新的配置后浏览器刷新
- **THEN** 应用初始化前读取新的站点名称和 API 地址
- **AND** 响应禁用缓存且不包含数据库、管理员、邮件或 S3 密钥

### Requirement: 部署与持久化配置

系统 SHALL 区分宿主机挂载路径和服务内路径，并使备份、上传代理限制使用根配置。

#### Scenario: 配置非默认端口与数据目录
- **WHEN** 根文件指定 PORT、HOST_DATA_DIR 和 BACKUP_ROOT
- **THEN** 宿主端口映射到固定容器端口，数据挂载使用指定宿主路径，相对备份路径按配置根目录解析
- **AND** 脚本不执行配置值中的 shell 表达式
