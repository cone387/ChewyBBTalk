#!/usr/bin/env bash
# Run from the deployment directory containing .env and data/.
set -euo pipefail

image="${1:-ghcr.io/cone387/chewy-bbtalk:latest}"
container=chewy-bbtalk
previous=chewy-bbtalk-previous
pull_attempts="${DEPLOY_PULL_ATTEMPTS:-3}"
health_attempts="${DEPLOY_HEALTH_ATTEMPTS:-60}"
retry_delay="${DEPLOY_RETRY_DELAY:-5}"
health_interval="${DEPLOY_HEALTH_INTERVAL:-2}"

fail() { printf '[ERROR] %s\n' "$*" >&2; exit 1; }
[[ "$image" =~ ^ghcr\.io/cone387/chewy-bbtalk(:[A-Za-z0-9_.-]+|@sha256:[a-f0-9]{64})$ ]] || fail '无效的镜像引用'
[[ "$pull_attempts" =~ ^[1-9][0-9]*$ && "$health_attempts" =~ ^[1-9][0-9]*$ ]] || fail '检查次数必须为正整数'
[[ "$retry_delay" =~ ^[0-9]+$ && "$health_interval" =~ ^[0-9]+$ ]] || fail '等待时间必须为非负整数'
command -v docker >/dev/null || fail '需要 Docker 兼容命令'
command -v flock >/dev/null || fail '需要 flock（util-linux）'
exec 9>.deploy-image.lock
flock -n 9 || fail '已有部署正在执行'

exists() { docker container inspect "$1" >/dev/null 2>&1; }
exists "$previous" && fail "存在 $previous，请先检查上次失败部署并处理保留容器"
old=''
for name in "$container" chewybbtalk; do
  if exists "$name"; then
    [[ -z "$old" ]] || fail '两个旧容器名称同时存在，请先确认正在使用的服务'
    old="$name"
  fi
done

env_args=()
if [[ -e .env ]]; then
  [[ -f .env && -r .env ]] || fail '.env 不是可读文件'
  env_args=(--env-file .env)
fi
[[ ! -e data || -d data ]] || fail 'data 必须为目录'
mkdir -p data

printf '[INFO] 拉取镜像 %s\n' "$image"
pulled=false
for ((attempt=1; attempt<=pull_attempts; attempt++)); do
  if docker pull "$image"; then pulled=true; break; fi
  if ((attempt < pull_attempts)); then sleep "$retry_delay"; fi
done
[[ "$pulled" == true ]] || fail '镜像拉取失败，旧容器未变更'
docker image inspect "$image" >/dev/null || fail '镜像预检失败，旧容器未变更'

if [[ -n "$old" ]]; then
  printf '[INFO] 保留旧容器为 %s\n' "$previous"
  docker stop "$old"
  docker rename "$old" "$previous"
fi

if ! docker run -d --name "$container" --restart unless-stopped \
  -p 4010:4010 "${env_args[@]}" -v "$(pwd)/data:/app/data" "$image"; then
  fail "新容器启动失败；旧容器保留为 $previous，请检查后人工恢复"
fi

# Probe Nginx and Django through the same container-facing HTTP path.
probe='import json, urllib.request, urllib.error
with urllib.request.urlopen("http://127.0.0.1:4010/", timeout=3) as response:
    assert response.status == 200
try:
    response = urllib.request.urlopen("http://127.0.0.1:4010/api/v1/bbtalk/user/me/", timeout=3)
except urllib.error.HTTPError as error:
    response = error
with response:
    assert response.status in (200, 401)
    assert isinstance(json.load(response), dict)
'
healthy=false
for ((attempt=1; attempt<=health_attempts; attempt++)); do
  if docker exec "$container" python -c "$probe" >/dev/null 2>&1; then healthy=true; break; fi
  if ((attempt < health_attempts)); then sleep "$health_interval"; fi
done
[[ "$healthy" == true ]] || fail "新容器启动检查失败；保留 $previous 与新容器现场，请检查日志和数据库迁移后人工恢复"

if [[ -n "$old" ]]; then docker rm "$previous"; fi
printf '[INFO] 部署检查通过：%s\n' "$image"
