import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baselines = JSON.parse(readFileSync(resolve(root, 'scripts/coverage-baseline.json'), 'utf8'));
const requested = process.argv.slice(2);
const parts = requested.length ? requested : Object.keys(baselines);
const failures = [];
const percent = (covered, total) => total === 0 ? 100 : covered / total * 100;
const pythonMetrics = summary => ({
  lines: percent(summary.covered_lines, summary.num_statements),
  branches: percent(summary.covered_branches, summary.num_branches),
});
const jsMetrics = summary => Object.fromEntries(['lines', 'branches'].map(key => [key, summary[key]?.pct]));

function check(label, actual, minimum) {
  for (const [metric, floor] of Object.entries(minimum)) {
    const value = actual[metric];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < floor) {
      failures.push(`${label}: ${metric} ${value ?? 'missing'}% is below ${floor}%`);
    }
  }
  console.log(`${label}: lines ${actual.lines?.toFixed(2)}%, branches ${actual.branches?.toFixed(2)}%`);
}

for (const part of parts) {
  try {
    const baseline = baselines[part];
    if (!baseline) throw new Error(`Unknown coverage module: ${part}`);
    const report = JSON.parse(readFileSync(resolve(root, baseline.report), 'utf8'));
    const python = part === 'backend';
    const metrics = python ? pythonMetrics : jsMetrics;
    check(part, metrics(python ? report.totals : report.total), baseline.minimum);
    const files = Object.entries(python ? report.files : report).filter(([key]) => key !== 'total');
    for (const [suffix, floor] of Object.entries(baseline.files)) {
      const matches = files.filter(([path]) => path.replaceAll('\\', '/').endsWith(`/${suffix}`));
      if (matches.length !== 1) throw new Error(`${part}/${suffix}: expected exactly one source entry, found ${matches.length}`);
      check(`${part}/${suffix}`, metrics(python ? matches[0][1].summary : matches[0][1]), floor);
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
