import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // V8: the SDK and React ship as separate cacheable chunks instead of
        // one 714 kB bundle.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('react')) return 'react'
          if (id.includes('genlayer-js')) return 'genlayer'
          return 'vendor'
        },
      },
    },
  },
  server: {
    proxy: {
      '/api/rpc': {
        target: 'https://studio.genlayer.com/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/rpc/, '')
      }
    }
  }
})
