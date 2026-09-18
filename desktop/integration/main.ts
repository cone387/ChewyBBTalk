import { app, BrowserWindow } from 'electron';
if (!process.env.CHEWY_INTEGRATION_USER_DATA) throw new Error('An isolated test profile is required');
app.setPath('userData', process.env.CHEWY_INTEGRATION_USER_DATA);
if (process.env.CHEWY_INTEGRATION_WITH_BALL !== '1') app.disableHardwareAcceleration();
if (process.env.CHEWY_INTEGRATION_OFFLINE === '1') {
  (globalThis as any).__onlineFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Simulated offline startup'); };
}
app.on('web-contents-created', (_, contents) => contents.setBackgroundThrottling(false));
// Keep real test windows hidden without taking desktop focus.
BrowserWindow.prototype.show = function () {
  if (process.env.CHEWY_INTEGRATION_WITH_BALL === '1') this.showInactive();
};
if (process.env.CHEWY_INTEGRATION_FOCUS !== '1') BrowserWindow.prototype.focus = function () {};
app.whenReady().then(async () => {
const { registerComposeIpc } = await import('../src/main/ipc/composeIpc');
const { registerAuthIpc } = await import('../src/main/ipc/authIpc');
const { showComposeWindow, getComposeWindow, hideComposeWindow } = await import('../src/main/windows/composeWindow');
const { setupCsp } = await import('../src/main/security');
const { registerUpdater } = await import('../src/main/updater');
registerUpdater();
if (process.env.CHEWY_INTEGRATION_WITH_BALL === '1') {
  const { registerBallIpc } = await import('../src/main/ipc/ballIpc');
  const { createBallWindow } = await import('../src/main/windows/ballWindow');
  registerBallIpc();
  const overlay = createBallWindow();
  const ignoreMouse = overlay.setIgnoreMouseEvents.bind(overlay);
  overlay.setIgnoreMouseEvents = (ignore, options) => {
    (globalThis as any).__ballForwarding = options?.forward ?? false;
    ignoreMouse(ignore, options);
  };
}
setupCsp(); registerComposeIpc(); registerAuthIpc(); showComposeWindow();
const { tryRestoreSession } = await import('../src/main/auth');
void tryRestoreSession();
app.on('before-quit', event => {
  const compose = getComposeWindow();
  if (compose && !compose.isDestroyed()) {
    event.preventDefault(); compose.once('closed', () => app.quit()); hideComposeWindow();
  }
});
});
app.on('window-all-closed', () => {});
