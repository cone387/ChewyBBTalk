#!/bin/bash

###############################################################
#                  ChewyBBTalk 后端本地启动脚本                #
#              一键启动本地开发环境的 Django 后端              #
###############################################################

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
BACKEND_DIR="backend"
MANAGE_PY="$BACKEND_DIR/chewy_space/manage.py"
HOST="${BACKEND_HOST:-0.0.0.0}"
PORT="${BACKEND_PORT:-8000}"
SCRIPT_NAME="manage.py runserver"

# 环境参数（从命令行参数获取，默认为 dev）
ENV="${1:-dev}"

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

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# 检查后端目录是否存在
check_backend_dir() {
    if [ ! -d "$BACKEND_DIR" ]; then
        log_error "后端目录不存在: $BACKEND_DIR"
        exit 1
    fi
    
    if [ ! -f "$MANAGE_PY" ]; then
        log_error "manage.py 文件不存在: $MANAGE_PY"
        exit 1
    fi
}

# 杀死旧进程
kill_old_process() {
    log_step "检查并停止旧的后端进程..."
    
    local found=false
    
    # 方式1: 通过端口查找进程
    if command -v lsof &> /dev/null; then
        PORT_PID=$(lsof -ti:$PORT 2>/dev/null || true)
        if [ -n "$PORT_PID" ]; then
            log_info "发现占用端口 $PORT 的进程 (PID: $PORT_PID)，正在停止..."
            kill $PORT_PID 2>/dev/null || true
            sleep 1
            
            # 如果进程还在，强制杀死
            if ps -p $PORT_PID > /dev/null 2>&1; then
                log_warn "进程未响应，强制终止..."
                kill -9 $PORT_PID 2>/dev/null || true
            fi
            log_info "端口 $PORT 已释放"
            found=true
        fi
    fi
    
    # 方式2: 通过进程名查找
    DJANGO_PIDS=$(pgrep -f "$SCRIPT_NAME" 2>/dev/null || true)
    if [ -n "$DJANGO_PIDS" ]; then
        log_info "发现 Django 进程 (PIDs: $(echo $DJANGO_PIDS | tr '\n' ' '))，正在停止..."
        echo "$DJANGO_PIDS" | xargs kill 2>/dev/null || true
        sleep 1
        
        # 如果进程还在，强制杀死
        for pid in $DJANGO_PIDS; do
            if ps -p $pid > /dev/null 2>&1; then
                log_warn "进程 $pid 未响应，强制终止..."
                kill -9 $pid 2>/dev/null || true
            fi
        done
        found=true
    fi
    
    if [ "$found" = false ]; then
        log_info "未发现旧进程"
    fi
}

# 加载环境变量
load_env() {
    log_step "加载环境变量..."
    
    # 优先加载环境特定的配置文件
    ENV_FILE=".env.${ENV}"
    if [ -f "$ENV_FILE" ]; then
        log_info "从 $ENV_FILE 加载环境变量"
        set -a
        source "$ENV_FILE"
        set +a
    elif [ -f .env ]; then
        log_info "从 .env 加载环境变量"
        set -a
        source .env
        set +a
    fi
    
    # 设置环境特定配置模块（如果未通过环境变量指定）
    if [ -z "$CHEWYBBTALK_SETTINGS_MODULE" ]; then
        export CHEWYBBTALK_SETTINGS_MODULE="configs.${ENV}_settings"
    fi
    
    export DJANGO_SETTINGS_MODULE="chewy_space.settings"
    
    # 开发环境默认设置
    export DEBUG="${DEBUG:-true}"
    export ALLOWED_HOSTS="${ALLOWED_HOSTS:-*}"
    export LANGUAGE_CODE="${LANGUAGE_CODE:-zh-hans}"
    export TIME_ZONE="${TIME_ZONE:-Asia/Shanghai}"
    export HOST="${BACKEND_HOST:-$HOST}"
    export PORT="${BACKEND_PORT:-$PORT}"
    
    log_info "环境: $ENV"
    log_info "配置模块: $CHEWYBBTALK_SETTINGS_MODULE"
    log_info "调试模式: $DEBUG"
}

# 运行数据库迁移
run_migrations() {
    log_step "检查并运行数据库迁移..."
    
    cd $BACKEND_DIR
    
    # 检查是否有未应用的迁移
    if uv run python chewy_space/manage.py showmigrations | grep -q "\[ \]"; then
        log_info "发现未应用的迁移，正在执行..."
        uv run python chewy_space/manage.py migrate
        log_info "数据库迁移完成"
    else
        log_info "数据库已是最新状态"
    fi
    
    cd - > /dev/null
}

# 收集静态文件（可选）
collect_static() {
    if [ "${COLLECT_STATIC:-false}" = "true" ]; then
        log_step "收集静态文件..."
        cd $BACKEND_DIR
        uv run python chewy_space/manage.py collectstatic --noinput
        cd - > /dev/null
        log_info "静态文件收集完成"
    fi
}

# 启动后端服务
start_backend() {
    log_step "启动 Django 后端服务..."
    
    cd $BACKEND_DIR
    
    log_info "服务地址: http://$HOST:$PORT"
    log_info "按 Ctrl+C 停止服务"
    echo ""
    
    # 使用 uv run 启动 Django 开发服务器
    uv run python chewy_space/manage.py runserver $HOST:$PORT &
    BACKEND_PID=$!
    
    cd - > /dev/null
    
    # 等待服务启动
    sleep 2
    
    # 检查服务是否成功启动
    if ps -p $BACKEND_PID > /dev/null 2>&1; then
        log_info "✓ 后端服务已启动 (PID: $BACKEND_PID)"
        echo ""
        log_info "API 文档: http://$HOST:$PORT/api/schema/swagger-ui/"
        log_info "Admin 后台: http://$HOST:$PORT/admin/"
        echo ""
        
        # 等待进程结束
        wait $BACKEND_PID
    else
        log_error "后端服务启动失败"
        exit 1
    fi
}

# 清理函数（退出时调用）
cleanup() {
    echo ""
    log_info "正在停止后端服务..."
    
    # 通过端口查找并停止进程
    if command -v lsof &> /dev/null; then
        PORT_PID=$(lsof -ti:$PORT 2>/dev/null || true)
        if [ -n "$PORT_PID" ]; then
            kill $PORT_PID 2>/dev/null || true
            sleep 1
        fi
    fi
    
    # 通过进程名停止
    DJANGO_PIDS=$(pgrep -f "$SCRIPT_NAME" 2>/dev/null || true)
    if [ -n "$DJANGO_PIDS" ]; then
        echo "$DJANGO_PIDS" | xargs kill 2>/dev/null || true
    fi
    
    log_info "后端服务已停止"
}

# 捕获退出信号
trap cleanup EXIT INT TERM

# 主函数
main() {
    echo "=========================================="
    echo "    ChewyBBTalk 后端服务启动脚本"
    echo "=========================================="
    echo ""
    
    # 验证环境参数
    if [[ ! "$ENV" =~ ^(dev|prod|test)$ ]]; then
        log_error "无效的环境参数: $ENV"
        log_info "用法: $0 [dev|prod|test]"
        log_info "  dev  - 开发环境 (默认)"
        log_info "  prod - 生产环境"
        log_info "  test - 测试环境"
        exit 1
    fi
    
    check_backend_dir
    kill_old_process
    load_env
    run_migrations
    collect_static
    start_backend
}

# 执行主函数
main
