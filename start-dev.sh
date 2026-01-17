#!/bin/bash
# 开发环境启动脚本

set -e

# 加载环境变量
if [ -f .env.dev ]; then
    export $(grep -v '^#' .env.dev | xargs)
fi

# 默认值
FRONTEND_UPSTREAM=${FRONTEND_UPSTREAM:-frontend:4010}
BACKEND_UPSTREAM=${BACKEND_UPSTREAM:-backend:8020}

echo "🚀 ChewyBBTalk 开发环境启动"

# 启动服务
echo ""
echo "🐳 启动 Docker 服务..."
docker compose -f docker-compose.dev.yml up -d

echo ""
echo "✅ Docker 服务已启动"

echo ""
echo "🌐 访问地址："
echo "   http://localhost:${PORT:-8021}"

echo ""
echo "🎉 启动完成！"
