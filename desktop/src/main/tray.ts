/**
 * 系统托盘。
 */
import { Tray, Menu, nativeImage, app } from 'electron';
import { showComposeWindow } from './windows/composeWindow';
import { showSettingsWindow } from './windows/settingsWindow';
import { appIconPath } from './icons';


let tray: Tray | null = null;

export function createTray() {
  // 使用 resources/icon.png 作为托盘图标
  const iconPath = appIconPath(process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png');

  let icon = nativeImage.createFromPath(iconPath);
  // 托盘图标需要小尺寸（16x16 或 22x22）
  icon = icon.resize({ width: process.platform === 'darwin' ? 22 : 16, height: process.platform === 'darwin' ? 22 : 16 });
  if (process.platform === 'darwin') icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip('ChewyBBTalk');

  const contextMenu = Menu.buildFromTemplate([
    { label: '新建碎碎念', click: () => showComposeWindow() },
    { label: '设置', click: () => showSettingsWindow() },
    { type: 'separator' },
    { label: '退出', click: () => { (app as any)._isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(contextMenu);

  // 左键点击打开 Compose
  tray.on('click', () => {
    showComposeWindow();
  });
}
