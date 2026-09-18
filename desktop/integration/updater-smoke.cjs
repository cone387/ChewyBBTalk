// Real electron-updater transport/checksum test. Never executes an installer.
const { app } = require('electron');
const { createServer } = require('node:http');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const directory = process.env.CHEWY_UPDATE_TEST_PROFILE;
if (!directory) throw Error('Isolated test profile is required');
app.setPath('userData', directory);
app.setPath('cache', directory);
app.disableHardwareAcceleration();
let server;
const timeout = setTimeout(() => { console.error('Updater smoke test timed out'); app.exit(1); }, 45_000);
app.whenReady().then(async () => {
  const { NsisUpdater } = require('electron-updater');
  let payload = Buffer.from('Test fixture: not an executable.');
  let corrupt = false;
  let unavailable = false;
  let version = '999.0.0';
  server = createServer((req, res) => {
    if (unavailable) { res.writeHead(503); res.end('offline'); return; }
    if (req.url.startsWith('/latest.yml')) {
      const hash = createHash('sha512').update(payload).digest('base64');
      res.end(`version: ${version}\nfiles:\n  - url: fixture-${version}.exe\n    sha512: ${hash}\n    size: ${payload.length}\npath: fixture-${version}.exe\nsha512: ${hash}\nreleaseDate: '2026-09-18T00:00:00Z'\n`);
    } else {
      res.end(corrupt ? Buffer.from('corrupt payload') : payload);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const updater = new NsisUpdater({ provider: 'generic', url: `http://127.0.0.1:${server.address().port}` });
  updater.forceDevUpdateConfig = true;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.disableDifferentialDownload = true;
  // No publisher exists for this inert fixture; production keeps the default signature verifier.
  updater.verifyUpdateCodeSignature = async () => null;
  updater.on('error', () => {});
  updater.logger = { info() {}, warn() {}, error() {}, debug() {} };
  // Avoid reading a real developer config, while keeping the real provider and downloader.
  const configPath = join(directory, 'dev-app-update.yml');
  updater.updateConfigPath = configPath;
  Object.defineProperty(updater.app, 'baseCachePath', { value: directory });
  require('node:fs').writeFileSync(configPath, `provider: generic\nurl: http://127.0.0.1:${server.address().port}\nupdaterCacheDirName: chewy-update-smoke\n`);
  const result = await updater.checkForUpdates();
  assert.equal(result.updateInfo.version, version);
  const files = await updater.downloadUpdate();
  assert.deepEqual(readFileSync(files[0]), payload);
  assert.equal(updater.autoInstallOnAppQuit, false);
  version = '999.0.1'; corrupt = true;
  payload = Buffer.from('A different new version, also not an executable.');
  await updater.checkForUpdates();
  await assert.rejects(updater.downloadUpdate(), /checksum|sha512|size/i);
  unavailable = true;
  await assert.rejects(updater.checkForUpdates());
  console.log('PASS: real update discovery, download, SHA-512 rejection, network failure; no installer executed.');
}).then(() => finish(0), error => { console.error(error); finish(1); });
function finish(code) {
  clearTimeout(timeout);
  if (server) server.close();
  app.exit(code);
}
