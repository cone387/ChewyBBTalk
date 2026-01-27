#!/usr/bin/env node

/**
 * 修复 iOS PWA 图标空白问题
 * 
 * 这个脚本会：
 * 1. 读取 icon.svg
 * 2. 使用 sharp 库生成带背景的 PNG 图标
 * 3. 确保图标填满整个画布，没有透明边距
 */

const fs = require('fs');
const path = require('path');

console.log('iOS PWA 图标修复工具\n');
console.log('检查依赖...');

// 检查是否安装了 sharp
let sharp;
try {
  sharp = require('sharp');
  console.log('✓ sharp 已安装\n');
} catch (e) {
  console.error('✗ 未找到 sharp 库');
  console.error('\n请先安装 sharp:');
  console.error('  npm install --save-dev sharp');
  console.error('\n或使用在线工具 generate-ios-icon.html 手动生成图标');
  process.exit(1);
}

const publicDir = path.join(__dirname, 'public');
const iconSvg = path.join(publicDir, 'icon.svg');

// 检查源文件
if (!fs.existsSync(iconSvg)) {
  console.error('✗ 未找到 icon.svg');
  process.exit(1);
}

console.log('开始生成图标...\n');

// 生成不同尺寸的图标
const sizes = [
  { size: 180, name: 'apple-touch-icon.png', desc: 'iOS 主屏幕图标' },
  { size: 192, name: 'pwa-192x192.png', desc: 'PWA 图标 (Android)' },
  { size: 512, name: 'pwa-512x512.png', desc: 'PWA 图标 (高清)' },
  { size: 144, name: 'pwa-144x144.png', desc: 'PWA 图标' },
  { size: 152, name: 'pwa-152x152.png', desc: 'PWA 图标 (iPad)' },
  { size: 167, name: 'pwa-167x167.png', desc: 'PWA 图标 (iPad Pro)' },
];

async function generateIcons() {
  for (const { size, name, desc } of sizes) {
    try {
      await sharp(iconSvg)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 79, g: 70, b: 229, alpha: 1 } // #4F46E5
        })
        .png()
        .toFile(path.join(publicDir, name));
      
      console.log(`✓ ${name} (${size}x${size}) - ${desc}`);
    } catch (error) {
      console.error(`✗ 生成 ${name} 失败:`, error.message);
    }
  }
  
  console.log('\n✓ 所有图标生成完成！');
  console.log('\n后续步骤：');
  console.log('1. 重新构建前端: npm run build');
  console.log('2. 部署应用');
  console.log('3. 在 iOS 上删除旧的 PWA 图标');
  console.log('4. 重新添加到主屏幕\n');
}

generateIcons().catch(console.error);
