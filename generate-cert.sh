#!/bin/bash
# 使用 mkcert 生成本地 HTTPS 证书

set -e

CERT_DIR="./certs"

echo "🔒 正在生成本地 HTTPS 证书..."

# 检查 mkcert 是否安装
if ! command -v mkcert &> /dev/null; then
    echo "❌ mkcert 未安装"
    echo ""
    echo "请先安装 mkcert："
    echo "  macOS:   brew install mkcert"
    echo "  Linux:   参考 https://github.com/FiloSottile/mkcert#installation"
    echo ""
    exit 1
fi

# 创建证书目录
mkdir -p "$CERT_DIR"

# 安装本地 CA（如果还没安装）
echo "📦 安装本地 CA..."
mkcert -install

# 生成 localhost 证书
echo "🔐 生成 localhost 证书..."
cd "$CERT_DIR"
mkcert localhost 127.0.0.1 ::1
cd ..

echo ""
echo "✅ 证书生成成功！"
echo "   证书路径: $CERT_DIR/"
echo "   - localhost.pem"
echo "   - localhost-key.pem"
echo ""
echo "💡 现在可以启动开发环境："
echo "   docker-compose -f docker-compose.dev.yml up -d"
echo "   访问: https://localhost:8021"
