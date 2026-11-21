import { formatPhone } from '../format.js';

// Tanıtım sitesinin bölümleri arasında paylaşılan küçük yardımcılar.

export const LOGIN_PATH = '/giris';

const digits = (phone) => phone.replace(/\D/g, '').replace(/^0/, '90');

// WhatsApp bağlantısı: numara yoksa null (o buton hiç çizilmez). Mesaj sabittir; ziyaretçinin seçtiği
// hiçbir şey (ör. testteki cevaplar) mesaja eklenmez.
export function whatsappLink(phone, message) {
  return phone ? `https://wa.me/${digits(phone)}?text=${encodeURIComponent(message)}` : null;
}

// Gösterilecek numara: site.json'daki telefon olduğu gibi; veritabanındaki WhatsApp numarası (+90…) okunur biçimde.
export function displayPhone(phone) {
  return phone?.startsWith('+') ? formatPhone(phone) : phone;
}

export function telLink(phone) {
  return phone ? `tel:+${digits(phone)}` : null;
}

// Şubeler bölümü gösterilecek bir şey var mı: birden çok şube, ya da adres / açıklama / program.
export function hasBranchContent(site) {
  const branches = site.branches ?? [];
  return (
    branches.length > 1 ||
    Boolean(site.address) ||
    branches.some((b) => b.address || b.description || b.schedule?.length)
  );
}

// Sayfada görünen bölümler, sırasıyla. Menü ve sayfa aynı listeyi kullanır: içeriği olmayan bölüm hem sayfada
// hem menüde yoktur. "label" olmayan bölüm menüde görünmez.
export function visibleSections(site) {
  return [
    { id: 'neden-biz', show: true },
    { id: 'dersler', label: 'Dersler', show: site.courses?.length > 0 },
    { id: 'test', show: Boolean(site.quiz) },
    { id: 'program', label: site.spotlight?.eyebrow ?? 'Program', show: Boolean(site.spotlight) },
    { id: 'subeler', label: site.branches?.length > 1 ? 'Şubeler' : 'Stüdyo', show: hasBranchContent(site) },
    { id: 'egitmen', label: 'Eğitmen', show: Boolean(site.instructor?.name) },
    { id: 'isleyis', label: 'Nasıl işler', show: true },
    { id: 'sss', label: 'SSS', show: true },
  ].filter((section) => section.show);
}

