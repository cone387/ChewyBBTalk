# Docker 开机自启动指南

本项目所有容器都配置了 `--restart unless-stopped`（`docker-compose.yml` 和 `deploy.sh` 均已支持），只要满足以下两个条件，容器就会跟随宿主机开机自动启动：

1. Docker 服务本身随系统开机启动。
2. 容器上次不是被用户主动 `docker stop`，而是正在运行或因异常退出。

下面针对不同系统给出具体操作。

## Linux（systemd，最常见）

启用 Docker 服务开机自启：

```bash
sudo systemctl enable docker
sudo systemctl enable containerd
```

验证：

```bash
systemctl is-enabled docker       # 应输出 enabled
systemctl status docker           # 应为 active (running)
```

部署并启动容器（任选其一）：

```bash
# 方式 A：compose（推荐）
docker compose up -d

# 方式 B：单容器脚本
./deploy.sh start

# 方式 C：从远程镜像更新
./deploy.sh pull
```

之后重启机器验证：

```bash
sudo reboot
# 重启后
docker ps
```

容器应自动运行。

## Windows（Docker Desktop）

1. 打开 Docker Desktop。
2. Settings → General → 勾选 `Start Docker Desktop when you log in`。
3. 部署：`docker compose up -d`。

注：Docker Desktop 要求用户登录后才启动。如需真正的无人值守，建议切换到 WSL2 + systemd 方案或使用 Linux 服务器。

## macOS（Docker Desktop）

同 Windows，开启 Docker Desktop 的 `Start on login` 选项，然后 `docker compose up -d`。

## 验证清单

- `docker inspect chewybbtalk-backend --format '{{.HostConfig.RestartPolicy.Name}}'` 返回 `unless-stopped`
- `systemctl is-enabled docker`（Linux）返回 `enabled`
- `reboot` 后 `docker ps` 能看到容器在运行

## 常见坑

- **容器没起来**：先 `docker ps -a` 看上次是不是被 `docker stop` 了。`unless-stopped` 遇到用户主动 stop 就不会再拉起。跑 `docker start <container>` 一次，restart 策略就会重新激活。
- **Docker 服务没自启**：`systemctl is-enabled docker` 显示 `disabled` 就是没设。`sudo systemctl enable --now docker` 一条命令搞定。
- **数据没持久化**：确认挂载的 `./data` 目录存在且可写。项目默认挂到仓库根目录的 `data/`。
