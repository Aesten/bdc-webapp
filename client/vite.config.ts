import { defineConfig, createLogger } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const logger = createLogger()
const _error = logger.error.bind(logger)
logger.error = (msg, opts) => {
  if (msg.includes('ECONNABORTED')) return
  _error(msg, opts)
}

export default defineConfig(({ mode }) => ({
  customLogger: logger,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    // In dev, bypass Vite's broken WS proxy and connect directly to the backend.
    // In production the frontend is served by the same server, so no origin needed.
    __WS_ORIGIN__: JSON.stringify(mode === 'development' ? 'ws://localhost:3000' : ''),
  },
  server: {
    port: 5173,
    proxy: {
      '/api':     { target: 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
  },
}))
