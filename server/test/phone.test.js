import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizePhone } from '../src/utils/phone.js';

test('normalizes the ways people write a Turkish mobile number', () => {
  for (const input of [
    '05321234567',
    '0532 123 45 67',
    '532 123 4567',
    '5321234567',
    '+90 532 123 45 67',
    '+90 (532) 123-45-67',
    '905321234567',
    ' 0532.123.45.67 ',
  ]) {
    assert.equal(normalizePhone(input), '+905321234567', input);
  }
});

test('keeps foreign numbers written with +', () => {
  assert.equal(normalizePhone('+44 7911 123456'), '+447911123456');
});

test('rejects invalid input', () => {
  for (const input of ['', '123', '0532 123 45', '1234567890', 'abc', null, undefined, 5321234567]) {
    assert.equal(normalizePhone(input), null, String(input));
  }
});
