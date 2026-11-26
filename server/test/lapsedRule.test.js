import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { daysBetween, isLapsed } from '../src/services/lapsedRule.js';

const today = '2026-11-26';
const base = { joinedOn: '2026-01-01', isFrozenToday: false, today };

describe('isLapsed', () => {
  test('29 days is not lapsed, 30 and more is', () => {
    assert.equal(isLapsed({ ...base, lastVisitOn: '2026-10-28' }), false); // 29 gün
    assert.equal(isLapsed({ ...base, lastVisitOn: '2026-10-27' }), true); // 30 gün
    assert.equal(isLapsed({ ...base, lastVisitOn: '2026-08-01' }), true);
  });

  test('frozen members are never lapsed', () => {
    assert.equal(isLapsed({ ...base, lastVisitOn: '2026-08-01', isFrozenToday: true }), false);
  });

  test('never came: counted from the day the account was opened', () => {
    assert.equal(isLapsed({ ...base, lastVisitOn: null, joinedOn: '2026-11-10' }), false);
    assert.equal(isLapsed({ ...base, lastVisitOn: null, joinedOn: '2026-10-27' }), true);
  });

  test('daysBetween counts calendar days across month ends', () => {
    assert.equal(daysBetween('2026-10-31', '2026-11-01'), 1);
    assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2); // yaz saati geçişi gün kaydırmaz
  });
});
