import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production'

  return {
    plugins: [react()],
    base: process.env.VITE_BASE_PATH || '/',
    server: {
      host: '0.0.0.0', // 允许外部访问（Docker 容器）
      port: 4010,
      cors: true,
      proxy: {
        '/api': {
          target: process.env.VITE_PROXY_TARGET || 'http://localhost:8020',
          changeOrigin: true,
        },
        '/media': {
          target: process.env.VITE_PROXY_TARGET || 'http://localhost:8020',
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
