#!/bin/bash

###############################################################
#                  ChewyBBTalk 部署脚本                        #
#              单容器部署的启动、停止、重启控制                  #
###############################################################

set -e

PROJECT_NAME="chewybbtalk"
COMPOSE_FILE="docker-compose.yml"

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

# 检查 Docker 是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi
}

# 检查 .env 文件
check_env() {
    if [ ! -f .env ]; then
        log_warn ".env 文件不存在，从 .env.example 复制"
        cp .env.example .env
        log_info "请编辑 .env 文件，修改必要的配置项"
        exit 0
    fi
}

# 启动服务
start() {
    log_info "启动 ${PROJECT_NAME} 服务..."
    docker-compose -f ${COMPOSE_FILE} up -d
    log_info "服务启动成功！"
    log_info "访问地址: http://localhost"
    log_info "Authelia 登录: http://localhost/authelia/"
    log_info "默认账号: admin / password (请立即修改)"
}

# 停止服务
stop() {
    log_info "停止 ${PROJECT_NAME} 服务..."
    docker-compose -f ${COMPOSE_FILE} down
    log_info "服务已停止"
}

# 重启服务
restart() {
    log_info "重启 ${PROJECT_NAME} 服务..."
    docker-compose -f ${COMPOSE_FILE} restart
    log_info "服务重启成功！"
}

# 重新构建
rebuild() {
    log_info "重新构建 ${PROJECT_NAME} 镜像..."
    docker-compose -f ${COMPOSE_FILE} build --no-cache
    log_info "镜像构建完成"
    
    log_info "重新启动服务..."
    docker-compose -f ${COMPOSE_FILE} up -d
    log_info "服务启动成功！"
}

# 查看日志
logs() {
    if [ -z "$1" ]; then
        docker-compose -f ${COMPOSE_FILE} logs -f
    else
        docker-compose -f ${COMPOSE_FILE} logs -f "$1"
    fi
}

# 查看状态
status() {
    log_info "服务状态:"
    docker-compose -f ${COMPOSE_FILE} ps
    
    echo ""
    log_info "健康检查:"
    docker ps --filter "name=${PROJECT_NAME}" --format "table {{.Names}}\t{{.Status}}"
}

# 进入容器
shell() {
    log_info "进入 ${PROJECT_NAME} 容器..."
    docker-compose -f ${COMPOSE_FILE} exec app /bin/bash
}

# 备份数据
backup() {
    BACKUP_DIR="./backups"
    BACKUP_FILE="${BACKUP_DIR}/backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    
    mkdir -p ${BACKUP_DIR}
    
    log_info "备份数据到 ${BACKUP_FILE}..."
    tar -czf ${BACKUP_FILE} \
        ./data/media \
        ./data/db \
        ./data/authelia \
        .env \
        2>/dev/null || true
    
    log_info "备份完成: ${BACKUP_FILE}"
}

# 清理数据
clean() {
    log_warn "警告: 此操作将删除所有数据（数据库、媒体文件、日志等）"
    read -p "确认删除？(yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        log_info "操作已取消"
        exit 0
    fi
    
    log_info "停止服务..."
    docker-compose -f ${COMPOSE_FILE} down -v
    
    log_info "删除数据..."
    rm -rf ./data ./logs
    
    log_info "清理完成"
}

# 生成密钥
generate_keys() {
    log_info "生成配置密钥:"
    echo ""
    echo "Django SECRET_KEY:"
    python3 -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())' 2>/dev/null || \
    openssl rand -base64 50
    
    echo ""
    echo "Authelia Session Secret (至少32个字符):"
    openssl rand -base64 32
    
    echo ""
    echo "Authelia Encryption Key (至少20个字符):"
    openssl rand -base64 24
    
    echo ""
    log_info "请将以上密钥复制到 .env 文件中"
}

# 显示帮助信息
show_help() {
    cat << EOF
ChewyBBTalk 单容器部署管理脚本

用法: $0 [命令]

命令:
  start       启动服务
  stop        停止服务
  restart     重启服务
  rebuild     重新构建镜像并启动
  logs        查看日志 (可选: logs <服务名>)
  status      查看服务状态
  shell       进入容器 shell
  backup      备份数据
  clean       清理所有数据（危险操作）
  keys        生成配置密钥
  help        显示此帮助信息

示例:
  $0 start            # 启动服务
  $0 logs             # 查看所有日志
  $0 status           # 查看服务状态
  $0 keys             # 生成配置密钥

EOF
}

# 主逻辑
main() {
    check_docker
    
    case "$1" in
        start)
            check_env
            start
            ;;
        stop)
            stop
            ;;
        restart)
            restart
            ;;
        rebuild)
            check_env
            rebuild
            ;;
        logs)
            logs "$2"
            ;;
        status)
            status
            ;;
        shell)
            shell
            ;;
        backup)
            backup
            ;;
        clean)
            clean
            ;;
        keys)
            generate_keys
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "未知命令: $1"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

main "$@"
