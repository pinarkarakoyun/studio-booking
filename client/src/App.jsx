import { useEffect, useState } from 'react'

function App() {
  // useState: ekranda gösterilecek mesajı saklar. setMessage çağrılınca
  // React bileşeni yeniden çizer ve yeni mesaj görünür.
  const [message, setMessage] = useState('Kontrol ediliyor...')

  // useEffect: bileşen ekrana çizildikten sonra çalışır. Boş bağımlılık
  // dizisi ([]) sayesinde sadece ilk render'da bir kez çalışır.
  // (Geliştirme modunda StrictMode bunu bilerek iki kez çalıştırır; sorun değil.)
  useEffect(() => {
    // useEffect'e doğrudan async fonksiyon verilemez; bu yüzden içeride tanımlıyoruz.
    async function checkHealth() {
      try {
        // Adres '/api' ile başladığı için Vite proxy'si isteği Express'e iletir.
        const response = await fetch('/api/health')
        // fetch, 500 gibi hata kodlarında hata fırlatmaz; bu yüzden ok'u kendimiz kontrol ediyoruz.
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        setMessage('Sunucu: çalışıyor, Veritabanı: bağlı')
      } catch (err) {
        // Ağ hatası (sunucu kapalı) veya ok olmayan yanıt buraya düşer.
        console.error('Health check failed:', err)
        setMessage('Sunucuya ulaşılamıyor')
      }
    }

    checkHealth()
  }, [])

  return (
    <main className="card">
      <h1>Stüdyo Rezervasyon</h1>
      <p>{message}</p>
    </main>
  )
}

export default App
