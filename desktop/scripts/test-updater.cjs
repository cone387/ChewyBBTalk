const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const directory = mkdtempSync(join(tmpdir(), 'chewy-update-smoke-'));
try {
  const result = spawnSync(require('electron'), ['integration/updater-smoke.cjs', '--no-sandbox'], {
    stdio: 'inherit', timeout: 55_000,
    env: { ...process.env, CHEWY_UPDATE_TEST_PROFILE: directory },
  });
  if (result.error) console.error(result.error);
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
