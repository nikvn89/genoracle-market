import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
