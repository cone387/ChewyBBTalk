/**
 * 系统托盘。
 */
import { Tray, Menu, nativeImage, app } from 'electron';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { showComposeWindow } from './windows/composeWindow';

const __dirname = dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;

export function createTray() {
  // 使用 resources/icon.png 作为托盘图标
  const iconPath = app.isPackaged
    ? resolve(process.resourcesPath, 'icon.png')
    : resolve(__dirname, '../../resources/icon.png');

  let icon = nativeImage.createFromPath(iconPath);
  // 托盘图标需要小尺寸（16x16 或 22x22）
  icon = icon.resize({ width: 16, height: 16 });

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
