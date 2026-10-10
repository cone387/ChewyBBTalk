# 统一环境配置

部署者只维护仓库或部署目录的 `.env`：

```bash
cp .env.example .env
```

根 `.env.example` 是全部支持配置的清单，涵盖端口、数据目录、数据库、账号、认证、CORS、上传大小、邮件恢复、S3、前端公开配置和部署重试。无需创建 `frontend/.env` 或 `backend/.env`；旧前端配置应合并到根文件。

## 读取和生效

| 入口 | 读取方式 | 修改后的操作 |
| --- | --- | --- |
| 本地后端（CLI、Uvicorn、开发脚本） | Python 自动定位根 `.env`，不依赖启动工作目录 | 重启后端 |
| 本地 Vite | `envDir` 指向仓库根目录，配置文件使用 `loadEnv` | 重启 Vite；同时重启后端以更新公开配置 |
| Docker Compose | 自动读取根 `.env`，并将其作为后端 `env_file` | `docker compose up -d --force-recreate` |
| 预构建单容器 | `docker run --env-file .env` 或 `deploy.sh pull` | 重建容器；`docker restart` 不会重新读取 env-file |
| 宿主机定时备份 | `scripts/backup-host.sh` 自动读取部署根 `.env` | 下次执行时生效 |

后端进程环境优先于 `.env`，便于容器和 CI 注入配置。本地 `DATA_DIR`、`MEDIA_ROOT`、`BACKUP_ROOT` 的相对路径按根目录解析；SQLite 的相对文件名仍按 `backend/var/` 解析。直接安装 wheel 时从启动目录读取 `.env`。

需要连端口与宿主挂载路径都只改 `.env` 时，使用 `bash deploy.sh pull` 或 Docker Compose。直接手写 `docker run` 时，`--env-file` 只注入容器环境，宿主 `-p`、`-v` 仍由该命令决定。

为兼容 Docker CLI，统一使用 `KEY=value`；每项独占一行，注释独占一行，值不加外围引号，不使用 `${变量}` 展开。后端和部署脚本不会把 `.env` 当作 shell 脚本执行。含空格的站点名称或密码可以直接填写，密钥不会被部署脚本打印。

## 数据目录

- 本地默认：`backend/var/db.sqlite3`、`backend/var/data/`、`backend/var/media/`。
- Docker 默认：容器内 `/app/data`；宿主机 `HOST_DATA_DIR=./data`。`DATA_DIR` 表示后端内部数据位置，不再用来配置宿主机挂载路径。
- 原来使用 `start_backend.sh` 的 `data/db.sqlite3`、`data/backend/` 和 `data/backend/media/` 时，在根 `.env` 显式填写这些原路径；数据库建议写绝对 URL，避免误开新库。升级不自动迁移部署机器上的业务数据。
- 保留原 `SECRET_KEY` 或 `.secret_key`。留空只在密钥文件不存在时生成新密钥。

## 前端配置与私密配置

上传和导入同时受后端字节数限制与 `NGINX_CLIENT_MAX_BODY_SIZE` 限制。后者默认 `513M`，给默认 512 MiB 导入预留表单开销；支持整数以及 K/M/G 单位。全局 S3 的访问密钥、私钥和桶名同时配置后生效，账号在存储设置中选择的配置优先。

页面先读取 `/api/public-config`，再执行前端应用。接口禁用缓存，并且只公开以下六项：

`VITE_API_BASE_URL`、`VITE_SITE_NAME`、`VITE_SITE_COPYRIGHT`、`VITE_PRIVACY_TIMEOUT_MINUTES`、`VITE_SHOW_PRIVACY_COUNTDOWN`、`VITE_MEDIA_URL_PROTOCOL`。

因此预构建镜像也能使用部署机器的配置，重建容器后刷新页面即可看到更改。前端个人已保存的隐私设置优先于站点默认值。API 地址留空表示同源代理。纯静态前端缺少该接口时保留 Vite 构建值作为回退。

`SECRET_KEY`、数据库凭据、管理员密码和邮件密码仅用于后端，不允许放入 `VITE_*`。Vite 按 `VITE_` 前缀暴露构建变量，见 [Vite 环境配置](https://v5.vite.dev/config/shared-options#envprefix)。镜像构建不复制根 `.env`，后端公开接口也不会枚举整个环境变量。

`VITE_PROXY_TARGET`、`VITE_DEV_PORT` 只控制开发服务器；`VITE_BASE_PATH` 控制构建资源路径，修改它需要重建前端并相应调整代理配置。它们也放在根 `.env`，但不属于浏览器运行时配置。

Compose 的 `env_file` 和 `environment` 按 [Docker 官方优先级](https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/) 生效。Compose 2.24+ 支持本项目使用的可选 `.env` 文件；不提供文件时仍可使用默认配置启动。
