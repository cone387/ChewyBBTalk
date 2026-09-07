import { app, BrowserWindow } from 'electron';
if (!process.env.CHEWY_INTEGRATION_USER_DATA) throw new Error('An isolated test profile is required');
app.setPath('userData', process.env.CHEWY_INTEGRATION_USER_DATA);
app.disableHardwareAcceleration();
app.on('web-contents-created', (_, contents) => contents.setBackgroundThrottling(false));
// Keep real test windows hidden without taking desktop focus.
BrowserWindow.prototype.show = function () {};
BrowserWindow.prototype.focus = function () {};
app.whenReady().then(async () => {
const { registerComposeIpc } = await import('../src/main/ipc/composeIpc');
const { registerAuthIpc } = await import('../src/main/ipc/authIpc');
const { showComposeWindow } = await import('../src/main/windows/composeWindow');
registerComposeIpc(); registerAuthIpc(); showComposeWindow();
});
app.on('window-all-closed', () => {});
