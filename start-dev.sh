#!/bin/bash
# 开发环境启动脚本

set -e

# 加载环境变量
if [ -f .env.dev ]; then
    export $(grep -v '^#' .env.dev | xargs)
fi

# 默认值
FRONTEND_UPSTREAM=${FRONTEND_UPSTREAM:-frontend:5173}
BACKEND_UPSTREAM=${BACKEND_UPSTREAM:-backend:8000}
ENABLE_AUTHELIA=${ENABLE_AUTHELIA:-true}
ENABLE_HTTPS=${ENABLE_HTTPS:-true}

echo "🚀 ChewyBBTalk 开发环境启动"
echo "================================"
echo "前端: $FRONTEND_UPSTREAM"
echo "后端: $BACKEND_UPSTREAM"
echo "Authelia: $ENABLE_AUTHELIA"
echo "HTTPS: $ENABLE_HTTPS"
echo "================================"

# 检查证书
if [ "$ENABLE_HTTPS" = "true" ]; then
    if [ ! -f "./certs/localhost.pem" ]; then
        echo ""
        echo "⚠️  未找到 HTTPS 证书"
        echo ""
        read -p "是否现在生成证书？(y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            ./generate-cert.sh
        else
            echo "❌ 需要证书才能启动 HTTPS 模式"
            exit 1
        fi
    fi
fi

# 启动服务
echo ""
echo "🐳 启动 Docker 服务..."
docker-compose -f docker-compose.dev.yml up -d

echo ""
echo "✅ Docker 服务已启动"

echo ""
echo "🌐 访问地址："
if [ "$ENABLE_HTTPS" = "true" ]; then
    echo "   https://localhost:${HTTPS_PORT:-8443}"
else
    echo "   http://localhost:${PORT:-8020}"
fi

if [ "$ENABLE_AUTHELIA" = "true" ]; then
    echo ""
    echo "👤 默认账号："
    echo "   用户名: admin"
    echo "   密码: admin (见 authelia/users_database.yml)"
fi

echo ""
echo "🎉 启动完成！"
