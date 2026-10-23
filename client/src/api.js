// Sunucuyla konuşan tek yer. Her ekran fetch'i doğrudan değil bunu kullanır; böylece hata biçimi,
// JSON çözme ve "sunucuya ulaşılamıyor" durumu tek bir yerde ele alınır.

// Sunucunun { error: { code, message } } cevabını taşıyan hata. Ekran `code`a göre davranır,
// `message`ı kullanıcıya gösterir (mesajlar sunucuda Türkçe ve "sen" diliyle yazılı).
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // fetch sadece ağ hatasında (sunucu kapalı, internet yok) hata fırlatır.
    throw new ApiError(0, 'NETWORK', 'Sunucuya ulaşılamıyor. İnternet bağlantını kontrol et.');
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error?.code ?? 'UNKNOWN',
      data?.error?.message ?? 'Beklenmeyen bir hata oluştu. Biraz sonra tekrar dene.',
    );
  }
  return data;
}
