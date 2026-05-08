/**
 * 系统托盘。
 */
import { Tray, Menu, nativeImage, app } from 'electron';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBallWindow } from './windows/ballWindow';
import { showComposeWindow } from './windows/composeWindow';

const __dirname = dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;

export function createTray() {
  // 用一个 16x16 蓝色圆作为托盘图标（内联生成，不依赖外部文件）
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA' +
    'WElEQVR42mNkYPj/n4EBFTAyMjIwMDAwMDIyMjAyMjIwMjIyMDIyMjAyMjIwMjIyMDIy' +
    'MjAyMjIwMjIyMDIyMjAyMjIwMjIyMDIyMjAyMjIwMjIyAABYJwX/pXHJHgAAAABJRU5E' +
    'rkJggg==',
  );

  tray = new Tray(icon);
  tray.setToolTip('ChewyBBTalk');

  const contextMenu = Menu.buildFromTemplate([
    { label: '✏️ 新建', click: () => showComposeWindow() },
    {
      label: '🌐 打开 Web',
      click: () => {
        const { shell } = require('electron');
        shell.openExternal('https://bbtalk.cone387.top');
      },
    },
    { type: 'separator' },
    {
      label: '显示 / 隐藏 Ball',
      click: () => {
        const win = getBallWindow();
        if (!win) return;
        if (win.isVisible()) win.hide();
        else win.show();
      },
    },
    { type: 'separator' },
    { label: '退出', click: () => { app.exit(0); } },
  ]);

  tray.setContextMenu(contextMenu);

  // 左键点击切换 Ball 显隐
  tray.on('click', () => {
    const win = getBallWindow();
    if (!win) return;
    if (win.isVisible()) win.hide();
    else win.show();
  });
}
