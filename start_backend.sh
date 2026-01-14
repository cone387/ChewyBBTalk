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
PID_FILE=".backend.pid"

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
    
    # 方式1: 通过 PID 文件
    if [ -f "$PID_FILE" ]; then
        OLD_PID=$(cat "$PID_FILE")
        if ps -p $OLD_PID > /dev/null 2>&1; then
            log_info "发现旧进程 (PID: $OLD_PID)，正在停止..."
            kill $OLD_PID 2>/dev/null || true
            sleep 1
            
            # 如果进程还在，强制杀死
            if ps -p $OLD_PID > /dev/null 2>&1; then
                log_warn "进程未响应，强制终止..."
                kill -9 $OLD_PID 2>/dev/null || true
            fi
            log_info "旧进程已停止"
        fi
        rm -f "$PID_FILE"
    fi
    
    # 方式2: 通过端口查找进程
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
        fi
    fi
    
    # 方式3: 通过进程名查找（备用）
    DJANGO_PIDS=$(pgrep -f "manage.py runserver" 2>/dev/null || true)
    if [ -n "$DJANGO_PIDS" ]; then
        log_info "发现 Django 进程，正在停止..."
        echo "$DJANGO_PIDS" | xargs kill 2>/dev/null || true
        sleep 1
    fi
}

# 加载环境变量
load_env() {
    log_step "加载环境变量..."
    
    # 设置开发环境配置模块
    export CHEWYBBTALK_SETTINGS_MODULE="${CHEWYBBTALK_SETTINGS_MODULE:-configs.dev_settings}"
    export DJANGO_SETTINGS_MODULE="chewy_space.settings"
    
    # 如果存在 .env 文件，加载它
    if [ -f .env ]; then
        log_info "从 .env 文件加载环境变量"
        set -a
        source .env
        set +a
    fi
    
    # 开发环境默认设置
    export DEBUG="${DEBUG:-true}"
    export ALLOWED_HOSTS="${ALLOWED_HOSTS:-*}"
    export LANGUAGE_CODE="${LANGUAGE_CODE:-zh-hans}"
    export TIME_ZONE="${TIME_ZONE:-Asia/Shanghai}"
    
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
    
    # 启动服务并记录 PID
    log_info "服务地址: http://$HOST:$PORT"
    log_info "按 Ctrl+C 停止服务"
    echo ""
    
    # 使用 uv run 启动 Django 开发服务器
    uv run python chewy_space/manage.py runserver $HOST:$PORT &
    BACKEND_PID=$!
    
    # 保存 PID
    cd - > /dev/null
    echo $BACKEND_PID > "$PID_FILE"
    
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
        rm -f "$PID_FILE"
        exit 1
    fi
}

# 清理函数（退出时调用）
cleanup() {
    echo ""
    log_info "正在停止后端服务..."
    
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p $PID > /dev/null 2>&1; then
            kill $PID 2>/dev/null || true
            sleep 1
        fi
        rm -f "$PID_FILE"
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
    
    check_backend_dir
    kill_old_process
    load_env
    run_migrations
    collect_static
    start_backend
}

# 执行主函数
main
