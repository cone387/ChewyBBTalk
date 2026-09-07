# 使用构建镜像部署

自动部署从 CI 的 build job 获取不可变 digest，例如 `ghcr.io/cone387/chewy-bbtalk@sha256:…`，服务器不再执行 `update cn` 重建镜像。

## 自动执行顺序

1. 部署脚本故障回归通过后构建并推送镜像。
2. 部署 job 串行执行；远端确认当前 master 与构建提交一致，过期提交跳过。
3. 从构建提交读取部署脚本，不覆盖服务器工作区、`.env` 或数据文件。
4. 在部署目录取得 `flock` 锁，最多拉取 3 次，镜像可用后才停止旧容器。
5. 旧容器改名为 `chewy-bbtalk-previous`，新容器使用原 `./data:/app/data`、可选 `.env`、4010 端口和 `unless-stopped` 策略启动。
6. 通过容器内 Python 检查 Nginx 首页 200 及 Django 用户 API 的 200/401 JSON 响应。检查通过才删除旧容器并报告成功。

服务器需要 Bash、Docker 兼容 CLI、`flock`（util-linux）、`timeout`（coreutils），以及访问 GitHub 和 GHCR 的网络。镜像目前允许匿名拉取；若仓库权限改变，应先在服务器配置凭据。拉取失败仍然可能发生，但不会停止旧服务。

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

每次拉取默认限制 300 秒，可用 `DEPLOY_PULL_TIMEOUT` 调整；每次容器探测限制 10 秒。流水线在远端使用 25 分钟总时限，早于 SSH action 的 30 分钟观察时限结束，并清理其进程组，防止超时后遗留部署继续切换服务。

2026-09-07 实际排查：run `34089794116` 在 GHCR 镜像层传输阶段超时，压缩镜像约 124.5 MiB；SSH action 超时后远端拉取仍存活。已核对并停止该次遗留部署及子进程，确认锁释放、旧服务首页仍为 200。此记录不代表新版已经部署，后续以新流水线和实际容器检查为准。

后续验证：run `34093149511` 部署成功（提交 a7cbe27）。服务器实际运行摘要 `sha256:884a9acd89746f9bc888c1a968104f8d9f08d91393e3245032781ba5023ffe67` 与流水线一致，2026-09-07 15:07 CST 启动；独立 SSH 检查首页 200、用户 API 401。Web 草稿功能已包含在该版本。

容器切换有短暂服务中断；健康检查代表 Web 和 Django 能响应，不代表所有业务操作、外部存储或数据库恢复演练通过。

## 回归验证

```bash
bash -n scripts/deploy-image.sh
bash -n deploy.sh
python3 -m unittest discover -s scripts/tests -v
```

测试以假的容器 CLI 执行真实脚本，覆盖首次部署、旧名称迁移、拉取失败/重试、镜像预检失败、启动/健康失败、残留容器、锁冲突和配置错误。Windows 可将 `BASH_BIN` 指向 Git Bash；真实镜像与服务器验证以 Actions 结果为准。

2026-09-07 后续备份版本：3ae91b5 的构建成功，但部署发现旧 conmon 继承了锁句柄。80bce0f 关闭容器命令继承的 fd 9 并在退出时解锁；10 项脚本测试通过。确认只有旧 conmon 持锁后归档旧锁文件，服务保持运行。部署 34095949418 成功，运行镜像 `ghcr.io/cone387/chewy-bbtalk@sha256:993a34ccfcf675e8201f64daee94c4aa64d3fce64fe168c41bf40fc9eaad71fa`，独立检查 Web 200/API 401，且 `flock -n .deploy-image.lock true` 成功。

最终搜索版本 `64c6b8e`：部署 run 34097343536 成功，镜像 `ghcr.io/cone387/chewy-bbtalk@sha256:3d516bc091b0c33abcb979f38acebe241af1d6dfb9e7884d0957379fb80ea7b2`。独立服务器检查确认运行摘要一致、Web 200、用户/备份接口未登录均 401、部署锁可用。CI run 34097343528 全部成功。后续验收文档提交不变更运行代码。
