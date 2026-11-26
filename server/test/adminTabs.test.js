// Yönetici panelinin sekme kuralları (client/src/admin/permissions.js). Saf fonksiyonlar; istemcide test çalıştırıcı
// olmadığı için burada sınanır.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mobileTabs, visibleTabs } from '../../client/src/admin/permissions.js';

const ids = (tabs) => tabs.map((t) => t.id);
const admin = { role: 'admin' };
const instructor = (permissions) => ({ role: 'instructor', permissions });

describe('admin tabs', () => {
  test('desktop order is unchanged', () => {
    assert.deepEqual(ids(visibleTabs(admin)), ['today', 'dashboard', 'customers', 'groups', 'instructors', 'payments', 'settings']);
  });

  test('admin phone bar: four main tabs, the rest under "Daha fazla"', () => {
    const { primary, more } = mobileTabs(admin);
    assert.deepEqual(ids(primary), ['today', 'customers', 'payments', 'dashboard']);
    assert.deepEqual(ids(more), ['groups', 'instructors', 'settings']);
  });

  test('instructors have few tabs: all on the bar, no "Daha fazla"', () => {
    const full = mobileTabs(instructor({ view_customers: true, manage_groups: true }));
    assert.deepEqual(ids(full.primary), ['today', 'customers', 'groups']);
    assert.deepEqual(full.more, []);

    const none = mobileTabs(instructor({}));
    assert.deepEqual(ids(none.primary), ['today']);
    assert.deepEqual(none.more, []);
  });
});
