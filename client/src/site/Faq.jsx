import styles from './PublicSite.module.css';

// Sık sorulanlar. İptal/telafi cevabındaki saat ve gün Ayarlar'dan gelir (yönetici değiştirince site de değişir);
// stüdyoya özel bilgiler (grup büyüklüğü, aletler) site.json'dan, yoksa genel bir cümle.
function buildQuestions(site) {
  const { cancellationDeadlineHours: hours, creditValidityDays: days } = site.rules ?? {};
  const cancelRule =
    hours != null && days != null
      ? `Dersten ${hours} saat öncesine kadar uygulamadan bildirirsen bir telafi hakkı kazanırsın; bu hakla ${days} gün içinde başka bir derse gelebilirsin.`
      : 'Dersten önce uygulamadan bildirirsen bir telafi hakkı kazanırsın ve başka bir derse gelebilirsin.';
  return [
    { q: 'Dersime gelemezsem ne olur?', a: cancelRule },
    { q: 'Spor geçmişim olmalı mı?', a: 'Hayır. Program senin seviyene göre başlar, eğitmen hareketleri sana göre uyarlar.' },
    {
      q: 'Gruplar kaç kişilik?',
      a: site.groupSize ?? 'Gruplar küçük tutulur; eğitmen her öğrenciyle tek tek ilgilenebilir.',
    },
    { q: 'Hangi aletler var?', a: site.equipment ?? 'Derslerin çoğu reformer aletiyle yapılır.' },
    { q: 'Üyeliğimi dondurabilir miyim?', a: 'Evet. Dondurduğun gün kadar üyeliğin uzar.' },
    { q: 'Ders saatlerini nasıl öğrenirim?', a: 'Gruplar zaman zaman değiştiği için WhatsApp’tan sor; sana uygun saati söyleyelim.' },
    { q: 'İlk derse ne giymeliyim?', a: 'Rahat, vücudu saran bir spor kıyafeti ve kaymaz çorap yeterli.' },
  ];
}

export default function Faq({ site }) {
  return (
    <section id="sss" className={styles.band} aria-labelledby="sss-baslik">
      <div className={`${styles.inner} ${styles.narrow}`}>
        <h2 id="sss-baslik" className={`${styles.heading} ${styles.onLight}`}>
          Sık sorulanlar
        </h2>
        {buildQuestions(site).map((item, index) => (
          <details key={item.q} className={styles.faqItem} open={index === 0}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
