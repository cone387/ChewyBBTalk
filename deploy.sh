#!/bin/bash

###############################################################
#                ChewyBBTalk 单容器部署脚本                      #
#              构建并管理单个 Docker 容器                        #
###############################################################

set -e

IMAGE_NAME="chewybbtalk"
CONTAINER_NAME="chewy-bbtalk"
PORT="4010"
DOCKERFILE="Dockerfile"  # 默认使用普通版，可改为 Dockerfile.cn
REMOTE_IMAGE="ghcr.io/cone387/chewybbtalk:latest"  # GitHub Container Registry 镜像

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

# 检查 .env 文件（可选）
check_env() {
    if [ -f ".env" ]; then
        log_info "使用环境配置: .env"
        ENV_FILE_OPT="--env-file .env"
    else
        log_info "未发现 .env 文件，使用默认配置启动"
        log_info "默认管理员账号: admin / admin123"
        ENV_FILE_OPT=""
    fi
}

# 构建镜像
build() {
    log_info "构建 Docker 镜像..."
    log_info "使用 Dockerfile: $DOCKERFILE"
    
    # 计算 .env 文件的 hash，用于触发前端缓存失效
    if [ -f ".env" ]; then
        ENV_HASH=$(md5sum .env 2>/dev/null | cut -d' ' -f1 || echo "no-env")
    else
        ENV_HASH="no-env"
    fi
    log_info "ENV_HASH: $ENV_HASH"
    
    # 使用 --build-arg 传递 hash，只在 .env 变化时重建前端
    docker build --build-arg ENV_HASH="$ENV_HASH" -f "$DOCKERFILE" -t "$IMAGE_NAME" .
    log_info "镜像构建完成: $IMAGE_NAME"
}

# 启动容器
start() {
    check_env
    
    # 检查容器是否已存在
    if docker ps -a --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_warn "容器 $CONTAINER_NAME 已存在"
        
        # 检查容器是否正在运行
        if docker ps --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
            log_info "容器已在运行"
            show_access_info
            return 0
        else
            log_info "启动现有容器..."
            docker start "$CONTAINER_NAME"
        fi
    else
        # 检查镜像是否存在
        if ! docker images --format 'table {{.Repository}}' | grep -q "^${IMAGE_NAME}$"; then
            log_info "镜像不存在，开始构建..."
            build
        fi
        
        log_info "创建并启动新容器..."
        docker run -d \
            --name "$CONTAINER_NAME" \
            -p "$PORT:$PORT" \
            $ENV_FILE_OPT \
            -v "$(pwd)/data:/app/data" \
            "$IMAGE_NAME"
    fi
    
    log_info "容器启动成功！"
    show_access_info
}

# 停止容器
stop() {
    if docker ps --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_info "停止容器..."
        docker stop "$CONTAINER_NAME"
        log_info "容器已停止"
    else
        log_warn "容器未运行"
    fi
}

# 重启容器
restart() {
    log_info "重启容器..."
    if docker ps -a --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        docker restart "$CONTAINER_NAME"
        log_info "容器重启成功！"
        show_access_info
    else
        log_warn "容器不存在，将创建新容器"
        start
    fi
}

# 重新构建并启动
rebuild() {
    log_info "重新构建并启动..."
    
    # 停止并删除旧容器
    if docker ps -a --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_info "删除旧容器..."
        docker stop "$CONTAINER_NAME" 2>/dev/null || true
        docker rm "$CONTAINER_NAME" 2>/dev/null || true
    fi
    
    # 删除旧镜像
    if docker images --format 'table {{.Repository}}' | grep -q "^${IMAGE_NAME}$"; then
        log_info "删除旧镜像..."
        docker rmi "$IMAGE_NAME" 2>/dev/null || true
    fi
    
    # 重新构建并启动
    build
    start
}

# 查看日志
logs() {
    if docker ps --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        docker logs -f "$CONTAINER_NAME"
    else
        log_error "容器未运行"
        exit 1
    fi
}

# 查看状态
status() {
    log_info "容器状态:"
    if docker ps -a --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        docker ps -a --filter "name=${CONTAINER_NAME}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        
        if docker ps --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
            echo ""
            show_access_info
        fi
    else
        echo "容器不存在"
    fi
}

# 进入容器
shell() {
    if docker ps --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_info "进入容器 shell..."
        docker exec -it "$CONTAINER_NAME" /bin/sh
    else
        log_error "容器未运行"
        exit 1
    fi
}

# 清理资源
clean() {
    log_info "清理容器和镜像..."
    
    # 停止并删除容器
    if docker ps -a --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        docker stop "$CONTAINER_NAME" 2>/dev/null || true
        docker rm "$CONTAINER_NAME" 2>/dev/null || true
        log_info "容器已删除"
    fi
    
    # 删除镜像
    if docker images --format 'table {{.Repository}}' | grep -q "^${IMAGE_NAME}$"; then
        docker rmi "$IMAGE_NAME" 2>/dev/null || true
        log_info "镜像已删除"
    fi
    
    log_info "清理完成"
}

# 从远程拉取镜像并更新
pull() {
    log_info "从远程拉取最新镜像..."
    docker pull "$REMOTE_IMAGE"
    
    check_env
    
    # 停止并删除旧容器
    if docker ps -a --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_info "停止并删除旧容器..."
        docker stop "$CONTAINER_NAME" 2>/dev/null || true
        docker rm "$CONTAINER_NAME" 2>/dev/null || true
    fi
    
    # 使用远程镜像启动新容器
    log_info "启动新容器..."
    docker run -d \
        --name "$CONTAINER_NAME" \
        --restart unless-stopped \
        -p "$PORT:$PORT" \
        $ENV_FILE_OPT \
        -v "$(pwd)/data:/app/data" \
        "$REMOTE_IMAGE"
    
    # 清理旧镜像
    docker image prune -f
    
    log_info "更新完成！"
    show_access_info
}

# 显示访问信息
show_access_info() {
    log_info "访问地址: http://localhost:$PORT"
    log_info "API 文档: http://localhost:$PORT/api/schema/swagger-ui/"
    log_info "管理后台: http://localhost:$PORT/admin/"
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

# 切换 Dockerfile 版本
switch_dockerfile() {
    if [ "$1" = "cn" ]; then
        DOCKERFILE="Dockerfile.cn"
        log_info "已切换到国内优化版: Dockerfile.cn"
    else
        DOCKERFILE="Dockerfile"
        log_info "已切换到普通版: Dockerfile"
    fi
}

# 显示帮助信息
show_help() {
    cat << EOF
ChewyBBTalk 单容器部署脚本

用法: $0 [命令] [选项]

命令:
  build [cn]    构建 Docker 镜像 (可选 cn 使用国内镜像源)
  start         启动容器 (如果镜像不存在会自动构建)
  stop          停止容器
  restart       重启容器
  rebuild [cn]  重新构建镜像并启动容器 (可选 cn 使用国内镜像源)
  pull          从 GitHub Container Registry 拉取最新镜像并更新
  logs          查看容器日志
  status        查看容器状态
  shell         进入容器 shell
  clean         清理容器和镜像
  keys          生成配置密钥
  help          显示此帮助信息

部署流程:
  1. 直接启动: $0 start
  2. (可选) 自定义配置: cp .env.example .env && vim .env
  3. (可选) 重新构建: $0 rebuild

示例:
  $0 start         # 构建并启动容器
  $0 build cn      # 使用国内镜像源构建
  $0 rebuild cn    # 使用国内镜像源重新构建
  $0 pull          # 从远程拉取最新镜像并更新 (GitHub Actions 构建后使用)
  $0 logs          # 查看日志
  $0 status        # 查看状态
  $0 clean         # 清理资源

注意:
  - 容器端口: $PORT
  - 数据目录: ./data (自动挂载)
  - 配置文件: .env

EOF
}

# 主逻辑
main() {
    check_docker
    
    case "${1:-help}" in
        build)
            switch_dockerfile "$2"
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
            switch_dockerfile "$2"
            rebuild
            ;;
        pull)
            pull
            ;;
        logs)
            logs
            ;;
        status)
            status
            ;;
        shell)
            shell
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
