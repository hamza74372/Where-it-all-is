// How big are partner share codes for realistic households, and which fit a QR code (≤ 2000 chars)?
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DB, uid } from '../src/db/db';
import { QR_MAX_CHARS } from '../src/lib/backup/partner';
import { loadExampleData } from '../src/state/actions';
import { makePartnerShare } from '../src/state/backupActions';
import { Store } from '../src/state/store';

const TODAY = '2026-10-06';
const bill = (name: string, amount: number, day: number) => ({
  id: uid(), name, amount, accountId: '', schedule: { kind: 'monthly' as const, anchorDate: `2026-10-${String(day).padStart(2, '0')}`, dayOfMonth: day, weekendShift: 'none' as const },
  autopay: true, isDebtMinimum: false, active: true,
});

async function exampleHousehold() {
  const store = await Store.load(await DB.open('q-' + uid(), new IDBFactory()));
  await loadExampleData(store, TODAY);
  return store;
}

describe('partner share sizes (compressed, then encrypted)', () => {
  it('measures example households against the QR limit', async () => {
    const rows: Array<[string, number]> = [];
    const measure = async (label: string, store: Store, tx = false) => {
      const share = await makePartnerShare(store, TODAY, tx, 'measure-pass');
      const len = share.code ? share.code.length : JSON.parse(share.text).data.length + 130;
      rows.push([label, len]);
      return share;
    };

    const minimal = await Store.load(await DB.open('q-' + uid(), new IDBFactory()));
    await minimal.upsert('accounts', [{ id: 'chk', name: 'Main', type: 'checking', openingBalance: 120000, includeInSafeToSpend: true, archived: false }]);
    await minimal.upsert('bills', [bill('Rent', 80000, 1), bill('Phone', 4500, 15)].map((b) => ({ ...b, accountId: 'chk' })));
    await measure('Minimal: 1 account, 2 bills', minimal);

    const ex = await exampleHousehold();
    const exampleShare = await measure('Example household: 6 bills, 4 envelopes, 2 goals, biweekly pay', ex);
    await measure('Example household + recent transactions', ex, true);

    const bigger = await exampleHousehold();
    const acct = bigger.data.accounts[0].id;
    await bigger.upsert('bills', ['Car loan', 'Insurance', 'Gym', 'Water', 'Spotify', 'Council tax'].map((n, i) => ({ ...bill(n, 2000 + i * 900, 3 + i * 4), accountId: acct })));
    await measure('Example + 6 more bills (12 bills)', bigger);
    await measure('Example + 6 more bills + transactions', bigger, true);

    console.log('\nPartner share code sizes (QR limit ' + QR_MAX_CHARS + ' chars):');
    for (const [label, len] of rows) console.log(`  ${len <= QR_MAX_CHARS ? 'QR ✓' : 'file'}  ${String(len).padStart(5)}  ${label}`);
    expect(exampleShare.code, 'the example household should now fit a QR code').toBeDefined();
  });
});
