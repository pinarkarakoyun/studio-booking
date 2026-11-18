import { useEffect, useState } from 'react';
import { api, ApiError } from './api.js';
import RootPage from './site/RootPage.jsx';
import StudioNotFound from './site/StudioNotFound.jsx';

// Açılışta "bu adres ne?" sorusunu bir kez sorar (/api/studio) ve üç durumu ayırır:
//   404              -> adres hiçbir stüdyoya ait değil: "Stüdyo bulunamadı"
//   { studio: null } -> ürünün kök adresi: kök sayfa (/giris açılsa bile; giriş için stüdyo gerekir)
//   stüdyo bilgisi   -> bugünkü site ve uygulama (children: main.jsx'teki adres seçimi)
// Ağ hatası ya da sunucu hatası (5xx) "bulunamadı" sayılmaz: sunucu bir anlığına kapalıysa üyeye
// "stüdyon yok" demek yanlış olur. O durumda bugünkü ekran açılır, o da kendi hatasını gösterir.
export default function HostGate({ children }) {
  const [kind, setKind] = useState('loading');

  useEffect(() => {
    api('/api/studio').then(
      ({ studio }) => setKind(studio ? 'studio' : 'root'),
      (err) => setKind(err instanceof ApiError && err.status === 404 ? 'unknown' : 'studio'),
    );
  }, []);

  // Cevap gelene kadar boş: yanlış ekranın bir anlığına görünüp kaybolmasındansa (ör. kök adreste site) daha iyi.
  if (kind === 'loading') return null;
  if (kind === 'unknown') return <StudioNotFound />;
  if (kind === 'root') return <RootPage />;
  return children;
}
