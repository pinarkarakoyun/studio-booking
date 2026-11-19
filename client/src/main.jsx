import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Yazı tipleri projenin içinden geliyor (Google Fonts değil): ziyaretçinin IP'si üçüncü tarafa gitmez,
// site daha hızlı açılır. Archivo'nun "wdth" dosyası genişlik eksenini de içerir (değişen kelime için).
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource/cormorant-garamond/400.css'
import '@fontsource/cormorant-garamond/500.css'
import '@fontsource/cormorant-garamond/500-italic.css'
import './index.css'
import App from './App.jsx'
import HostGate from './HostGate.jsx'
import PrivacyPage, { PRIVACY_PATH } from './site/PrivacyPage.jsx'
import PublicSite from './site/PublicSite.jsx'

// Stüdyonun adresinde: ana adres (/) herkese açık tanıtım sitesi; giriş ve uygulama /giris altında; KVKK metni
// /aydinlatma. Birkaç sabit adres olduğu için ayrı bir kütüphane (router) eklemiyoruz.
// HostGate önce adresin bir stüdyoya ait olup olmadığına bakar; değilse bu sayfaların hiçbiri açılmaz.
const path = window.location.pathname
const page = path.startsWith('/giris') ? <App /> : path === PRIVACY_PATH ? <PrivacyPage /> : <PublicSite />

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HostGate>{page}</HostGate>
  </StrictMode>,
)
