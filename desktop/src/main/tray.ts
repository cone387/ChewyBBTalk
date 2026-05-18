/**
 * 系统托盘。
 */
import { Tray, Menu, nativeImage, app } from 'electron';
import { showComposeWindow } from './windows/composeWindow';

let tray: Tray | null = null;

export function createTray() {
  // 生成 16x16 蓝色圆形托盘图标
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4); // RGBA
  const cx = size / 2;
  const cy = size / 2;
  const r = 6; // radius
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;
      if (dist <= r) {
        // Blue #3B82F6
        canvas[idx] = 0x3B;     // R
        canvas[idx + 1] = 0x82; // G
        canvas[idx + 2] = 0xF6; // B
        canvas[idx + 3] = 255;  // A
      } else if (dist <= r + 0.8) {
        // Anti-alias edge
        const alpha = Math.round((1 - (dist - r) / 0.8) * 255);
        canvas[idx] = 0x3B;
        canvas[idx + 1] = 0x82;
        canvas[idx + 2] = 0xF6;
        canvas[idx + 3] = alpha;
      } else {
        canvas[idx + 3] = 0; // transparent
      }
    }
  }

  const icon = nativeImage.createFromBuffer(canvas, { width: size, height: size });

  tray = new Tray(icon);
  tray.setToolTip('ChewyBBTalk');

  const contextMenu = Menu.buildFromTemplate([
    { label: '设置', click: () => { const { showSettingsWindow } = require('./windows/settingsWindow'); showSettingsWindow(); } },
    { type: 'separator' },
    { label: '退出', click: () => { (app as any)._isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(contextMenu);

  // 左键点击打开 Compose
  tray.on('click', () => {
    showComposeWindow();
  });
}
