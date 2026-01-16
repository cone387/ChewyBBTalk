#!/bin/sh
# 复制 SVG 图标作为 favicon
if [ ! -f /app/public/favicon.ico ]; then
  cp /app/public/icon.svg /app/public/favicon.ico
fi
