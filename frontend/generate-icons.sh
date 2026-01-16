#!/bin/sh
# 如果 PNG 图标不存在，从 SVG 复制（浏览器会自动渲染）
if [ ! -f /app/public/pwa-192x192.png ]; then
  cp /app/public/icon.svg /app/public/pwa-192x192.png
fi
if [ ! -f /app/public/pwa-512x512.png ]; then
  cp /app/public/icon.svg /app/public/pwa-512x512.png
fi
if [ ! -f /app/public/favicon.ico ]; then
  cp /app/public/icon.svg /app/public/favicon.ico
fi
