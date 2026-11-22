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

// Sekme çubuğunda (role="tablist") bir tuşa basılınca hangi sekmeye geçileceği. index: şu an seçili sekme,
// count: sekme sayısı. Tuş sekme gezintisi için değilse null döner (o zaman tarayıcının kendi davranışı kalır).
// WAI-ARIA sekme kalıbı: ArrowRight sonraki, ArrowLeft önceki sekme; Home ilk, End son sekme.
// Uçlarda başa / sona döner: son sekmede ArrowRight ilk sekmeye gider (WAI-ARIA örneklerindeki davranış).
export function nextTabIndex(key, index, count) {
  switch (key) {
    case 'ArrowRight':
      return (index + 1) % count;
    case 'ArrowLeft':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

// Sekme düğmesinin onKeyDown'ı: yeni sekmeyi seçer ve odağı ona taşır. Seçili olmayan sekmeler tabIndex=-1
// olduğu için Tab tuşu sekme çubuğunda tek bir kez durur; sekmeler arasında oklarla gezilir.
export function onTabKeyDown(event, index, count, select) {
  const next = nextTabIndex(event.key, index, count);
  if (next == null || next === index) return;
  event.preventDefault();
  select(next);
  event.currentTarget.parentElement.children[next]?.focus();
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

