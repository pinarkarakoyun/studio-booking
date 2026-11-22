import styles from './PublicSite.module.css';

// Sık sorulanlar. İptal cevabındaki saat ve gün Ayarlar'dan gelir (yönetici değiştirince site de değişir);
// stüdyoya özel bilgiler (grup büyüklüğü, aletler) site.json'dan, yoksa genel bir cümle. Paket modelinde telafi
// yerine paket kuralı anlatılır.
function cancelAnswer(rules, packageModel, lateCancelBurnsSession) {
  const { cancellationDeadlineHours: hours, creditValidityDays: days } = rules ?? {};
  if (packageModel) {
    const before =
      hours != null
        ? `Dersten ${hours} saat öncesine kadar uygulamadan iptal edersen seansın paketinden düşmez.`
        : 'Dersten önce uygulamadan iptal edersen seansın paketinden düşmez.';
    return lateCancelBurnsSession ? `${before} Daha geç iptallerde seans kullanılmış sayılır.` : before;
  }
  return hours != null && days != null
    ? `Dersten ${hours} saat öncesine kadar uygulamadan bildirirsen bir telafi hakkı kazanırsın; bu hakla ${days} gün içinde başka bir derse gelebilirsin.`
    : 'Dersten önce uygulamadan bildirirsen bir telafi hakkı kazanırsın ve başka bir derse gelebilirsin.';
}

function buildQuestions(site, packageModel, lateCancelBurnsSession) {
  return [
    { q: 'Dersime gelemezsem ne olur?', a: cancelAnswer(site.rules, packageModel, lateCancelBurnsSession) },
    { q: 'Spor geçmişim olmalı mı?', a: 'Hayır. Program senin seviyene göre başlar, eğitmen hareketleri sana göre uyarlar.' },
    { q: 'Gruplar kaç kişilik?', a: site.groupSize ?? 'Gruplar küçük tutulur; eğitmen her öğrenciyle tek tek ilgilenebilir.' },
    { q: 'Hangi aletler var?', a: site.equipment ?? 'Derslerin çoğu reformer aletiyle yapılır.' },
    packageModel
      ? { q: 'Paketim ne kadar geçerli?', a: 'Her paketin bir son günü var; kalan seansını ve son gününü uygulamada görürsün.' }
      : { q: 'Üyeliğimi dondurabilir miyim?', a: 'Evet. Dondurduğun gün kadar üyeliğin uzar.' },
    { q: 'Ders saatlerini nasıl öğrenirim?', a: 'Gruplar zaman zaman değiştiği için WhatsApp’tan sor; sana uygun saati söyleyelim.' },
    { q: 'İlk derse ne giymeliyim?', a: 'Rahat, vücudu saran bir spor kıyafeti ve kaymaz çorap yeterli.' },
  ];
}

export default function Faq({ site, packageModel, lateCancelBurnsSession }) {
  return (
    <section id="sss" className={`${styles.section} ${styles.narrow}`} aria-labelledby="sss-baslik">
      <p className={styles.eyebrow}>Sık sorulanlar</p>
      <h2 id="sss-baslik" className={styles.sectionTitle}>
        Merak ettiklerin
      </h2>
      <div className={styles.faq}>
        {buildQuestions(site, packageModel, lateCancelBurnsSession).map((item, index) => (
          <details key={item.q} className={styles.faqItem} open={index === 0}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
