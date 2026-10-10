import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production'
  const env = loadEnv(mode, rootDir, ['VITE_', 'BACKEND_PORT'])
  const proxyTarget = env.VITE_PROXY_TARGET || `http://localhost:${env.BACKEND_PORT || '8020'}`

  return {
    plugins: [react()],
    envDir: rootDir,
    envPrefix: 'VITE_',
    base: env.VITE_BASE_PATH || '/',
    server: {
      host: '0.0.0.0', // 允许外部访问（Docker 容器）
      port: Number(env.VITE_DEV_PORT || 4010),
      cors: true,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/media': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    esbuild: isProd
      ? {
          drop: ['console', 'debugger'],
        }
      : undefined,
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom', 'react-redux', '@reduxjs/toolkit'],
            'vendor-markdown': ['react-markdown', 'remark-gfm', 'rehype-sanitize'],
            'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          },
        },
      },
    },
  }
})
