# 使用构建镜像部署

推送到 `master/main` 只构建和推送镜像，不通过 SSH 更新生产容器。生产部署需在 Actions 的
`Build and Push Docker Images` 工作流手动运行，选择 `master` 并勾选 `deploy_production`。
默认不勾选。执行前必须完成下文的历史数据保护步骤。

部署从 CI 的 build job 获取不可变 digest，例如 `ghcr.io/cone387/chewy-bbtalk@sha256:…`，服务器不再执行 `update cn` 重建镜像。

## 保留服务器历史数据升级

本次升级到 `0004_native_credentials`，包含 `0003_native_schema` 的结构接管，是保留业务数据的升级，不是新建空库，也不使用开发机数据库覆盖服务器。
账号、密码凭据、记录正文、标签、评论、原 ID、时间、附件引用、存储配置和令牌状态均保留。
七张旧框架表的行归档到 `cb_migration_archive` 后移除原表；这是历史审计/元数据归档，不是删除用户内容。
API 3.0.0 改为原生 HTTP、分页与认证契约，三端必须同步升级；所有旧 JWT、刷新令牌、Cookie 与管理后台会话都需要重新登录。原密码由迁移转换存储编码，仍可用于登录。

1. **核对生产实例。** 记录运行容器、不可变旧镜像 ID/digest、实际数据库类型/位置，以及全部挂载。
   单容器使用 `HOST_DATA_DIR` 挂载 `/app/data`；核对服务器现有 `.env` 的 `DATABASE_URL`、`DATA_DIR`、
   `MEDIA_ROOT` 和 `SECRET_KEY`，保持其原值。数据未挂载到宿主机时，先完整备份容器内数据。
   不套用开发机的 `backend/var/` 路径，不清空、重建或换挂载卷。
2. **停写并做完整备份。** 停止旧后端、所有 worker、定时写入任务及自动更新器；备份数据库、全部本地附件、
   数据目录、根 `.env` 和密钥文件，另存到部署数据目录之外并限制访问。S3 对象也须有可恢复的快照/版本备份。
   SQLite 使用 backup API 或在所有连接正常关闭后备份整组数据库文件；不能在有写入时仅复制 `.sqlite3` 主文件。
   PostgreSQL/MySQL 使用相应数据库的完整备份工具并验证可恢复。保留旧镜像，不能只依赖旧容器。
   `scripts/backup-host.sh` 的账号 ZIP 导出不包含完整认证/存储密钥等信息，**不能替代升级前全库备份**。
3. **用服务器备份副本试迁移。** 新版本连接独立副本/独立数据目录，执行 `python -m cli migrate`
   （Compose 环境使用 `uv run --frozen --no-dev python -m cli migrate`）。不要启动完整容器默认入口来试验真实数据：
   默认入口会自动执行迁移和初始化。副本不得连接生产数据库或启动对生产 S3 的写操作。
   迁移会在切换原表前比对业务内容摘要；异常数据、未知扩展或内容变化会拒绝升级。
   核验账号、记录/标签/评论数量及内容、时间、附件打开、原密码登录和撤销令牌状态。
4. **正式切换。** 副本验证通过后，在停写窗口保持原数据挂载及密钥，部署已验证的新版本。
   Actions 手动部署会重新构建所选提交，因此须核对其源码版本与验证版本一致；需要固定已验证镜像时，
   在服务器使用下文的明确 digest 命令。新容器启动会执行正式迁移，随后核验业务内容再恢复写入。
5. **失败保留现场。** 不删库、不删卷、不执行 `docker compose down -v`，不把已迁移数据库交给旧代码。
   MySQL 的 DDL 无法整体回滚；出现 `_native_v3_`/`_previous_v3_` 表时停止重试并核查。
   回退须恢复升级前完整数据库及配套文件，再使用旧镜像。恢复前保留失败现场；开放写入后若有新数据，
   须先另行保全，不能直接用旧备份覆盖。

`scripts/deploy-image.sh` **不会自动创建上述完整备份或验证历史数据**，其健康检查只证明 HTTP 服务可响应。
务必先完成备份和副本验证，再手动启动生产部署。具体迁移能力与数据库版本要求见
[后端升级说明](../backend/README.md#已有实例升级)，本次验证范围见[整改报告](native-contract-cleanup.md)，早期结构迁移证据保留在[历史报告](native-backend-cleanup.md)。

## 手动触发后的执行顺序

1. 部署脚本故障回归通过后构建并推送镜像。
2. 部署 job 串行执行；远端确认当前 master 与构建提交一致，过期提交跳过。
3. 从构建提交读取部署脚本，不覆盖服务器工作区、`.env` 或数据文件。
4. 在部署目录取得 `flock` 锁，最多拉取 3 次，镜像可用后才停止旧容器。
5. 旧容器改名为 `chewy-bbtalk-previous`，新容器读取部署目录 `.env`，使用 `HOST_DATA_DIR`（默认 `./data`）挂载 `/app/data`，以 `PORT`（默认 4010）映射内部 4010 端口，采用 `unless-stopped` 策略启动。
6. 通过容器内 Python 检查 Nginx 首页 200 及 FastAPI 用户 API 的 200/401 JSON 响应。检查通过才删除旧容器并报告成功。

服务器需要 Bash、Docker 兼容 CLI、`flock`（util-linux）、`timeout`（coreutils），以及访问 GitHub 和 GHCR 的网络。镜像目前允许匿名拉取；若仓库权限改变，应先在服务器配置凭据。拉取失败仍然可能发生，但不会停止旧服务。

前后端统一使用部署目录 `.env`。预构建镜像通过后端 `/api/public-config` 输出明确列出的前端公开配置，站点信息、API 地址和防窥默认值均可在容器重建后生效，无需重新编译前端。构建不复制 `.env` 或后端密钥。只有 `VITE_BASE_PATH` 等构建路径选项需要源码构建，详见[统一配置说明](configuration.md)。

## 手动更新

在已更新代码的部署目录执行：

```bash
./deploy.sh pull
# 或明确指定从 Actions 取得的完整镜像 digest
bash scripts/deploy-image.sh ghcr.io/cone387/chewy-bbtalk@sha256:<完整64位摘要>
```

`./deploy.sh update cn` 保留为手动源码构建方式，工作流部署不再使用。工作流不会移动服务器 Git 工作区 HEAD；如需手动使用最新脚本，应先更新工作区。

## 失败处理

- 拉取或预检失败：旧容器保持原状态，修复网络/配置后重试。
- 新容器启动或检查失败：流水线非零退出，旧容器以 `chewy-bbtalk-previous` 保留，新容器现场也保留。查看 `docker logs chewy-bbtalk` 及迁移日志，确认数据库兼容性或恢复备份后再决定恢复旧容器。不要未经检查自动回滚。
- 检测到 `chewy-bbtalk-previous`，或两个旧名称 `chewy-bbtalk`、`chewybbtalk` 同时存在时，脚本在切换前失败，要求先处理上次部署现场。不要直接删除保留容器来绕过排查。
- 若尚无旧容器，首次安装失败自然没有可恢复的 previous 容器。

检查默认尝试 60 次、间隔 2 秒，每个 HTTP 请求另有 3 秒超时。可用 `DEPLOY_HEALTH_ATTEMPTS`、`DEPLOY_HEALTH_INTERVAL` 调整较慢服务器的等待；`DEPLOY_PULL_ATTEMPTS`、`DEPLOY_RETRY_DELAY` 调整拉取重试。部署锁文件 `.deploy-image.lock` 保留在目录内，锁在进程退出时释放，不要在部署中删除文件。

每次拉取默认限制 300 秒，可用 `DEPLOY_PULL_TIMEOUT` 调整；每次容器探测限制 10 秒。流水线在远端使用 25 分钟总时限，早于 SSH action 的 30 分钟观察时限结束，并清理其进程组，防止超时后遗留部署继续切换服务。

2026-09-07 实际排查：run `34089794116` 在 GHCR 镜像层传输阶段超时，压缩镜像约 124.5 MiB；SSH action 超时后远端拉取仍存活。已核对并停止该次遗留部署及子进程，确认锁释放、旧服务首页仍为 200。此记录不代表新版已经部署，后续以新流水线和实际容器检查为准。

后续验证：run `34093149511` 部署成功（提交 a7cbe27）。服务器实际运行摘要 `sha256:884a9acd89746f9bc888c1a968104f8d9f08d91393e3245032781ba5023ffe67` 与流水线一致，2026-09-07 15:07 CST 启动；独立 SSH 检查首页 200、用户 API 401。Web 草稿功能已包含在该版本。

容器切换有短暂服务中断；健康检查代表 Web 和 FastAPI 能响应，不代表所有业务操作、外部存储或数据库恢复演练通过。

## 回归验证

```bash
bash -n scripts/deploy-image.sh
bash -n deploy.sh
uv run --project backend --frozen python -m unittest discover -s scripts/tests -v
```

测试以假的容器 CLI 执行真实脚本，覆盖首次部署、旧名称迁移、拉取失败/重试、镜像预检失败、启动/健康失败、残留容器、锁冲突和配置错误。Windows 可将 `BASH_BIN` 指向 Git Bash；真实镜像与服务器验证以 Actions 结果为准。

2026-09-07 后续备份版本：3ae91b5 的构建成功，但部署发现旧 conmon 继承了锁句柄。80bce0f 关闭容器命令继承的 fd 9 并在退出时解锁；10 项脚本测试通过。确认只有旧 conmon 持锁后归档旧锁文件，服务保持运行。部署 34095949418 成功，运行镜像 `ghcr.io/cone387/chewy-bbtalk@sha256:993a34ccfcf675e8201f64daee94c4aa64d3fce64fe168c41bf40fc9eaad71fa`，独立检查 Web 200/API 401，且 `flock -n .deploy-image.lock true` 成功。

最终搜索版本 `64c6b8e`：部署 run 34097343536 成功，镜像 `ghcr.io/cone387/chewy-bbtalk@sha256:3d516bc091b0c33abcb979f38acebe241af1d6dfb9e7884d0957379fb80ea7b2`。独立服务器检查确认运行摘要一致、Web 200、用户/备份接口未登录均 401、部署锁可用。CI run 34097343528 全部成功。后续验收文档提交不变更运行代码。

### PostgreSQL 旧库保留式切换

`Back up and migrate PostgreSQL through a verified copy` 工作流用于历史数据库通过独立副本升级到 `0004_native_credentials`（含旧框架结构接管）。它只接受固定镜像摘要，在服务器本地保存密钥，不会把数据库、配置或文件上传到 GitHub。当前工具支持 PostgreSQL 16、单个 `chewy-bbtalk` 写入容器、`/app/data` 绑定挂载及 `/app/data/media` 媒体目录；其他布局会拒绝执行，须先单独评估。

1. 使用 `rehearse` 和唯一 `run_id`，在线备份并恢复到独立新库，比较全部表内容摘要，然后迁移副本。候选服务只绑定 `127.0.0.1:4011`，读取接口验证完成即停止。生产容器保持运行。
2. 演练通过后，使用另一个唯一 `run_id` 执行 `cutover`。预检和拉取镜像在停服前完成；随后停止旧容器、检查其他数据库连接、重新生成最终备份并重复全部恢复和迁移验证。
3. 验证通过才更新部署根 `.env` 中的数据库与文件挂载路径，并启动正式容器。启动过程不执行管理员/demo 初始化。原数据库、原 `data/`、旧镜像和 `chewy-bbtalk-legacy-<run_id>` 容器均保留。

备份位于部署目录上一级的 `migration-backups/<run_id>/`（权限 0700），包括 `database.dump`、`data.tar.gz`、原 `.env`、容器配置、文件 SHA-256 清单、恢复/迁移校验报告。配置和诊断文件可能含敏感信息，不应上传到公开日志或提交 Git。新服务的数据目录为同级 `chewy-bbtalk-data-<run_id>/`，由根 `.env` 的 `HOST_DATA_DIR` 管理。

正式发布前失败会恢复旧容器，旧数据库从未被修改。发布后可能已产生新写入，工具不会自动切回旧库：必须先停写、保存新库并核对新增记录。若主机断电或进程被强制终止，应检查容器状态与备份中的 `CUTOVER_COMPLETE`，不能直接重跑相同 `run_id`。不要删除原库、旧容器或备份来腾空间。

文件归档覆盖实际挂载目录；S3 对象不在该本地归档中，数据库引用和访问配置会保留。若使用 S3，需要单独保留桶版本/对象备份，并验证访问，不能将数据库备份当作远端对象备份。

服务器访问 GHCR/Docker Hub 超时时，可先手动执行 `Stage public migration images through SSH`：GitHub runner 下载固定摘要的公开镜像，通过既有 SSH 通道传送到 `.tmp/migration-images/<run_id>/`，校验归档及加载后的镜像内容 ID，再生成 `READY`。之后迁移工作流填写 `staged_images_run_id`，将跳过服务器联网拉取，使用通过内容 ID 校验的本地镜像；仍须填写原始不可变 `image` 摘要。中转不包含任何生产数据、配置或密钥。

迁移前会只读记录原服务器每个附件的可用性，保存 `attachment-baseline.json`。候选服务必须保持完全相同的历史缺失 ID 集合；任何新增缺失都会拒绝切换，现存本地文件仍逐个下载并核对 SHA-256。历史已缺失的文件不会被标记为已恢复，也不会删除其数据库记录。`stop-rehearsal` 仅停止名称、数据库、挂载路径及私有端口均匹配指定已验证演练的候选容器，保留其数据库、文件和备份。

### 2026-10-12 历史生产迁移记录

以下保留当时事实与验证证据，不代表 API 3.0 或 0004 已部署。

2026-10-12 17:32:58（北京时间）完成正式切换。[完整演练](https://github.com/cone387/ChewyBBTalk/actions/runs/38230084838)、[正式迁移](https://github.com/cone387/ChewyBBTalk/actions/runs/38230325180)及[独立验收](https://github.com/cone387/ChewyBBTalk/actions/runs/38230668197)均成功。停写窗口约 2 分钟；候选容器及正式容器均完成认证读取和附件下载检查。[备份复核](https://github.com/cone387/ChewyBBTalk/actions/runs/38230891912)再次确认最终备份的 4 项摘要一致。

- 应用提交：`83f667b666e7141ff3c39a2b66532cad6277eadd`；固定镜像摘要：`sha256:e03b88d4306ab94bab2ebae9b3f53f5816b7080e29330040045fdbc366a8b3c5`。后续提交仅涉及运维、文档和测试。
- 当前数据库：`chewy_bbtalk_native_f20261012_0931`，迁移版本 `0003_native_schema`；文件目录：`/home/bzl/projects/chewy-bbtalk-data-f20261012_0931`，部署根 `.env` 已更新数据库和 `HOST_DATA_DIR`。
- 最终完整备份：`/home/bzl/projects/migration-backups/f20261012_0931/`，内含数据库、205 个挂载目录文件的归档、配置、密钥及校验清单；目录权限 0700。数据库备份 SHA-256：`915365f556e2c0b7912524fd963521266e22adb80e1954576d9045beb85fea5f`；文件归档 SHA-256：`e37d56d2d7fb0a4f99cef0ab9263697f08a1d57c7c79624e1a3a77d3f3fe2dc0`。
- 原库 `chewy_bbtalk`、原 `/home/bzl/projects/ChewyBBTalk/data` 及旧容器 `chewy-bbtalk-legacy-f20261012_0931` 均保留。旧容器已停止，新服务运行中；没有将开发机数据库上传到服务器。
- 业务全量内容摘要一致：447 条记录、22 个标签、59 条标签关联、4 个账号、4 个身份、4 条评论、89 条附件记录、36 条提交回执、1 条桌面授权、2100 条刷新令牌和 2008 条撤销令牌。15 张表的结构、11 个序列通过验证；旧框架 126 行元数据保存在迁移归档中。
- **附件历史缺失仍存在：**39 个现存附件逐个下载并校验 SHA-256；另 50 个文件在迁移前已经缺失，旧服务的 50 次实际读取也均返回 404。搜索旧容器及主机历史目录未发现副本。全部 89 条附件记录均保留，迁移没有新增缺失，但不能把那 50 个文件计为已恢复；恢复它们需要旧服务器、磁盘或附件备份的原文件。
- 独立验收确认：新容器未安装 Django、无 `manage.py`，数据库使用原生表；健康接口和 OpenAPI 返回 200，未登录用户接口返回 401。4 个账号的认证读取均通过，未执行管理员/demo 初始化。

正式服务已开放写入。后续若需回退，先保存新数据库和附件，再核对迁移后新增的数据；不能直接启动旧容器覆盖当前服务。所有备份目前保存在同一服务器，尚未建立异地副本。

### 2026-10-13 原生契约生产切换

2026-10-13 10:59:07（北京时间）完成 API 3.0 与 `0004_native_credentials` 的正式切换，停写及验收窗口约两分钟。用户明确授权提交、推送、SSH 部署和保留数据的迁移。本机没有 `coneban` SSH 别名，实际使用仓库已有的生产 SSH 工作流完成操作。

- 固定运行镜像：`ghcr.io/cone387/chewy-bbtalk@sha256:2331f7675dc89aaae420d78891f40f0caa66605609dd43abf661786883e32a22`，运行内容 ID 为 `6b3b02ea27f723b7dca54f1e574228a0720bd8162ab17dd8ebf35cfe987ac503`，源提交 `ea7bc1f9458f6905558d4a42e951f55169e640dc`。[镜像构建](https://github.com/cone387/ChewyBBTalk/actions/runs/38338156651)和[SSH 传输及身份校验](https://github.com/cone387/ChewyBBTalk/actions/runs/38338327227)通过。后续 `3d8f94b` 只增加后端验证用例和整改记录，已用 Git 差异检查确认所有运行代码及运维脚本与该镜像源提交一致。
- [在线副本演练](https://github.com/cone387/ChewyBBTalk/actions/runs/38338528306)、[停写后的正式备份与切换](https://github.com/cone387/ChewyBBTalk/actions/runs/38339324593)、[独立上线复核](https://github.com/cone387/ChewyBBTalk/actions/runs/38339558830)均成功。正式切换重新备份最新数据，没有复用在线演练时的数据库快照。
- 当前库：`chewy_bbtalk_native_f20261013_0258`，迁移版本 `0004_native_credentials`；文件目录：`/home/bzl/projects/chewy-bbtalk-data-f20261013_0258`。部署根 `.env` 已更新当前库和文件挂载，原有效密钥保留；没有运行管理员或演示数据初始化，也没有上传开发机数据库。
- 最终完整备份：`/home/bzl/projects/migration-backups/f20261013_0258/`，权限 0700，含数据库、205 个挂载目录文件、根配置、密钥及容器配置。数据库备份 SHA-256：`a82ae01d9077872961e0763f2be646076edd8cbb38708678f7ac3f3206698ad7`；文件归档 SHA-256：`e37d56d2d7fb0a4f99cef0ab9263697f08a1d57c7c79624e1a3a77d3f3fe2dc0`。备份已恢复到独立库并逐表验证；独立巡检再次核对四项备份摘要。
- 原库 `chewy_bbtalk_native_f20261012_0931`、原文件目录 `/home/bzl/projects/chewy-bbtalk-data-f20261012_0931` 和旧容器 `chewy-bbtalk-legacy-f20261013_0258` 全部保留；更早的备份和历史实例同样保留。旧容器已停止。
- 15 张业务表结构、11 个序列及全量内容摘要通过核验。正式切换保留 **448 条记录、22 个标签、59 条标签关联、4 个账号、4 个身份、4 条评论、89 条附件记录、37 条提交回执、1 条桌面授权、2121 条刷新令牌、2028 条撤销令牌**，另有 126 行历史迁移归档。演练时为 447 条记录和 36 条回执，正式切换前新增的一条记录及回执已被最终备份和新库纳入。
- 候选服务与正式服务均完成 4 个账号的认证读取、89 条附件元数据读取和 39 个现存附件的逐个下载 SHA-256 核验。历史已缺失的 50 个附件保持完全相同的缺失 ID 集合，没有新增缺失；全部附件记录仍保留。
- 独立巡检确认运行镜像内容 ID 匹配、`/healthz` 和 `/openapi.json` 返回 200、未登录用户接口返回 401；新容器未安装 Django，数据库版本为 `0004`。
- [最终 CI](https://github.com/cone387/ChewyBBTalk/actions/runs/38339207137)的八个任务全部通过：后端 259 项测试及覆盖率门禁、PostgreSQL/MySQL、移动端、桌面端、代理及目录检查；浏览器 124 项通过、16 项按配置跳过，真实 Electron 联调 8 项通过。

原密码不变，用户需要重新登录；已安装的旧桌面端和移动端需要更新到采用新契约的版本。此次服务器部署同时更新后端和 Web，不会远程替换用户设备上的客户端。

新服务已恢复写入。若需回退，应先保存新库和新附件、核对新增数据后再恢复完整备份；不能直接启动旧容器或用旧快照覆盖当前库。备份仍位于同一服务器，尚无异地副本。

### 2026-10-13 附件恢复与滚动修复

后续核对确认本机 SSH 别名 `cone` 指向同一生产服务器。通过 `pve-ubuntu` 在旧实例的数据目录找到 49 个缺失附件，完整存储路径和大小均匹配；按 SHA-256 校验后补回，共 71,353,271 字节。原 39 个文件和数据库元数据未变，现有 88 / 89 个附件可下载。剩余一个附件仅有待用户确认的候选图片，未擅自替换。恢复归档和清单位于 `/home/bzl/projects/attachment-recovery/r20261013_missing50/`。

12:14:38（北京时间）启动滚动修复版本 `a869f23`。卡片操作回调保持稳定，避免滚动及分页重复解析已有 Markdown；单图展示保留固定高度并异步解码，消除实测 288px 的加载高度变化。

- [镜像构建](https://github.com/cone387/ChewyBBTalk/actions/runs/38344523679)、[传输校验](https://github.com/cone387/ChewyBBTalk/actions/runs/38344760712)与[完整 CI](https://github.com/cone387/ChewyBBTalk/actions/runs/38344523615)全部通过：前端 613 项测试，浏览器 126 项通过、16 项按配置跳过，Electron 8 项通过。上线后针对真实生产前端的桌面、小屏图片高度回归均通过；测试拦截公开列表返回合成记录，没有写入生产数据库。
- 运行镜像：`ghcr.io/cone387/chewy-bbtalk@sha256:356cdaf15b2975c8bd3e183c9a8c91440014ea7d6c51b90697cd6120139199d4`；内容 ID：`b100ff73cf3bc25942aa52ec8839b05c8399b8f22807be9b21d88868ef4b4ac9`。
- 72 个后端和启动配置文件与原运行容器的摘要完全一致。沿用当前数据库和文件挂载，使用不执行迁移或初始化的既有启动命令。候选容器以只读数据库会话验证后停止，正式切换完成 4 用户、89 附件元数据及 88 文件下载验证。
- 切换前停写备份位于 `/home/bzl/projects/frontend-deployments/a869f23/`，包含 PostgreSQL dump、恢复附件后的完整文件归档、校验清单和受限配置；254 个原有数据文件切换后摘要未变。旧容器 `chewy-bbtalk-before-scroll-a869f23` 已停止并保留，候选容器也已停止。

### 2026-10-15 液态玻璃版本重新部署

源码 `abe4f12ccb56e5ed19d95cd0b037b5c738306128` 已推送 master，14:11:32（北京时间）切换生产容器。此次变更集中在移动客户端；镜像内 72 个后端和启动配置文件与原运行版本摘要一致，沿用原启动命令，没有执行数据库迁移或初始化。

- [构建与首次部署](https://github.com/cone387/ChewyBBTalk/actions/runs/38689898563)的测试及镜像构建通过，生产服务器直接拉取 GHCR 超时；确认旧服务仍运行后停止该任务并释放锁，随后通过[已有 SSH 传输工作流](https://github.com/cone387/ChewyBBTalk/actions/runs/38690587498)完成镜像传输和身份校验。
- 镜像摘要 `sha256:0b3272e9d9b3f2d0b9927f138fc731be569a02947762fd235848e15d933e6b63`；实际运行内容 ID `0e5799c547d4de5cfb3eb21471a6b736b5222a9754abe7b86c78cde0d9be1a47`。复用上次已验证的保留数据部署脚本，固定此次源码、镜像与旧镜像身份。
- 切换前停写备份位于 `/home/bzl/projects/frontend-deployments/abe4f12/`，含 PostgreSQL dump、完整数据文件归档、摘要、受限配置与部署脚本。保留旧容器 `chewy-bbtalk-before-scroll-abe4f12`；原数据库、密钥和 `/home/bzl/projects/chewy-bbtalk-data-f20261013_0258` 挂载不变。
- 候选与正式服务均通过 4 个账号读取、90 条附件元数据和 89 个本地文件下载校验；原有 1 个缺失附件没有增加。255 个原有数据文件切换后摘要一致。独立复核 Web / healthz 为 200、未登录用户 API 为 401，部署锁可正常取得。
- [CI](https://github.com/cone387/ChewyBBTalk/actions/runs/38689882851)其他七个任务通过；移动端 1423 项单测通过，但既有覆盖率门槛未通过，不能称 CI 全绿。移动端安装包和 TestFlight 结果见[发布记录](../mobile/RELEASE_READINESS.md)。
