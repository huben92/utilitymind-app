import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => ({
  plugins: [vue(), tailwindcss()],
  base: mode === 'firebase' ? '/' : '/dashboard/',
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:8765' } },
}))
