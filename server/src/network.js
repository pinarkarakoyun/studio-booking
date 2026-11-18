import express from 'express';

// Sunucunun dinlediği adres. Varsayılan yalnızca bu makine: uygulamaya dışarıdan doğrudan değil,
// önündeki HTTPS proxy'si (Caddy/Nginx) üzerinden ulaşılır. Port dışarıya açık olsaydı biri proxy'yi atlayıp
// düz HTTP ile bağlanabilir, sahte X-Forwarded-For başlığıyla IP sınırlarını da aşabilirdi.
// Platform barındırmasında (Render, Fly vb.) platform 0.0.0.0 isteyebilir: o zaman HOST açıkça yazılır.
export const DEFAULT_HOST = '127.0.0.1';

export function isLoopbackHost(host) {
  return host === 'localhost' || host === '::1' || /^127\.\d+\.\d+\.\d+$/.test(host);
}

// TRUST_PROXY: uygulama bir ters vekil sunucunun arkasındaysa, gerçek ziyaretçi IP'sini X-Forwarded-For
// başlığından okumak için. Örnekler: "loopback" (proxy aynı makinede; en güvenlisi), "1" (önünde tek proxy var),
// "10.0.0.0/8" (proxy bu adreslerden gelir). Boşsa kapalı.
export function trustProxySetting(value) {
  if (!value) return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

// Express'in kabul etmediği değerlerde ("true", "*") uygulama açılırken anlaşılmaz bir hatayla çöker.
// Açılış kontrolü bunu önceden yakalayıp ne yazılması gerektiğini söyler. Geçerliyse null, değilse hata metni.
export function trustProxyError(value) {
  try {
    express().set('trust proxy', trustProxySetting(value));
    return null;
  } catch (err) {
    return err.message;
  }
}
