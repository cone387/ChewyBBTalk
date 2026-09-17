## Why

自动部署在 CI 成功构建镜像后仍在服务器重新构建，ChewyAttachment 的 Git 拉取多次因 TLS 中断失败。部署版本与构建产物也未固定关联。

## What Changes

- 自动部署使用本次构建的不可变镜像 digest，移除服务器二次构建。
- 先拉取并验证镜像，再切换容器；失败保留旧容器用于排查和人工恢复。
- 串行部署、跳过过期提交、启动检查和失败退出；保留手动源码构建命令。
- 增加部署脚本故障回归及操作文档。

## Capabilities

### New Capabilities
- `immutable-image-deployment`: 使用已构建镜像的可验证部署流程。

### Modified Capabilities
无。

## Impact

.github/workflows/docker-build.yml、scripts/deploy-image.sh、scripts/tests/test_deploy_image.py、deploy.sh、README.md、docs/image-deployment.md、ROADMAP.md。容器继续使用 4010 端口、现有 .env 和 data 目录，不改变数据库契约。
