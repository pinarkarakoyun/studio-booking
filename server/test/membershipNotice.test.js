// Üye ana ekranındaki uyarı şeridinin kuralı (client/src/membershipNotice.js). Saf fonksiyon; istemcide test
// çalıştırıcı olmadığı için burada sınanır.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { membershipNotice } from '../../client/src/membershipNotice.js';

const today = '2026-11-27';
const base = { packageModel: false, reminderDays: 7, today };

describe('membership notice', () => {
  test('group model: nothing while the end is far away', () => {
    assert.equal(membershipNotice({ ...base, membership: { endsOn: '2026-12-20', ended: false } }), null);
    assert.equal(membershipNotice({ ...base, membership: null }), null);
  });

  test('group model: days left within the reminder window, today, and ended', () => {
    assert.equal(membershipNotice({ ...base, membership: { endsOn: '2026-12-04', ended: false } }), 'Üyeliğin 7 gün sonra bitiyor.');
    assert.equal(membershipNotice({ ...base, membership: { endsOn: '2026-11-28', ended: false } }), 'Üyeliğin yarın bitiyor.');
    assert.equal(membershipNotice({ ...base, membership: { endsOn: '2026-11-27', ended: false } }), 'Üyeliğin bugün bitiyor.');
    assert.equal(membershipNotice({ ...base, membership: { endsOn: '2026-11-20', ended: true } }), 'Üyeliğin 20 Kasım tarihinde bitti.');
  });

  test('package model: no package, finished, expired and ending soon', () => {
    const pkg = { ...base, packageModel: true };
    assert.equal(membershipNotice({ ...pkg, membership: null }), 'Henüz bir paketin yok.');
    assert.equal(
      membershipNotice({ ...pkg, membership: { sessionCount: 8, remaining: 0, endsOn: '2026-12-20', ended: false } }),
      'Paketindeki seanslar bitti.',
    );
    assert.equal(
      membershipNotice({ ...pkg, membership: { sessionCount: 8, remaining: 3, endsOn: '2026-11-20', ended: true } }),
      'Paketinin son günü 20 Kasım tarihinde geçti.',
    );
    assert.equal(
      membershipNotice({ ...pkg, membership: { sessionCount: 8, remaining: 3, endsOn: '2026-11-30', ended: false } }),
      'Paketinin son günü 3 gün sonra.',
    );
    assert.equal(
      membershipNotice({ ...pkg, membership: { sessionCount: 8, remaining: 3, endsOn: '2026-12-20', ended: false } }),
      null,
    );
  });
});
