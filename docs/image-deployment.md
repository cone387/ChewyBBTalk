# 使用构建镜像部署

自动部署从 CI 的 build job 获取不可变 digest，例如 `ghcr.io/cone387/chewy-bbtalk@sha256:…`，服务器不再执行 `update cn` 重建镜像。

## 自动执行顺序

1. 部署脚本故障回归通过后构建并推送镜像。
2. 部署 job 串行执行；远端确认当前 master 与构建提交一致，过期提交跳过。
3. 从构建提交读取部署脚本，不覆盖服务器工作区、`.env` 或数据文件。
4. 在部署目录取得 `flock` 锁，最多拉取 3 次，镜像可用后才停止旧容器。
5. 旧容器改名为 `chewy-bbtalk-previous`，新容器使用原 `./data:/app/data`、可选 `.env`、4010 端口和 `unless-stopped` 策略启动。
6. 通过容器内 Python 检查 Nginx 首页 200 及 Django 用户 API 的 200/401 JSON 响应。检查通过才删除旧容器并报告成功。

服务器需要 Bash、Docker 兼容 CLI、`flock`（util-linux），以及访问 GitHub 和 GHCR 的网络。镜像目前允许匿名拉取；若仓库权限改变，应先在服务器配置凭据。拉取失败仍然可能发生，但不会停止旧服务。

预构建镜像中的 `VITE_*` 值在构建时确定，服务器 `.env` 仅用于运行时配置。单容器默认同源 API 与根路径部署。需要定制 Web 构建配置时可手动使用源码构建命令，本轮不加入运行时 Vite 配置注入。

## 手动更新

在已更新代码的部署目录执行：

```bash
./deploy.sh pull
# 或明确指定从 Actions 取得的完整镜像 digest
bash scripts/deploy-image.sh ghcr.io/cone387/chewy-bbtalk@sha256:<完整64位摘要>
```

`./deploy.sh update cn` 保留为手动源码构建方式，自动部署不再使用。自动部署不会移动服务器 Git 工作区 HEAD；如需手动使用最新脚本，应先更新工作区。

## 失败处理

- 拉取或预检失败：旧容器保持原状态，修复网络/配置后重试。
- 新容器启动或检查失败：流水线非零退出，旧容器以 `chewy-bbtalk-previous` 保留，新容器现场也保留。查看 `docker logs chewy-bbtalk` 及迁移日志，确认数据库兼容性或恢复备份后再决定恢复旧容器。不要未经检查自动回滚。
- 检测到 `chewy-bbtalk-previous`，或两个旧名称 `chewy-bbtalk`、`chewybbtalk` 同时存在时，脚本在切换前失败，要求先处理上次部署现场。不要直接删除保留容器来绕过排查。
- 若尚无旧容器，首次安装失败自然没有可恢复的 previous 容器。

检查默认尝试 60 次、间隔 2 秒，每个 HTTP 请求另有 3 秒超时。可用 `DEPLOY_HEALTH_ATTEMPTS`、`DEPLOY_HEALTH_INTERVAL` 调整较慢服务器的等待；`DEPLOY_PULL_ATTEMPTS`、`DEPLOY_RETRY_DELAY` 调整拉取重试。部署锁文件 `.deploy-image.lock` 保留在目录内，锁在进程退出时释放，不要在部署中删除文件。

容器切换有短暂服务中断；健康检查代表 Web 和 Django 能响应，不代表所有业务操作、外部存储或数据库恢复演练通过。

## 回归验证

```bash
bash -n scripts/deploy-image.sh
bash -n deploy.sh
python3 -m unittest discover -s scripts/tests -v
```

测试以假的容器 CLI 执行真实脚本，覆盖首次部署、旧名称迁移、拉取失败/重试、镜像预检失败、启动/健康失败、残留容器、锁冲突和配置错误。Windows 可将 `BASH_BIN` 指向 Git Bash；真实镜像与服务器验证以 Actions 结果为准。
