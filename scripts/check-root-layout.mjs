import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// These are project entry points, not exceptions for generated task artifacts.
const files = new Set([
  '.dockerignore', '.env.example', '.gitignore', 'AGENTS.md',
  'Dockerfile', 'Dockerfile.cn', 'README.md', 'ROADMAP.md', 'LICENSE',
  'deploy.sh', 'docker-compose.yml', 'nginx.conf', 'nginx.host.example.conf',
  'start_backend.sh', 'start_service.sh', 'supervisord.conf',
  'skills-lock.json', '.deploy-image.lock',
]);
const directories = new Set([
  'backend', 'deploy', 'desktop', 'docs', 'frontend', 'mobile', 'openspec',
  'remotion-videos', 'scripts', 'videos', 'data', 'certs',
  '.agents', '.claude', '.codex', '.github', '.hyperframes', '.idea', '.kiro',
  '.qoder', '.superpowers', '.vscode', '.workbuddy', '.tmp',
]);

export function unexpectedRootEntries(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => {
      // Git worktrees use a .git file instead of a directory.
      if (entry.name === '.git') return false;
      if (entry.isDirectory()) return !directories.has(entry.name);
      if (!entry.isFile()) return true;
      return !files.has(entry.name) && !/^\.env(?:\.[a-zA-Z0-9_-]+)*$/.test(entry.name);
    })
    .map(entry => entry.name)
    .sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const unexpected = unexpectedRootEntries(root);
  if (unexpected.length) {
    console.error('Unexpected repository root entries:\n' + unexpected.map(name => `  ${name}`).join('\n'));
    console.error('Move temporary files to .tmp/<task>/ and reusable files to their owning module. See AGENTS.md.');
    process.exitCode = 1;
  } else {
    console.log('Repository root layout OK (including ignored files).');
  }
}
