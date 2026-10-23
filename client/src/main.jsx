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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
