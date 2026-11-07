import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// In dev, the FastAPI backend runs on :8000 and Vite proxies to it.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/samples': 'http://localhost:8000',
    },
  },
  build: { chunkSizeWarningLimit: 4000 },
})
