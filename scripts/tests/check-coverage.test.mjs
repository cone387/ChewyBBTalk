import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Exercise the actual CLI against isolated reports, without overwriting real coverage.
function runGate(t, { functions = 100, fileFunctions = 100, missingFile = false, part = 'frontend', missingReport = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'bbtalk-coverage-gate-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'));
  copyFileSync(new URL('../check-coverage.mjs', import.meta.url), join(root, 'scripts/check-coverage.mjs'));
  const metrics = value => ({ lines: { pct: 100 }, branches: { pct: 100 }, ...(value === null ? {} : { functions: { pct: value } }) });
  writeFileSync(join(root, 'scripts/coverage-baseline.json'), JSON.stringify({
    frontend: { report: 'coverage.json', minimum: { lines: 95, branches: 90, functions: 90 }, files: { 'api.ts': { functions: 100 } } },
  }));
  if (!missingReport) writeFileSync(join(root, 'coverage.json'), JSON.stringify({
    total: metrics(functions),
    ...(!missingFile && { 'C:\\project\\src\\api.ts': metrics(fileFunctions) }),
  }));
  return spawnSync(process.execPath, [join(root, 'scripts/check-coverage.mjs'), part], { encoding: 'utf8' });
}

test('accepts complete reports including Windows file paths', t => {
  const result = runGate(t);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /functions 100\.00%/);
});

for (const [name, options, message] of [
  ['low total function coverage', { functions: 89 }, /frontend: functions 89% is below 90%/],
  ['low critical-file function coverage despite perfect totals', { fileFunctions: 33.33 }, /api\.ts: functions 33\.33% is below 100%/],
  ['missing function metrics', { functions: null }, /functions missing% is below/],
  ['nonnumeric function metrics', { functions: '100' }, /functions 100% is below/],
  ['missing critical files', { missingFile: true }, /expected exactly one source entry/],
  ['missing reports', { missingReport: true }, /ENOENT/],
  ['unknown modules', { part: 'unknown' }, /Unknown coverage module/],
]) {
  test(`rejects ${name}`, t => {
    const result = runGate(t, options);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, message);
  });
}
