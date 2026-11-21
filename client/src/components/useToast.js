import { useCallback, useEffect, useState } from 'react';

// Kısa bildirim: bir işlemin sonucunu ("İptal edildi", "Kaydedildi") ekranın altında birkaç saniye gösterir.
// Kullanım: const { toast, showToast } = useToast();  …  showToast('success', 'Kaydedildi');  …  <Toast toast={toast} />
// Form hataları burada değil, alanın yanında gösterilir (kişi neyi düzelteceğini orada görür).
export function useToast(duration = 5000) {
  const [toast, setToast] = useState(null);

  // Her çağrıda yeni bir nesne: aynı metin art arda gelse de zamanlayıcı baştan başlar.
  const showToast = useCallback((tone, text) => setToast({ tone, text }), []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), duration);
    return () => clearTimeout(timer);
  }, [toast, duration]);

  return { toast, showToast };
}
