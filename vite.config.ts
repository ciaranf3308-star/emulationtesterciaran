import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: '0.0.0.0' },
  resolve: {
    alias: {
      '@tauri-apps/api/core': path.resolve(__dirname, 'src/tauri/stubs/tauri-core-stub.ts'),
      '@tauri-apps/api': path.resolve(__dirname, 'src/tauri/stubs/tauri-core-stub.ts'),
      '@tauri-apps/plugin-fs': path.resolve(__dirname, 'src/tauri/stubs/tauri-fs-stub.ts'),
    }
  },
  optimizeDeps: {
    exclude: ['@tauri-apps/api', '@tauri-apps/api/core', '@tauri-apps/plugin-fs']
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 0,
    rollupOptions: {
      external: (id) => id.startsWith('@tauri-apps/'),
    },
  },
})
