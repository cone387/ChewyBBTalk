#!/bin/bash

###############################################################
#                  ChewyBBTalk 部署管理脚本                      #
#           支持 dev/prod 环境切换，默认 dev                      #
###############################################################

set -e

IMAGE_NAME="chewybbtalk"
CONTAINER_NAME="chewybbtalk"
PORT="4010"

# 默认环境
ENV="dev"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 获取环境配置文件路径
get_env_file() {
    if [ "$ENV" = "prod" ]; then
        echo ".env"
    else
        echo ".env.dev"
    fi
}

# 获取 docker compose 文件
get_compose_file() {
    if [ "$ENV" = "prod" ]; then
        echo "docker-compose.yml"
    else
        echo "docker-compose.dev.yml"
    fi
}

# 检查 Docker 是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi
}

# 检查 .env 文件
check_env() {
    local env_file=$(get_env_file)
    if [ ! -f "$env_file" ]; then
        if [ "$ENV" = "prod" ]; then
            log_warn "$env_file 文件不存在，从 .env.example 复制"
            cp .env.example .env
        else
            log_error "$env_file 文件不存在"
        fi
        log_info "请编辑 $env_file 文件，修改必要的配置项"
        exit 1
    fi
    log_info "使用环境配置: $env_file"
}

# 启动服务
start() {
    check_env
    local env_file=$(get_env_file)
    local compose_file=$(get_compose_file)
    
    log_info "环境: $ENV"
    log_info "使用 docker compose 文件: $compose_file"
    
    # 使用 docker compose 启动
    docker compose -f "$compose_file" --env-file "$env_file" up -d
    
    # 加载环境变量获取端口
    source "$env_file"
    local port=${PORT:-8020}
    
    log_info "服务启动成功！"
    log_info "访问地址: http://127.0.0.1:${port}"
    
    if [ "$ENV" = "dev" ]; then
        log_info ""
        log_info "开发环境请启动本地服务:"
        log_info "  前端: cd frontend && npm run dev"
        log_info "  后端: cd backend/chewy_space && uv run python manage.py runserver 8020"
    fi
}

# 停止服务
stop() {
    local compose_file=$(get_compose_file)
    log_info "停止服务 (环境: $ENV)..."
    docker compose -f "$compose_file" down
    log_info "服务已停止"
}

# 重启服务
restart() {
    local env_file=$(get_env_file)
    local compose_file=$(get_compose_file)
    log_info "重启服务 (环境: $ENV)..."
    docker compose -f "$compose_file" --env-file "$env_file" restart
    log_info "服务重启成功！"
}

# 重新构建
rebuild() {
    local env_file=$(get_env_file)
    local compose_file=$(get_compose_file)
    
    log_info "重新构建 (环境: $ENV)..."
    
    # 停止并删除旧容器
    docker compose -f "$compose_file" down 2>/dev/null || true
    
    # 重新构建并启动
    docker compose -f "$compose_file" --env-file "$env_file" up -d --build
    
    log_info "重新构建完成！"
}

# 查看日志
logs() {
    local compose_file=$(get_compose_file)
    if [ -n "$1" ]; then
        docker compose -f "$compose_file" logs -f "$1"
    else
        docker compose -f "$compose_file" logs -f
    fi
}

# 查看状态
status() {
    local compose_file=$(get_compose_file)
    log_info "环境: $ENV"
    log_info "容器状态:"
    docker compose -f "$compose_file" ps
}

# 进入容器
shell() {
    local compose_file=$(get_compose_file)
    local service=${1:-backend}
    log_info "进入 $service 容器..."
    docker compose -f "$compose_file" exec "$service" /bin/sh
}

# 生成密钥
generate_keys() {
    log_info "生成配置密钥:"
    echo ""
    echo "Django SECRET_KEY:"
    openssl rand -base64 50
    
    echo ""
    log_info "请将以上密钥复制到 .env 文件中"
}

# 显示帮助信息
show_help() {
    cat << EOF
ChewyBBTalk 部署管理脚本

用法: $0 [-e|—env dev|prod] [命令]

环境:
  -e, --env     指定环境 (dev|prod)，默认 dev
                dev:  使用 docker-compose.dev.yml 和 .env.dev
                prod: 使用 docker-compose.yml 和 .env

命令:
  start         启动服务
  stop          停止服务
  restart       重启服务
  rebuild       重新构建并启动
  logs [服务]   查看日志 (可选服务: backend, frontend)
  status        查看容器状态
  shell [服务]  进入容器 shell (可选服务: backend, frontend)
  keys          生成配置密钥
  help          显示此帮助信息

部署方式说明:
  方式1: 宿主机Nginx + docker compose (推荐)
         - docker compose --env-file .env up -d
         - 前端端口: 4010, 后端端口: 8020
         - 需要在宿主机配置 Nginx (参考 nginx.host.example.conf)

  方式2: docker 单容器 (包含 nginx)
         - docker build -t chewybbtalk .
         - docker run -d -p 8021:80 --name chewybbtalk chewybbtalk
         - 所有服务在一个容器中运行

示例:
  $0 start                # 启动开发环境 (dev)
  $0 -e prod start        # 启动生产环境
  $0 --env prod rebuild   # 重新构建生产环境
  $0 logs backend         # 查看 backend 日志
  $0 status               # 查看容器状态

EOF
}

# 主逻辑
main() {
    check_docker
    
    # 解析环境参数
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -e|--env)
                ENV="$2"
                if [[ "$ENV" != "dev" && "$ENV" != "prod" ]]; then
                    log_error "无效的环境: $ENV，可选值: dev, prod"
                    exit 1
                fi
                shift 2
                ;;
            start)
                start
                exit 0
                ;;
            stop)
                stop
                exit 0
                ;;
            restart)
                restart
                exit 0
                ;;
            rebuild)
                rebuild
                exit 0
                ;;
            logs)
                logs "$2"
                exit 0
                ;;
            status)
                status
                exit 0
                ;;
            shell)
                shell "$2"
                exit 0
                ;;
            keys)
                generate_keys
                exit 0
                ;;
            help|--help|-h)
                show_help
                exit 0
                ;;
            "")
                show_help
                exit 0
                ;;
            *)
                log_error "未知命令: $1"
                echo ""
                show_help
                exit 1
                ;;
        esac
    done
    
    show_help
}

main "$@"
