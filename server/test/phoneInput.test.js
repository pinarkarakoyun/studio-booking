// İstemcideki telefon alanı kuralları (client/src/phoneInput.js). İstemcide test çalıştırıcı olmadığı için
// saf fonksiyonlar burada, sunucunun node:test düzeniyle sınanır.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { caretAfterDigits, formatPhoneDigits, phoneDigits } from '../../client/src/phoneInput.js';

describe('phone input', () => {
  test('phoneDigits drops the country code and the leading zero', () => {
    assert.equal(phoneDigits('+90 532 123 45 67'), '5321234567');
    assert.equal(phoneDigits('0532 123 45 67'), '5321234567');
    assert.equal(phoneDigits('905321234567'), '5321234567');
    assert.equal(phoneDigits('5321234567'), '5321234567');
    // Üye alışkanlıkla 0 yazarsa yutulur: önek zaten ekranda.
    assert.equal(phoneDigits('0'), '');
    assert.equal(phoneDigits('05'), '5');
  });

  test('phoneDigits keeps at most 10 digits and ignores other characters', () => {
    assert.equal(phoneDigits('532123456789'), '5321234567');
    assert.equal(phoneDigits('(532) 12a3'), '532123');
    // "+90"ı tuş tuş yazan da ülke kodunu yutulmuş görür: Türkiye numaraları 9 ile başlamaz.
    assert.equal(phoneDigits('9'), '9');
    assert.equal(phoneDigits('90'), '');
    assert.equal(phoneDigits('905'), '5');
    assert.equal(phoneDigits(''), '');
  });

  test('formatPhoneDigits builds (532) 123 45 67 as the user types', () => {
    assert.equal(formatPhoneDigits(''), '');
    assert.equal(formatPhoneDigits('5'), '(5');
    assert.equal(formatPhoneDigits('532'), '(532');
    assert.equal(formatPhoneDigits('5321'), '(532) 1');
    assert.equal(formatPhoneDigits('532123'), '(532) 123');
    assert.equal(formatPhoneDigits('5321234'), '(532) 123 4');
    assert.equal(formatPhoneDigits('532123456'), '(532) 123 45 6');
    assert.equal(formatPhoneDigits('5321234567'), '(532) 123 45 67');
  });

  test('caretAfterDigits puts the caret right after the n-th digit', () => {
    assert.equal(caretAfterDigits('(532) 123 45 67', 0), 0);
    assert.equal(caretAfterDigits('(532) 123 45 67', 3), 4);
    assert.equal(caretAfterDigits('(532) 123 45 67', 4), 7);
    assert.equal(caretAfterDigits('(532) 123 45 67', 10), 15);
  });
});
