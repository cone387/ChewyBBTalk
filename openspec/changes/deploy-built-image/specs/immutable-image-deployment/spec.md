## ADDED Requirements

### Requirement: 部署固定构建产物
自动部署 SHALL 使用本次构建输出的镜像 digest，不在服务器运行镜像构建。

#### Scenario: 最新构建部署
- **WHEN** master 构建成功且仍是最新提交
- **THEN** 使用该提交脚本部署该构建的 digest

#### Scenario: 过期提交
- **WHEN** 排队构建已不是 master 最新提交
- **THEN** 跳过部署，避免覆盖更新版本

### Requirement: 拉取和切换可靠性
部署 SHALL 在拉取成功前保持旧容器不变，检查新容器后才报告成功。

#### Scenario: 拉取失败
- **WHEN** 镜像多次拉取仍失败
- **THEN** 非零退出且不停止、删除或重命名旧容器

#### Scenario: 启动检查失败
- **WHEN** 新容器启动或健康检查失败
- **THEN** 非零退出，保留旧容器用于人工恢复，不自动进行数据库回滚

#### Scenario: 成功切换
- **WHEN** 新容器的 Web 与后端检查通过
- **THEN** 清理旧容器并报告实际镜像引用，继续挂载原数据目录及配置
