import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
// CI viewport note – lock 1152x654 logical @175% DPI as validation target.
// Windows ROG Ally X at 175% scaling: 1152×654 logical has no clipped primary controls
// and no body scrollbar when fullscreen-root is overflow:hidden and SystemStage uses 100% not 100vw.
// Do not regress to 100vw which includes scrollbar width and creates edge gaps.
// See README validation #7.
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
