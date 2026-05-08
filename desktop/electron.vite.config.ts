import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// 渲染侧四个入口：ball / compose / settings / login
// 构建产物放在 out/renderer/<name>/index.html
const rendererRoot = resolve('src/renderer');

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: resolve('src/main/index.ts'),
      },
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: resolve('src/preload/index.ts'),
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
        },
      },
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  renderer: {
    root: rendererRoot,
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          ball: resolve(rendererRoot, 'ball/index.html'),
          // Task 4 之后接入：
          // compose: resolve(rendererRoot, 'compose/index.html'),
          // settings: resolve(rendererRoot, 'settings/index.html'),
          // login: resolve(rendererRoot, 'login/index.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve(rendererRoot),
      },
    },
  },
});
