import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy: Geliştirmede React (5173) ve Express (3000) farklı portlarda çalışır.
    // '/api' ile başlayan istekleri Vite sunucusu Express'e iletir; böylece
    // tarayıcı aynı adrese istek attığını sanır ve CORS sorunu yaşanmaz.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
