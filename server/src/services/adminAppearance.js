import pool from '../db/pool.js';
import { AppError } from '../errors.js';
import { DEFAULT_ACCENT, DEFAULT_BRAND, buildPalette } from '../theme/palette.js';

// Görünüm ayarı: stüdyonun ana rengi ve vurgu rengi (studios.brand_color, studios.accent_color). Bütün tonlar
// bunlardan türetilir (theme/palette.js) ve /brand/theme.css olarak sunulur. null = varsayılan renk.

// Renk girişi: null, boş metin ya da #rrggbb (büyük/küçük harf kabul, boşluk kırpılır, küçük harfle saklanır).
// "#fff" gibi kısa biçim ve başka her şey reddedilir: değer CSS'e yazıldığı için yalnızca bu biçim güvenli.
export function parseColor(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  }
  throw new AppError('INVALID_COLOR', 'Renk #rrggbb biçiminde olmalı.', 400);
}

function parseInput(input) {
  return { brand: parseColor(input?.brandColor), accent: parseColor(input?.accentColor) };
}

const toDto = (brand, accent) => ({ brandColor: brand, accentColor: accent, warnings: buildPalette({ brand, accent }).warnings });

export async function getAppearance(admin, { db = pool } = {}) {
  const { rows: [row] } = await db.query('SELECT brand_color, accent_color FROM studios WHERE id = $1', [admin.studio_id]);
  return toDto(row.brand_color?.toLowerCase() ?? null, row.accent_color?.toLowerCase() ?? null);
}

// Stüdyo istekten değil yöneticinin hesabından gelir: bir yönetici yalnızca kendi stüdyosunu değiştirebilir.
export async function updateAppearance(admin, input, { db = pool } = {}) {
  const { brand, accent } = parseInput(input);
  await db.query('UPDATE studios SET brand_color = $1, accent_color = $2 WHERE id = $3', [brand, accent, admin.studio_id]);
  return toDto(brand, accent);
}

// Kaydetmeden önizleme: panel renk hesaplamaz, hesap tek yerde (palette.js) kalır. Boş renk yerine varsayılan
// renk hesaplanır: önizleme kutusu her zaman bütün değişkenleri alır ve sayfanın kayıtlı rengini miras almaz.
export function previewAppearance(input) {
  const { brand, accent } = parseInput(input);
  return buildPalette({ brand: brand ?? DEFAULT_BRAND, accent: accent ?? DEFAULT_ACCENT });
}
