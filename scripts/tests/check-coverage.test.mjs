import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Exercise the actual CLI against isolated reports, without overwriting real coverage.
function runGate(t, { functions = 100, fileFunctions = 100, missingFile = false, part = 'frontend', missingReport = false, sourcePath = 'C:\\project\\src\\api.ts' } = {}) {
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
    ...(!missingFile && { [sourcePath]: metrics(fileFunctions) }),
  }));
  return spawnSync(process.execPath, [join(root, 'scripts/check-coverage.mjs'), part], { encoding: 'utf8' });
}

test('accepts complete reports including Windows file paths', t => {
  const result = runGate(t);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /functions 100\.00%/);
});

test('accepts relative source paths at the report root', t => {
  const result = runGate(t, { sourcePath: 'api.ts' });
  assert.equal(result.status, 0, result.stderr);
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

function runPythonGroup(t, { missing = false, duplicate = false, covered = 9 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'bbtalk-python-coverage-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'));
  copyFileSync(new URL('../check-coverage.mjs', import.meta.url), join(root, 'scripts/check-coverage.mjs'));
  const summary = (covered_lines, num_statements) => ({ covered_lines, num_statements, covered_branches: 1, num_branches: 1 });
  writeFileSync(join(root, 'scripts/coverage-baseline.json'), JSON.stringify({
    backend: { report: 'coverage.json', minimum: { lines: 0 }, files: {}, groups: {
      records: { sources: duplicate ? ['api.py', 'api.py'] : ['api.py', 'service.py'], minimum: { lines: 95, branches: 99 } },
    } },
  }));
  writeFileSync(join(root, 'coverage.json'), JSON.stringify({ totals: summary(100, 100), files: {
    'src/pkg/api.py': { summary: summary(covered, 10) },
    ...(!missing && { 'src/pkg/service.py': { summary: summary(90, 90) } }),
  } }));
  return spawnSync(process.execPath, [join(root, 'scripts/check-coverage.mjs'), 'backend'], { encoding: 'utf8' });
}

test('weights split Python modules by statement counts', t => {
  const result = runPythonGroup(t);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /backend\/records: lines 99\.00%/);
});

for (const options of [{ missing: true }, { duplicate: true }, { covered: 0 }]) {
  test(`rejects invalid or under-covered Python groups: ${JSON.stringify(options)}`, t => {
    assert.equal(runPythonGroup(t, options).status, 1);
  });
}
