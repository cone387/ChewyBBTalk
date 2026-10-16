import { app } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Keep the installed profile stable across product renames. This must run before
// electron-store or sessions initialize so accounts and draft files stay together.
// Development and integration entry points retain their isolated profiles.
if (app.isPackaged) {
  const userData = join(app.getPath('appData'), 'chewybbtalk-desktop');
  mkdirSync(userData, { recursive: true });
  app.setPath('userData', userData);
  app.setName('BBTalk');
}
