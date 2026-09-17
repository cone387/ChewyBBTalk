import { build } from 'esbuild';
await build({ entryPoints: ['integration/main.ts'], outfile: 'out/main/integration.js',
  bundle: true, packages: 'external', platform: 'node', format: 'esm', target: 'node22' });
