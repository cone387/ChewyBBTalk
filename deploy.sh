#!/bin/bash

###############################################################
#                  ChewyBBTalk 单容器部署脚本                  #
#           使用 docker run 运行包含所有服务的单个容器          #
###############################################################

set -e

IMAGE_NAME="chewybbtalk"
CONTAINER_NAME="chewybbtalk"
PORT="80"

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
}

# 检查 .env 文件
check_env() {
    if [ ! -f .env ]; then
        log_warn ".env 文件不存在，从 .env.example 复制"
        cp .env.example .env
        log_info "请编辑 .env 文件，修改必要的配置项"
        log_info "生成密钥请运行: ./deploy.sh keys"
        exit 0
    fi
}

# 构建镜像
build() {
    log_info "构建 ${IMAGE_NAME} 镜像..."
    docker build -t ${IMAGE_NAME}:latest .
    log_info "镜像构建完成"
}

# 启动服务
start() {
    check_env
    
    # 检查容器是否已存在
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_warn "容器 ${CONTAINER_NAME} 已存在"
        if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
            log_info "容器正在运行中"
            return 0
        else
            log_info "启动现有容器..."
            docker start ${CONTAINER_NAME}
            log_info "容器启动成功！"
            return 0
        fi
    fi
    
    # 检查镜像是否存在
    if ! docker images --format '{{.Repository}}:{{.Tag}}' | grep -q "^${IMAGE_NAME}:latest$"; then
        log_info "镜像不存在，开始构建..."
        build
    fi
    
    log_info "启动 ${CONTAINER_NAME} 容器..."
    
    # 加载环境变量
    source .env
    
    # 创建必要的目录
    mkdir -p ./data/media ./data/db ./data/authelia ./logs
    
    # 运行容器
    docker run -d \
        --name ${CONTAINER_NAME} \
        -p ${PORT}:80 \
        -e DJANGO_SETTINGS_MODULE=chewy_space.settings \
        -e CHEWYBBTALK_SETTINGS_MODULE=${CHEWYBBTALK_SETTINGS_MODULE:-} \
        -e DEBUG=${DEBUG:-false} \
        -e SECRET_KEY="${SECRET_KEY}" \
        -e ALLOWED_HOSTS=${ALLOWED_HOSTS:-*} \
        -e DATABASE_URL="${DATABASE_URL:-sqlite:///./db.sqlite3}" \
        -e CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-}" \
        -e LANGUAGE_CODE=${LANGUAGE_CODE:-zh-hans} \
        -e TIME_ZONE=${TIME_ZONE:-Asia/Shanghai} \
        -e AUTHELIA_SESSION_SECRET="${AUTHELIA_SESSION_SECRET}" \
        -e AUTHELIA_ENCRYPTION_KEY="${AUTHELIA_ENCRYPTION_KEY}" \
        -v "$(pwd)/data/media:/app/media" \
        -v "$(pwd)/data/db:/app/backend/db" \
        -v "$(pwd)/data/authelia:/data" \
        -v "$(pwd)/logs:/app/logs" \
        -v "$(pwd)/authelia/configuration.yml:/config/configuration.yml:ro" \
        -v "$(pwd)/authelia/users_database.yml:/config/users_database.yml:ro" \
        --restart unless-stopped \
        ${IMAGE_NAME}:latest
    
    log_info "服务启动成功！"
    log_info "访问地址: http://localhost:${PORT}"
    log_info "Authelia 登录: http://localhost:${PORT}/authelia/"
    log_info "默认账号: admin / password (请立即修改)"
}

# 停止服务
stop() {
    log_info "停止 ${CONTAINER_NAME} 容器..."
    docker stop ${CONTAINER_NAME} 2>/dev/null || log_warn "容器未运行"
    log_info "容器已停止"
}

# 重启服务
restart() {
    log_info "重启 ${CONTAINER_NAME} 容器..."
    docker restart ${CONTAINER_NAME} 2>/dev/null || {
        log_warn "容器不存在或未运行，尝试启动..."
        start
        return 0
    }
    log_info "容器重启成功！"
}

# 重新构建
rebuild() {
    log_info "重新构建 ${IMAGE_NAME} 镜像..."
    
    # 停止并删除旧容器
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_info "删除旧容器..."
        docker rm -f ${CONTAINER_NAME}
    fi
    
    # 删除旧镜像
    if docker images --format '{{.Repository}}:{{.Tag}}' | grep -q "^${IMAGE_NAME}:latest$"; then
        log_info "删除旧镜像..."
        docker rmi ${IMAGE_NAME}:latest
    fi
    
    # 构建新镜像
    build
    
    # 启动容器
    start
}

# 查看日志
logs() {
    if [ -n "$1" ]; then
        case "$1" in
            authelia)
                docker exec ${CONTAINER_NAME} tail -f /app/logs/authelia.log
                ;;
            django|backend)
                docker exec ${CONTAINER_NAME} tail -f /app/logs/django.log
                ;;
            nginx)
                docker exec ${CONTAINER_NAME} tail -f /app/logs/nginx_access.log
                ;;
            *)
                log_error "未知的服务名: $1"
                log_info "可用的服务: authelia, django, nginx"
                exit 1
                ;;
        esac
    else
        # 显示所有日志
        docker logs -f ${CONTAINER_NAME}
    fi
}

# 查看状态
status() {
    log_info "容器状态:"
    if docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -q "^${CONTAINER_NAME}"; then
        docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E "NAMES|${CONTAINER_NAME}"
        echo ""
        log_info "容器运行中 ✓"
    else
        log_warn "容器未运行"
        if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
            docker ps -a --format 'table {{.Names}}\t{{.Status}}' | grep -E "NAMES|${CONTAINER_NAME}"
        fi
    fi
}

# 进入容器
shell() {
    log_info "进入 ${CONTAINER_NAME} 容器..."
    docker exec -it ${CONTAINER_NAME} /bin/bash
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
    log_warn "警告: 此操作将删除容器、镜像和所有数据（数据库、媒体文件、日志等）"
    read -p "确认删除？(yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        log_info "操作已取消"
        exit 0
    fi
    
    log_info "停止并删除容器..."
    docker rm -f ${CONTAINER_NAME} 2>/dev/null || true
    
    log_info "删除镜像..."
    docker rmi ${IMAGE_NAME}:latest 2>/dev/null || true
    
    log_info "删除数据..."
    rm -rf ./data ./logs
    
    log_info "清理完成"
}

# 生成密钥
generate_keys() {
    log_info "生成配置密钥:"
    echo ""
    echo "Django SECRET_KEY:"
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
  build       构建 Docker 镜像
  start       启动容器
  stop        停止容器
  restart     重启容器
  rebuild     重新构建镜像并启动
  logs [服务]  查看日志 (可选服务: authelia, django, nginx)
  status      查看容器状态
  shell       进入容器 shell
  backup      备份数据
  clean       清理容器、镜像和数据（危险操作）
  keys        生成配置密钥
  help        显示此帮助信息

示例:
  $0 build            # 构建镜像
  $0 start            # 启动容器
  $0 logs django      # 查看 Django 日志
  $0 status           # 查看容器状态
  $0 keys             # 生成配置密钥

EOF
}

# 主逻辑
main() {
    check_docker
    
    case "$1" in
        build)
            build
            ;;
        start)
            start
            ;;
        stop)
            stop
            ;;
        restart)
            restart
            ;;
        rebuild)
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
        "")
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
