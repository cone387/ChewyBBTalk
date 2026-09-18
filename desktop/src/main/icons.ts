import { app } from 'electron';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
export function appIconPath(name = process.platform === 'win32' ? 'icon.ico' : 'icon.png') {
  return app.isPackaged ? resolve(process.resourcesPath, name) : resolve(here, '../../resources', name);
}
