import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// In dev, the FastAPI backend runs on :8000 and Vite proxies to it.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/samples': 'http://localhost:8000',
    },
  },
  build: { chunkSizeWarningLimit: 4000 },
})
