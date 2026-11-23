// Stüdyonun iki renginden (ana renk, vurgu rengi) bütün tema tonlarını türetir. Sonuç client/src/index.css'teki
// rol değişkenlerini ezer; /brand/theme.css bu modülle üretilir. Veritabanına ve Express'e bağlı değildir.
//
// Tonlar sRGB'de basit karışımla (mix) türetilir: ana rengin siyahla karışımı koyu tonlar, beyazla karışımı açık
// tonlardır; krem zeminler ana renge çok hafif tonlanır. Okunurluk gereken her çift (yazı / zemin) WCAG AA eşiğine
// (4.5:1) ulaşana kadar ensureContrast ile koyulaştırılır ya da açılır. Varsayılan renkler girilince sonuç
// index.css'teki elle seçilmiş palete çok yakın çıkar (testi var).

export const DEFAULT_BRAND = '#4b5530';
export const DEFAULT_ACCENT = '#826330';
// Ton hesabı değişirse artırılır: /brand/theme.css'in ETag'ine girer, tarayıcılar yeni tonları alır.
export const PALETTE_VERSION = 1;

const AA = 4.5;
const BLACK = '#000000';
const WHITE = '#ffffff';
// Bugünkü krem zeminler (index.css); ana renge SURFACE_TINT oranında karışır.
const CREAM = { surface: '#f5f0e6', raised: '#fbf8f2', sunken: '#e8e3d6' };
const SURFACE_TINT = 0.04;

export const WARNINGS = {
  brandText: 'Bu ana renkte buton yazısı zor okunur; yazı rengi otomatik seçildi.',
  accentText: 'Vurgu rengi açık zeminde zor okunur; yazılarda koyusu kullanılacak.',
  brandOnSurface: 'Ana renk açık zeminde yazı olarak zor okunur; bağlantılar ve odak çerçevesi soluk görünebilir.',
};

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

// a'dan b'ye t oranında (0: a, 1: b) karışım.
function mix(a, b, t) {
  const [x, y] = [toRgb(a), toRgb(b)];
  return toHex(x.map((c, i) => c + (y[i] - c) * t));
}

// WCAG göreli parlaklık.
function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// color'ı, verilen bütün zeminlerde ratio'ya ulaşana kadar zeminden uzaklaştırır (açık zeminde koyulaştırır,
// koyu zeminde açar). En fazla 20 küçük adım; sonunda siyaha ya da beyaza varır.
function ensureContrast(color, backgrounds, ratio = AA) {
  const target = luminance(backgrounds[0]) > 0.18 ? BLACK : WHITE;
  let current = color;
  for (let step = 1; step <= 20 && backgrounds.some((bg) => contrastRatio(current, bg) < ratio); step += 1) {
    current = mix(color, target, step / 20);
  }
  return current;
}

export function buildPalette({ brand, accent }) {
  if (!brand && !accent) return { vars: {}, warnings: [] };
  const b = brand ?? DEFAULT_BRAND;
  const a = accent ?? DEFAULT_ACCENT;
  const warnings = [];

  const surface = mix(CREAM.surface, b, SURFACE_TINT);
  const surfaceRaised = mix(CREAM.raised, b, SURFACE_TINT);
  const surfaceSunken = mix(CREAM.sunken, b, SURFACE_TINT);
  const surfaces = [surface, surfaceRaised, surfaceSunken];

  const ink = ensureContrast(mix(b, BLACK, 0.4), surfaces);
  const inkSoft = ensureContrast(mix(ink, '#808080', 0.45), surfaces);

  // Buton yazısı: açık krem ya da çok koyu ton, ana renk üstünde hangisi daha okunursa. İkisi de eşiğe ulaşamazsa
  // kremin yerine düz beyaz denenir (orta tonlu renklerde biraz daha okunur) ve uyarı verilir.
  const better = (x, y) => (contrastRatio(x, b) >= contrastRatio(y, b) ? x : y);
  const dark = mix(ink, BLACK, 0.5);
  let onBrand = better(mix(surface, WHITE, 0.5), dark);
  if (contrastRatio(onBrand, b) < AA) {
    onBrand = better(WHITE, dark);
    if (contrastRatio(onBrand, b) < AA) warnings.push(WARNINGS.brandText);
  }
  // Koyu bantlar ve yan menü: buton yazısı onların üstünde de okunmalı.
  const brandStrong = ensureContrast(mix(b, BLACK, 0.4), [onBrand]);
  // İkincil yazı (yan menünün seçili olmayan sekmeleri gibi): koyu bantta 4.5:1; ana renk üstünde buton yazısının
  // ulaşabildiği kadar. Ulaşamıyorsa buton yazısının kendisi kullanılır.
  let onBrandSoft = ensureContrast(mix(onBrand, b, 0.12), [brandStrong]);
  if (contrastRatio(onBrandSoft, b) < Math.min(AA, contrastRatio(onBrand, b))) onBrandSoft = onBrand;
  // Ana renk açık zeminde de yazı (bağlantılar, sessiz butonlar) ve odak çerçevesi olarak kullanılıyor.
  if (contrastRatio(b, surface) < AA) warnings.push(WARNINGS.brandOnSurface);

  const accentText = ensureContrast(mix(a, BLACK, 0.06), surfaces);
  // Uyarı yalnızca vurgunun kendisi sayfa zemininde okunmuyorsa: yazılarda zaten koyusu (accent-text) kullanılıyor.
  if (contrastRatio(a, surface) < AA) warnings.push(WARNINGS.accentText);

  return {
    vars: {
      '--brand': b,
      '--brand-strong': brandStrong,
      '--brand-soft': mix(b, WHITE, 0.82),
      '--on-brand': onBrand,
      '--on-brand-soft': onBrandSoft,
      '--accent': a,
      '--accent-text': accentText,
      '--accent-hover': mix(a, BLACK, 0.1),
      '--accent-disabled': mix(a, WHITE, 0.45),
      '--surface': surface,
      '--surface-raised': surfaceRaised,
      '--surface-sunken': surfaceSunken,
      '--line': mix(surface, ink, 0.1),
      '--line-strong': mix(surface, ink, 0.2),
      '--ink': ink,
      '--ink-soft': inkSoft,
      '--ink-faint': mix(ink, '#b0b0b0', 0.68),
    },
    warnings,
  };
}

// Tema dosyasının metni. Yalnızca buildPalette'in ürettiği sabit adlar ve #rrggbb değerleri yazılır.
export function themeCss(vars) {
  const lines = Object.entries(vars).map(([name, value]) => `  ${name}: ${value};`);
  const header = '/* Stüdyonun renkleri: yönetici panelindeki Görünüm ayarından üretildi. */';
  return lines.length ? `${header}\nhtml:root {\n${lines.join('\n')}\n}\n` : `${header}\n`;
}
