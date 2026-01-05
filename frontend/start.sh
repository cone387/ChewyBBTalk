#!/bin/bash

# ChewyBBTalk 快速启动脚本

set -e

echo "========================================"
echo "ChewyBBTalk 子应用启动脚本"
echo "========================================"
echo ""

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误: 请在 frontend 目录下运行此脚本"
    echo "   cd chewy_bbtalk/frontend && ./start.sh"
    exit 1
fi

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js，请先安装 Node.js"
    exit 1
fi

echo "✓ Node 版本: $(node -v)"
echo "✓ npm 版本: $(npm -v)"
echo ""

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "⚠️  未找到 .env 文件，从 .env.example 复制..."
    cp .env.example .env
    echo "✓ 已创建 .env 文件，请根据需要修改配置"
    echo ""
fi

# 检查 node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 首次运行，正在安装依赖..."
    npm install
    echo "✓ 依赖安装完成"
    echo ""
fi

# 启动开发服务器
echo "🚀 启动开发服务器..."
echo "   地址: http://localhost:4001"
echo "   按 Ctrl+C 停止"
echo ""

npm run dev
