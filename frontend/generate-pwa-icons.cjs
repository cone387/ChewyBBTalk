// 从源 PNG 文件生成不同尺寸的 PWA 图标
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
const sourceIcon = path.join(publicDir, 'pwa-icon.png');

// 检查源文件是否存在
if (!fs.existsSync(sourceIcon)) {
  console.error('错误: 未找到源图标文件 pwa-icon.png');
  console.error('请将 512x512 的 PNG 图标放到 frontend/public/pwa-icon.png');
  process.exit(1);
}

// 需要生成的尺寸
const sizes = [
  { size: 192, name: 'pwa-192x192.png' },
  { size: 512, name: 'pwa-512x512.png' },
  { size: 180, name: 'apple-touch-icon.png' },  // iOS
];

// 直接复制源文件到各个尺寸
// 注意：这里简化处理，实际生产环境应使用 sharp 等库进行真正的缩放
sizes.forEach(({ name }) => {
  const targetPath = path.join(publicDir, name);
  fs.copyFileSync(sourceIcon, targetPath);
  console.log(`Created ${name} (copied from source)`);
});

console.log('✓ PWA icons generation completed');
console.log('提示: 当前使用源文件直接复制，未进行缩放。');
console.log('如需真正的多尺寸图标，请使用图片编辑工具预先生成各尺寸。');
