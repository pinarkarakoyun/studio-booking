import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import {
  BookingError,
  bookMakeup,
  cancelMakeup,
  cancelSession,
  swapSession,
  undoCancel,
} from '../src/services/booking.js';
import {
  createCustomer,
  createGroup,
  createSession,
  createStudio,
  grantCredit,
  occupancy,
  pool,
  resetDb,
} from './helpers.js';

// assert.rejects için: hatanın BookingError olduğunu ve kodunu kontrol eder.
const bookingError = (code) => (err) => err instanceof BookingError && err.code === code;

beforeEach(resetDb);
after(() => pool.end());

describe('cancelSession', () => {
  test('creates a credit that expires N days after the missed session and frees the spot', async () => {
    const studio = await createStudio({ creditValidityDays: 7 });
    const group = await createGroup(studio);
    const session = await createSession(group, 72);
    const user = await createCustomer(studio, group);

    await cancelSession({ userId: user, sessionId: session });

    const { rows: [credit] } = await pool.query(
      `SELECT c.expires_at = s.starts_at + interval '7 days' AS correct_expiry
       FROM credits c JOIN sessions s ON s.id = c.source_session_id WHERE c.user_id = $1`,
      [user],
    );
    assert.equal(credit.correct_expiry, true);
    assert.equal((await occupancy(session)).regular_count, 0);
  });

  test('rejects cancelling the same session twice', async () => {
    const studio = await createStudio();
    const group = await createGroup(studio);
    const session = await createSession(group, 72);
    const user = await createCustomer(studio, group);

    await cancelSession({ userId: user, sessionId: session });
    await assert.rejects(
      cancelSession({ userId: user, sessionId: session }),
      bookingError('ALREADY_CANCELLED'),
    );
  });

  test('rejects cancelling after the deadline', async () => {
    const studio = await createStudio({ cancellationDeadlineHours: 2 });
    const group = await createGroup(studio);
    const session = await createSession(group, 1); // 1 saat sonra, son iptal 2 saat önceydi
    const user = await createCustomer(studio, group);

    await assert.rejects(
      cancelSession({ userId: user, sessionId: session }),
      bookingError('CANCELLATION_DEADLINE_PASSED'),
    );
  });

  test('gives no credit for a session during a freeze', async () => {
    const studio = await createStudio();
    const group = await createGroup(studio);
    const session = await createSession(group, 72);
    const user = await createCustomer(studio, group);
    await pool.query(`INSERT INTO freezes (user_id, starts_on) VALUES ($1, current_date)`, [user]);

    await assert.rejects(
      cancelSession({ userId: user, sessionId: session }),
      bookingError('USER_FROZEN'),
    );
  });

  test('rejects a session outside the customer group', async () => {
    const studio = await createStudio();
    const otherGroup = await createGroup(studio);
    const session = await createSession(otherGroup, 72);
    const user = await createCustomer(studio, await createGroup(studio));

    await assert.rejects(
      cancelSession({ userId: user, sessionId: session }),
      bookingError('NOT_A_MEMBER'),
    );
  });
});

describe('bookMakeup', () => {
  test('uses a credit and takes a spot', async () => {
    const studio = await createStudio();
    const target = await createSession(await createGroup(studio), 48);
    const user = await createCustomer(studio);
    await grantCredit(user);

    await bookMakeup({ userId: user, sessionId: target });

    assert.equal((await occupancy(target)).makeup_count, 1);
  });

  test('rejects a full session', async () => {
    const studio = await createStudio();
    const group = await createGroup(studio, { capacity: 1 });
    const target = await createSession(group, 48);
    await createCustomer(studio, group); // tek yeri dolduran düzenli üye
    const user = await createCustomer(studio);
    await grantCredit(user);

    await assert.rejects(bookMakeup({ userId: user, sessionId: target }), bookingError('SESSION_FULL'));
  });

  test('rejects without a usable credit', async () => {
    const studio = await createStudio();
    const target = await createSession(await createGroup(studio), 48);
    const user = await createCustomer(studio);

    await assert.rejects(bookMakeup({ userId: user, sessionId: target }), bookingError('NO_CREDIT'));
  });

  test('rejects a credit that expires before the make-up session', async () => {
    const studio = await createStudio();
    const target = await createSession(await createGroup(studio), 24 * 10);
    const user = await createCustomer(studio);
    await grantCredit(user, 5); // 5 gün geçerli, ders 10 gün sonra

    await assert.rejects(bookMakeup({ userId: user, sessionId: target }), bookingError('NO_CREDIT'));
  });

  test('rejects booking a regular session the customer already attends', async () => {
    const studio = await createStudio();
    const group = await createGroup(studio);
    const session = await createSession(group, 48);
    const user = await createCustomer(studio, group);
    await grantCredit(user);

    await assert.rejects(bookMakeup({ userId: user, sessionId: session }), bookingError('ALREADY_ATTENDING'));
  });

  test('enforces the monthly make-up limit', async () => {
    const studio = await createStudio({ maxMakeupsPerMonth: 1 });
    // Aynı ay içinde kalsınlar diye birbirine yakın iki ders (aynı günde oldukları için iki ayrı grup).
    const first = await createSession(await createGroup(studio), 3);
    const second = await createSession(await createGroup(studio), 4);
    const user = await createCustomer(studio);
    await grantCredit(user);
    await grantCredit(user);

    const { rows: [sameMonth] } = await pool.query(
      `SELECT count(DISTINCT date_trunc('month', date)) = 1 AS same FROM sessions`,
    );
    if (!sameMonth.same) return; // ay sonuna denk gelen nadir çalıştırmada test anlamsız olur

    await bookMakeup({ userId: user, sessionId: first });
    await assert.rejects(
      bookMakeup({ userId: user, sessionId: second }),
      bookingError('MONTHLY_MAKEUP_LIMIT'),
    );
  });
});

describe('swapSession ("bu ders yerine şuna gel")', () => {
  test('cancels the regular session and books the make-up together', async () => {
    const studio = await createStudio();
    const group = await createGroup(studio);
    const monday = await createSession(group, 72);
    const saturday = await createSession(await createGroup(studio), 24);
    const user = await createCustomer(studio, group);

    await swapSession({ userId: user, fromSessionId: monday, toSessionId: saturday });

    assert.equal((await occupancy(monday)).regular_count, 0);
    assert.equal((await occupancy(saturday)).makeup_count, 1);
  });

  test('leaves the regular session untouched when the make-up session is full', async () => {
    const studio = await createStudio();
    const group = await createGroup(studio);
    const monday = await createSession(group, 72);
    const fullGroup = await createGroup(studio, { capacity: 1 });
    const saturday = await createSession(fullGroup, 24);
    await createCustomer(studio, fullGroup);
    const user = await createCustomer(studio, group);

    await assert.rejects(
      swapSession({ userId: user, fromSessionId: monday, toSessionId: saturday }),
      bookingError('SESSION_FULL'),
    );
    // Transaction geri alındı: iptal de yapılmadı, kredi de oluşmadı.
    assert.equal((await occupancy(monday)).regular_count, 1);
    const { rowCount } = await pool.query('SELECT 1 FROM credits');
    assert.equal(rowCount, 0);
  });
});

describe('undoCancel', () => {
  test('restores the customer when there is still room', async () => {
    const studio = await createStudio();
    const group = await createGroup(studio);
    const session = await createSession(group, 72);
    const user = await createCustomer(studio, group);
    await cancelSession({ userId: user, sessionId: session });

    await undoCancel({ userId: user, sessionId: session });

    assert.equal((await occupancy(session)).regular_count, 1);
  });

  test('fails when someone took the freed spot', async () => {
    const studio = await createStudio();
    const group = await createGroup(studio, { capacity: 1 });
    const session = await createSession(group, 72);
    const user = await createCustomer(studio, group);
    const other = await createCustomer(studio);
    await grantCredit(other);

    await cancelSession({ userId: user, sessionId: session });
    await bookMakeup({ userId: other, sessionId: session });

    await assert.rejects(undoCancel({ userId: user, sessionId: session }), bookingError('SESSION_FULL'));
  });

  test('fails when the credit was already used', async () => {
    const studio = await createStudio();
    const group = await createGroup(studio);
    const monday = await createSession(group, 72);
    const saturday = await createSession(await createGroup(studio), 24);
    const user = await createCustomer(studio, group);
    await swapSession({ userId: user, fromSessionId: monday, toSessionId: saturday });

    await assert.rejects(
      undoCancel({ userId: user, sessionId: monday }),
      bookingError('CREDIT_ALREADY_USED'),
    );
  });
});

describe('cancelMakeup', () => {
  async function setupMakeup(settings) {
    const studio = await createStudio(settings);
    const target = await createSession(await createGroup(studio), 48);
    const user = await createCustomer(studio);
    await grantCredit(user);
    await bookMakeup({ userId: user, sessionId: target });
    return { user, target };
  }

  test('returns the credit when the studio refunds', async () => {
    const { user, target } = await setupMakeup({ refundCreditOnMakeupCancel: true });

    const result = await cancelMakeup({ userId: user, sessionId: target });

    assert.equal(result.refunded, true);
    assert.equal((await occupancy(target)).makeup_count, 0);
    // Hak geri geldi: aynı derse tekrar telafi yazdırabilir.
    await bookMakeup({ userId: user, sessionId: target });
  });

  test('burns the credit when the studio does not refund', async () => {
    const { user, target } = await setupMakeup({ refundCreditOnMakeupCancel: false });

    const result = await cancelMakeup({ userId: user, sessionId: target });

    assert.equal(result.refunded, false);
    assert.equal((await occupancy(target)).makeup_count, 0);
    await assert.rejects(bookMakeup({ userId: user, sessionId: target }), bookingError('NO_CREDIT'));
  });
});

describe('studio settings', () => {
  test('undo cancel can be turned off', async () => {
    const studio = await createStudio({ allowUndoCancel: false });
    const group = await createGroup(studio);
    const session = await createSession(group, 72);
    const user = await createCustomer(studio, group);
    await cancelSession({ userId: user, sessionId: session });

    await assert.rejects(
      undoCancel({ userId: user, sessionId: session }),
      bookingError('UNDO_CANCEL_DISABLED'),
    );
  });

  test('make-up booking closes N minutes before the session', async () => {
    const studio = await createStudio({ makeupBookingCutoffMinutes: 60 });
    const soon = await createSession(await createGroup(studio), 0.5); // 30 dk sonra
    const later = await createSession(await createGroup(studio), 2);
    const user = await createCustomer(studio);
    await grantCredit(user);

    await assert.rejects(bookMakeup({ userId: user, sessionId: soon }), bookingError('MAKEUP_BOOKING_CLOSED'));
    await bookMakeup({ userId: user, sessionId: later });
  });

  describe('when make-up before the missed session is not allowed', () => {
    const settings = { allowMakeupBeforeMissed: false };

    test('swap to an earlier session is rejected with a clear reason', async () => {
      const studio = await createStudio(settings);
      const group = await createGroup(studio);
      const monday = await createSession(group, 72);
      const saturday = await createSession(await createGroup(studio), 24);
      const user = await createCustomer(studio, group);

      await assert.rejects(
        swapSession({ userId: user, fromSessionId: monday, toSessionId: saturday }),
        bookingError('MAKEUP_BEFORE_MISSED_NOT_ALLOWED'),
      );
      assert.equal((await occupancy(monday)).regular_count, 1); // iptal de geri alındı
    });

    test('swap to a later session still works', async () => {
      const studio = await createStudio(settings);
      const group = await createGroup(studio);
      const monday = await createSession(group, 24);
      const thursday = await createSession(await createGroup(studio), 72);
      const user = await createCustomer(studio, group);

      await swapSession({ userId: user, fromSessionId: monday, toSessionId: thursday });
      assert.equal((await occupancy(thursday)).makeup_count, 1);
    });

    test('a credit from a later session cannot be used earlier, a granted credit can', async () => {
      const studio = await createStudio(settings);
      const group = await createGroup(studio);
      const monday = await createSession(group, 72);
      const saturday = await createSession(await createGroup(studio), 24);
      const user = await createCustomer(studio, group);
      await cancelSession({ userId: user, sessionId: monday });

      await assert.rejects(bookMakeup({ userId: user, sessionId: saturday }), bookingError('NO_CREDIT'));

      await grantCredit(user); // kaynağı olmayan, yöneticinin verdiği hak
      await bookMakeup({ userId: user, sessionId: saturday });
    });
  });
});

describe('concurrency: aynı anda son yer', () => {
  test('ten customers racing for one free spot: exactly one wins', async () => {
    const studio = await createStudio();
    const group = await createGroup(studio, { capacity: 1 });
    const target = await createSession(group, 48);

    const users = [];
    for (let i = 0; i < 10; i += 1) {
      const user = await createCustomer(studio);
      await grantCredit(user);
      users.push(user);
    }

    // Bağlantıları önceden aç. Yoksa her istek önce yeni bağlantı kurmakla (kimlik doğrulama)
    // milisaniyeler harcar, ilk istek diğerleri başlamadan biter ve yarış hiç yaşanmaz:
    // test, kilit olmasa bile geçerdi (denendi).
    const warm = await Promise.all(users.map(() => pool.connect()));
    warm.forEach((client) => client.release());

    // Promise.allSettled: on isteği aynı anda başlatır ve hepsinin bitmesini bekler.
    const results = await Promise.allSettled(
      users.map((userId) => bookMakeup({ userId, sessionId: target })),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const full = results.filter((r) => r.status === 'rejected' && r.reason.code === 'SESSION_FULL');
    assert.equal(succeeded.length, 1);
    assert.equal(full.length, 9);
    assert.equal((await occupancy(target)).booked_count, 1);
  });

  test('one customer booking two sessions at once does not spend the same credit twice', async () => {
    const studio = await createStudio();
    const first = await createSession(await createGroup(studio), 48);
    const second = await createSession(await createGroup(studio), 50);
    const user = await createCustomer(studio);
    await grantCredit(user); // tek hak

    const results = await Promise.allSettled([
      bookMakeup({ userId: user, sessionId: first }),
      bookMakeup({ userId: user, sessionId: second }),
    ]);

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const { rows: [used] } = await pool.query(
      'SELECT count(*)::int AS n FROM credits WHERE used_session_id IS NOT NULL',
    );
    assert.equal(used.n, 1);
  });
});
