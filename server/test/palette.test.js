import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DEFAULT_ACCENT, DEFAULT_BRAND, WARNINGS, buildPalette, contrastRatio, themeCss } from '../src/theme/palette.js';

// Palet modülü: iki renkten (ana, vurgu) bütün tema tonları ve okunurluk uyarıları. Veritabanı yok.
const COLOURS = ['#4b5530', '#ffffff', '#ffff00', '#000000', '#e91e63', '#1565c0', '#777777', '#a0d8ef'];
const HEX = /^#[0-9a-f]{6}$/;
const SURFACES = ['--surface', '--surface-raised', '--surface-sunken'];
const EXPECTED_NAMES = [
  '--brand', '--brand-strong', '--brand-soft', '--on-brand', '--on-brand-soft',
  '--accent', '--accent-text', '--accent-hover', '--accent-disabled',
  '--surface', '--surface-raised', '--surface-sunken', '--line', '--line-strong',
  '--ink', '--ink-soft', '--ink-faint',
];
// client/src/index.css'teki varsayılan palet (krem ve zeytin).
const INDEX_CSS_DEFAULTS = {
  '--brand': '#4b5530', '--brand-strong': '#2f361d', '--brand-soft': '#dce0cc', '--on-brand': '#f5f0e6',
  '--on-brand-soft': '#e9e6d8', '--accent': '#826330', '--accent-text': '#7a5c2b', '--accent-hover': '#765a2b',
  '--accent-disabled': '#c4ab7f', '--surface': '#f5f0e6', '--surface-raised': '#fbf8f2', '--surface-sunken': '#e8e3d6',
  '--line': '#e2ddcf', '--line-strong': '#c9c6b4', '--ink': '#2f361d', '--ink-soft': '#5c5a4e', '--ink-faint': '#868372',
};

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function assertClose(actual, expected, tolerance, name) {
  const diffs = channels(actual).map((c, i) => Math.abs(c - channels(expected)[i]));
  assert.ok(Math.max(...diffs) <= tolerance, `${name}: ${actual} is not close to ${expected}`);
}

describe('palette', () => {
  test('no colours means no overrides', () => {
    assert.deepEqual(buildPalette({ brand: null, accent: null }), { vars: {}, warnings: [] });
  });

  test('every variable is a lower-case #rrggbb and nothing else is emitted', () => {
    for (const brand of COLOURS) {
      const { vars } = buildPalette({ brand, accent: '#826330' });
      assert.deepEqual(Object.keys(vars).sort(), [...EXPECTED_NAMES].sort());
      for (const v of Object.values(vars)) assert.match(v, HEX);
    }
    // Yalnızca biri verilse de bütün değişkenler üretilir (diğeri varsayılan).
    assert.deepEqual(Object.keys(buildPalette({ brand: null, accent: '#e91e63' }).vars).sort(), [...EXPECTED_NAMES].sort());
  });

  test('ink, ink-soft and accent-text are readable on every surface', () => {
    for (const brand of COLOURS) {
      for (const accent of COLOURS) {
        const { vars } = buildPalette({ brand, accent });
        for (const s of SURFACES) {
          for (const t of ['--ink', '--ink-soft', '--accent-text']) {
            assert.ok(contrastRatio(vars[t], vars[s]) >= 4.5, `${t} on ${s} for ${brand}/${accent}`);
          }
        }
      }
    }
  });

  test('on-brand is readable on brand and brand-strong, or a warning is returned', () => {
    for (const brand of COLOURS) {
      const { vars, warnings } = buildPalette({ brand, accent: null });
      const ok = contrastRatio(vars['--on-brand'], vars['--brand']) >= 4.5;
      assert.ok(ok || warnings.length > 0, brand);
      assert.ok(contrastRatio(vars['--on-brand'], vars['--brand-strong']) >= 4.5, brand);
    }
  });

  test('very light brand gets dark text on buttons', () => {
    for (const brand of ['#ffffff', '#ffff00']) {
      const { vars } = buildPalette({ brand, accent: null });
      // Koyu yazı: beyazla kontrastı siyahla kontrastından büyüktür.
      assert.ok(contrastRatio(vars['--on-brand'], '#ffffff') > contrastRatio(vars['--on-brand'], '#000000'), brand);
    }
  });

  test('mid-grey brand picks the better text colour and warns', () => {
    const { vars, warnings } = buildPalette({ brand: '#777777', accent: null });
    const other = contrastRatio('#ffffff', '#777777') > contrastRatio('#1a1a1a', '#777777') ? '#1a1a1a' : '#ffffff';
    assert.ok(contrastRatio(vars['--on-brand'], '#777777') >= contrastRatio(other, '#777777'));
    assert.ok(warnings.includes(WARNINGS.brandText));
  });

  test('a brand that is hard to read as text on light surfaces warns', () => {
    // --brand bağlantı, sessiz buton yazısı ve odak çerçevesi olarak açık zeminde de kullanılıyor.
    for (const brand of ['#ffffff', '#ffff00', '#00ff00', '#e91e63']) {
      assert.ok(buildPalette({ brand, accent: null }).warnings.includes(WARNINGS.brandOnSurface), brand);
    }
    for (const brand of [DEFAULT_BRAND, '#1565c0', '#000000']) {
      assert.ok(!buildPalette({ brand, accent: null }).warnings.includes(WARNINGS.brandOnSurface), brand);
    }
  });

  test('on-brand-soft is readable on brand-strong, and on brand as far as on-brand is', () => {
    for (const brand of [...COLOURS, '#00ff00']) {
      const { vars } = buildPalette({ brand, accent: null });
      const soft = vars['--on-brand-soft'];
      assert.ok(contrastRatio(soft, vars['--brand-strong']) >= 4.5, `${brand} on brand-strong`);
      const target = Math.min(4.5, contrastRatio(vars['--on-brand'], brand));
      assert.ok(contrastRatio(soft, brand) >= target - 0.05, `${brand} on brand`);
    }
  });

  test('a pale accent warns that text uses a darker shade', () => {
    assert.ok(buildPalette({ brand: null, accent: '#a0d8ef' }).warnings.length >= 1);
  });

  test('default colours reproduce the default palette closely', () => {
    const { vars, warnings } = buildPalette({ brand: DEFAULT_BRAND, accent: DEFAULT_ACCENT });
    assert.deepEqual(warnings, []);
    for (const [name, hex] of Object.entries(INDEX_CSS_DEFAULTS)) assertClose(vars[name], hex, 24, name);
  });

  test('themeCss writes only html:root declarations', () => {
    assert.doesNotMatch(themeCss({}), /--/);
    const css = themeCss(buildPalette({ brand: '#e91e63', accent: null }).vars);
    assert.match(css, /^html:root \{/m);
    assert.match(css, /--brand: #e91e63;/);
  });
});
