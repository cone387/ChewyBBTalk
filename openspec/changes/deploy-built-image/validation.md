# 验证记录

2026-09-07：真实 Bash 脚本配合 mock 容器 CLI 的 8 项测试通过，覆盖首次部署、旧名称兼容、拉取失败及重试、启动/健康失败、预检/锁冲突和无效配置。脚本语法检查、工作流 YAML 解析与 git diff --check 通过。

匿名 GHCR manifest HEAD 返回 200，确认本地网络可匿名读取现有镜像；不代表服务器网络已验证。已核对当前 ssh-action v1.0.3 支持 envs 参数。

测试没有连接本地 Docker daemon，不会停止用户容器。实际镜像 digest、启动检查及远端环境兼容性将由本次推送触发的部署流水线验证。失败时保留旧容器但不自动回滚数据库，恢复边界见 docs/image-deployment.md。
