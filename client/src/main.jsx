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
import PublicSite from './site/PublicSite.jsx'

// Ana adres (/) herkese açık tanıtım sitesi; giriş ve uygulama /giris altında.
// Tek bir yönlendirme kararı olduğu için ayrı bir kütüphane (router) eklemiyoruz.
const isApp = window.location.pathname.startsWith('/giris')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isApp ? <App /> : <PublicSite />}
  </StrictMode>,
)
