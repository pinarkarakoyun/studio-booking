// Ek ders (haftalık programın dışında tek seferlik ders) için ekran yardımcıları.

// Başlık verilmezse sunucu dersin adını bu yazar (server/src/services/adminExtraSessions.js, DEFAULT_EXTRA_TITLE).
export const DEFAULT_EXTRA_TITLE = 'Ek ders';

// "Ek ders" etiketi: dersin adı zaten "Ek ders" ise tekrar etmesin ("Ek ders Ek ders"); özel başlıklı
// ek derste ("Cumartesi telafi") etiket dersin ek ders olduğunu söyler.
export const showExtraTag = (session) => session.kind === 'extra' && session.groupName !== DEFAULT_EXTRA_TITLE;
