import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy: Geliştirmede React (5173) ve Express (3000) farklı portlarda çalışır.
    // '/api' ile başlayan istekleri Vite sunucusu Express'e iletir; böylece
    // tarayıcı aynı adrese istek attığını sanır ve CORS sorunu yaşanmaz.
    // 127.0.0.1 açıkça yazılı: Express yalnızca bu adresi dinler; "localhost" bazı sistemlerde IPv6 (::1) adresine çözülür.
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      // Stüdyo logosu gibi marka dosyaları da Express'ten gelir (repo dışındaki BRAND_DIR klasörü).
      '/brand': 'http://127.0.0.1:3000',
    },
  },
})
