// Kalan seans halkası (prototipteki üye ekranı): dolu yay kalan seansı, ortadaki sayı kalan seans sayısını gösterir.
// Renkler kartın renginden gelir (currentColor): koyu kartta açık yay, soluk iz.
const RADIUS = 52;
const STROKE = 10;

// SVG'de yay, çemberin çizgisini "kesikli" yaparak çizilir: stroke-dasharray="<dolu uzunluk> <boşluk uzunluğu>".
// Çemberin çevresi C = 2πr. Kalan/toplam oranı kadarı dolu, gerisi boş olmalı.
// Örnek: 12 seanstan 6'sı kaldıysa yarım halka → "163.4 326.7".
// Dönen değer: stroke-dasharray metni, ör. "163.4 326.7".
function ringDash(remaining, total, radius = RADIUS) {
  const circumference = 2 * Math.PI * radius;
  // Oran 0 ile 1 arasında tutulur: toplam 0 ise boş halka (sıfıra bölme yok), fazla ya da eksi değer taşmaz.
  const share = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;
  return `${(circumference * share).toFixed(1)} ${circumference.toFixed(1)}`;
}

export default function PackageRing({ remaining, total, size = 120 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={`${total} seanstan ${remaining} seans kaldı`}
    >
      <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth={STROKE} />
      {/* Boşken yay hiç çizilmez: yuvarlak çizgi ucu (round) sıfır uzunluktaki yayı bile nokta olarak gösterirdi. */}
      {remaining > 0 && total > 0 && (
        <circle
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={ringDash(remaining, total)}
          transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(.2,.7,.2,1)' }}
        />
      )}
      <text x="60" y="62" textAnchor="middle" fontFamily="var(--font-brand)" fontSize="40" fontWeight="700" fill="currentColor" style={{ fontVariantNumeric: 'lining-nums' }}>
        {remaining}
      </text>
      <text x="60" y="84" textAnchor="middle" fontFamily="var(--font-ui)" fontSize="12" fill="currentColor" opacity="0.85">
        seans kaldı
      </text>
    </svg>
  );
}
