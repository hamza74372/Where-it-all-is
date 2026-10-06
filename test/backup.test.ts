// Phase 5: encryption, backup format and upgrades, merge with tombstones, partner share.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DB, uid } from '../src/db/db';
import { SCHEMA_VERSION } from '../src/db/schema';
import {
  decryptJson, encryptJson, NotOurFileError, PBKDF2_ITERATIONS, TamperedFileError, WrongPassphraseError, fromBase64, toBase64,
} from '../src/lib/backup/crypto';
import { transactionsToCsv } from '../src/lib/backup/csvExport';
import { buildBackup, NewerVersionError, readBackupText, summariseBackup, upgradeBackup, type BackupFile } from '../src/lib/backup/format';
import { mergeSnapshots, TOMBSTONE_DAYS } from '../src/lib/backup/merge';
import { buildPartnerSummary, fromShareCode, QR_MAX_CHARS, toShareCode } from '../src/lib/backup/partner';
import { computeSafeToSpend } from '../src/lib/safeToSpend';
import { applyBackup, makeBackup, makePartnerShare, openPartnerShare, removePartnerShare } from '../src/state/backupActions';
import { Store } from '../src/state/store';

const freshStore = async () => Store.load(await DB.open('t-' + uid(), new IDBFactory()));

async function seeded() {
  const store = await freshStore();
  await store.upsert('accounts', [{ id: 'chk', name: 'Everyday', type: 'checking', openingBalance: 120000, openingDate: '2026-10-01', includeInSafeToSpend: true, archived: false }]);
  await store.upsert('transactions', [
    { id: 't1', date: '2026-10-02', amount: -575, accountId: 'chk', note: 'Coffee', source: 'manual', cleared: false },
    { id: 't2', date: '2026-10-04', amount: -8642, accountId: 'chk', note: 'Groceries', source: 'manual', cleared: false },
  ]);
  await store.upsert('bills', [{ id: 'rent', name: 'Rent', amount: 95000, accountId: 'chk', schedule: { kind: 'monthly', anchorDate: '2026-11-01', dayOfMonth: 1, weekendShift: 'none' }, autopay: true, isDebtMinimum: false, active: true }]);
  return store;
}
const sts = (store: Store, today = '2026-10-06') =>
  computeSafeToSpend({ today, ...store.data, settings: store.data.settings }).safeToSpendToday;
const strip = <T extends { updatedAt?: number }>(rows: T[]) => rows.map(({ updatedAt: _u, ...r }) => r);

describe('encryption (PBKDF2-SHA256 600k + AES-GCM)', () => {
  it('round-trips, with a fresh salt and IV per file and the full iteration count', async () => {
    const a = await encryptJson({ hello: 'world', n: 42 }, 'correct horse', 'backup');
    const b = await encryptJson({ hello: 'world', n: 42 }, 'correct horse', 'backup');
    expect(a.kdf.iterations).toBe(PBKDF2_ITERATIONS);
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000);
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
    expect(JSON.stringify(a)).not.toContain('correct horse');
    expect(await decryptJson(a, 'correct horse')).toEqual({ hello: 'world', n: 42 });
  });

  it('a wrong passphrase fails cleanly', async () => {
    const f = await encryptJson({ x: 1 }, 'right one', 'backup');
    await expect(decryptJson(f, 'wrong one')).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it('a tampered file is rejected by the GCM tag check', async () => {
    const f = await encryptJson({ balance: 100 }, 'pass', 'backup');
    const bytes = fromBase64(f.data);
    bytes[3] ^= 0x01; // flip one bit of the ciphertext
    await expect(decryptJson({ ...f, data: toBase64(bytes) }, 'pass')).rejects.toBeInstanceOf(TamperedFileError);
    // Relabelling a backup as a partner share also breaks the tag (the kind is authenticated).
    await expect(decryptJson({ ...f, kind: 'partner' }, 'pass')).rejects.toBeInstanceOf(TamperedFileError);
  });

  it('refuses weakened files', async () => {
    const f = await encryptJson({ x: 1 }, 'pass', 'backup');
    await expect(decryptJson({ ...f, kdf: { ...f.kdf, iterations: 1000 } }, 'pass')).rejects.toBeInstanceOf(NotOurFileError);
  });
});

describe('backup file', () => {
  it('has schema version, app version, date and checksum; encrypted backups need the passphrase', async () => {
    const store = await seeded();
    const plain = await makeBackup(store, '9.9.9', undefined, new Date('2026-10-06T14:30:00Z'));
    const json = JSON.parse(plain.text) as BackupFile;
    expect(json).toMatchObject({ format: 'wiai-backup', schemaVersion: SCHEMA_VERSION, appVersion: '9.9.9', exportedAt: '2026-10-06T14:30:00.000Z' });
    expect(json.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(plain.name).toBe('where-it-all-is-backup-2026-10-06.json');

    const locked = await makeBackup(store, '9.9.9', 'tulip sky 42');
    expect((await readBackupText(locked.text)).kind).toBe('needsPassphrase');
    const opened = await readBackupText(locked.text, 'tulip sky 42');
    expect(opened.kind === 'backup' && summariseBackup(opened.file)).toMatchObject({ transactions: 2, from: '2026-10-02', to: '2026-10-04', accounts: 1, bills: 1 });
  });

  it('an edited plain backup fails its checksum', async () => {
    const store = await seeded();
    const json = JSON.parse((await makeBackup(store, '1')).text);
    json.stores.transactions[0].amount = -1;
    await expect(readBackupText(JSON.stringify(json))).rejects.toBeInstanceOf(TamperedFileError);
  });

  it('upgrades an old-schema file; refuses a newer one with a clear message', async () => {
    const v1 = await buildBackup({ settings: [], accounts: [{ id: 'a', name: 'Old', updatedAt: 1 }], transactions: [] }, '0.1.0');
    const old = upgradeBackup({ ...v1, schemaVersion: 1 });
    expect(old.schemaVersion).toBe(SCHEMA_VERSION);
    expect(old.stores.envelopeMoves).toEqual([]);
    expect(old.stores.tombstones).toEqual([]);
    expect(old.stores.accounts).toHaveLength(1);
    // Restoring it into a store works.
    const store = await freshStore();
    await applyBackup(store, old, 'replace');
    expect(store.data.accounts.map((a) => a.name)).toEqual(['Old']);

    expect(() => upgradeBackup({ ...v1, schemaVersion: SCHEMA_VERSION + 1 })).toThrow(NewerVersionError);
    expect(() => upgradeBackup({ ...v1, schemaVersion: SCHEMA_VERSION + 1 })).toThrow(/newer version of the app/);
  });

  it('replace + undo restores the exact previous state; restoring a backup gives the same safe-to-spend', async () => {
    const store = await seeded();
    const before = sts(store);
    const backup = JSON.parse((await makeBackup(store, '1')).text) as BackupFile;
    const other = await freshStore();
    const otherBefore = await other.exportSnapshot();
    const { undo } = await applyBackup(other, backup, 'replace');
    expect(sts(other)).toBe(before);
    await undo();
    expect(strip((await other.exportSnapshot()).transactions ?? [])).toEqual(strip(otherBefore.transactions ?? []));
    expect(await other.exportSnapshot()).toEqual(otherBefore);
  });
});

describe('merge (full device move)', () => {
  const backupOf = async (store: Store) => JSON.parse((await makeBackup(store, '1')).text) as BackupFile;

  it('merging a file into itself changes nothing', async () => {
    const store = await seeded();
    const before = await store.exportSnapshot();
    const { stats } = await applyBackup(store, await backupOf(store), 'merge');
    expect(stats).toEqual({ added: 0, updated: 0, removed: 0 });
    expect(await store.exportSnapshot()).toEqual(before);
  });

  it('edits on each device to different records keep both', async () => {
    const phone = await seeded();
    const laptopFile = await backupOf(phone);
    // Laptop edits t2; phone edits t1 later.
    const t2 = laptopFile.stores.transactions!.find((t) => t.id === 't2')!;
    Object.assign(t2, { note: 'Big shop (laptop)', updatedAt: Date.now() + 1000 });
    await phone.upsert('transactions', [{ ...phone.data.transactions.find((t) => t.id === 't1')!, note: 'Coffee (phone)' }]);
    const { stats } = await applyBackup(phone, laptopFile, 'merge');
    expect(stats?.updated).toBe(1);
    const notes = Object.fromEntries(phone.data.transactions.map((t) => [t.id, t.note]));
    expect(notes).toEqual({ t1: 'Coffee (phone)', t2: 'Big shop (laptop)' });
  });

  it('an edit to the same record keeps the newer one', async () => {
    const phone = await seeded();
    const file = await backupOf(phone);
    const t1 = file.stores.transactions!.find((t) => t.id === 't1')!;
    Object.assign(t1, { note: 'Older edit', updatedAt: 1 });
    await phone.upsert('transactions', [{ ...phone.data.transactions.find((t) => t.id === 't1')!, note: 'Newer edit' }]);
    await applyBackup(phone, file, 'merge');
    expect(phone.data.transactions.find((t) => t.id === 't1')!.note).toBe('Newer edit');

    const newer = await backupOf(phone);
    Object.assign(newer.stores.transactions!.find((t) => t.id === 't1')!, { note: 'Even newer, from the laptop', updatedAt: Date.now() + 5000 });
    await applyBackup(phone, newer, 'merge');
    expect(phone.data.transactions.find((t) => t.id === 't1')!.note).toBe('Even newer, from the laptop');
  });

  it('a deletion isn’t brought back by an older file', async () => {
    const phone = await seeded();
    const olderLaptopFile = await backupOf(phone); // still has t2
    await phone.remove('transactions', ['t2']);
    const { stats } = await applyBackup(phone, olderLaptopFile, 'merge');
    expect(phone.data.transactions.map((t) => t.id)).toEqual(['t1']);
    expect(stats).toEqual({ added: 0, updated: 0, removed: 0 }); // the summary mustn't claim it was added
  });

  it('a deletion on the other device removes it here too (unless edited here afterwards)', async () => {
    const laptop = await seeded();
    const phone = await freshStore();
    await applyBackup(phone, await backupOf(laptop), 'replace');
    await laptop.remove('transactions', ['t1']);
    await new Promise((r) => setTimeout(r, 5));
    const { stats } = await applyBackup(phone, await backupOf(laptop), 'merge');
    expect(stats?.removed).toBe(1);
    expect(phone.data.transactions.map((t) => t.id)).toEqual(['t2']);
  });

  it('undoing a merge restores the exact previous state', async () => {
    const phone = await seeded();
    const file = await backupOf(phone);
    file.stores.transactions!.push({ id: 'x', date: '2026-10-05', amount: -100, accountId: 'chk', note: 'From laptop', source: 'manual', cleared: false, updatedAt: Date.now() });
    file.stores.transactions!.find((t) => t.id === 't1')!.updatedAt = Date.now() + 1000;
    const before = await phone.exportSnapshot();
    const { undo } = await applyBackup(phone, file, 'merge');
    expect(phone.data.transactions).toHaveLength(3);
    await undo();
    expect(await phone.exportSnapshot()).toEqual(before);
    expect(phone.data.transactions).toHaveLength(2);
  });

  it('tombstones expire after 90 days', () => {
    const now = Date.UTC(2026, 9, 6);
    const old = { id: 'transactions:a', store: 'transactions' as const, rowId: 'a', deletedAt: now - (TOMBSTONE_DAYS + 1) * 86_400_000, updatedAt: 0 };
    const recent = { ...old, id: 'transactions:b', rowId: 'b', deletedAt: now - 5 * 86_400_000 };
    const { result } = mergeSnapshots({ tombstones: [old, recent] }, {}, now);
    expect(result.tombstones!.map((t) => t.id)).toEqual(['transactions:b']);
  });
});

describe('partner share', () => {
  it('encrypts a summary; opening it never touches the partner’s own data; removing is one step and undoable', async () => {
    const mine = await seeded();
    const share = await makePartnerShare(mine, '2026-10-06', false, 'share-pass');
    const partner = await seeded(); // the partner's own copy, with their own data
    await partner.upsert('transactions', [{ id: 'p1', date: '2026-10-05', amount: -999, accountId: 'chk', note: 'Partner own', source: 'manual', cleared: false }]);
    const ownBefore = await partner.exportSnapshot();
    const stsBefore = sts(partner);

    await expect(openPartnerShare(partner, JSON.parse(share.text), 'nope')).rejects.toBeInstanceOf(WrongPassphraseError);
    const summary = await openPartnerShare(partner, JSON.parse(share.text), 'share-pass', Date.UTC(2026, 9, 6, 14, 30));
    expect(summary.transactions).toBeUndefined(); // off by default
    expect(summary.bills.map((b) => b.name)).toContain('Rent');
    expect(partner.data.partner?.receivedAt).toBe(Date.UTC(2026, 9, 6, 14, 30));
    // Read-only and separate: the partner's own data and number are untouched, and it's not in their backups.
    expect(await partner.exportSnapshot()).toEqual(ownBefore);
    expect(sts(partner)).toBe(stsBefore);
    expect(Object.keys(ownBefore)).not.toContain('partner');

    const undo = await removePartnerShare(partner);
    expect(partner.data.partner).toBeNull();
    await undo();
    expect(partner.data.partner?.summary.bills.length).toBe(summary.bills.length);
  });

  it('transactions are included only when switched on', async () => {
    const mine = await seeded();
    expect(buildPartnerSummary(mine.data, '2026-10-06', true).transactions?.map((t) => t.note)).toEqual(['Groceries', 'Coffee']);
    expect(buildPartnerSummary(mine.data, '2026-10-06', false).transactions).toBeUndefined();
  });

  it('a small share gets a QR/copy code; a big one does not', async () => {
    const mine = await seeded();
    const small = await makePartnerShare(mine, '2026-10-06', false, 'p');
    expect(small.code).toBeDefined();
    expect(small.code!.length).toBeLessThanOrEqual(QR_MAX_CHARS);
    expect(fromShareCode(small.code!)).toEqual(JSON.parse(small.text));
    await mine.upsert('transactions', Array.from({ length: 80 }, (_, i) => ({
      id: `b${i}`, date: '2026-10-05', amount: -100 - i, accountId: 'chk', note: `Long description for a purchase number ${i}`, source: 'manual' as const, cleared: false,
    })));
    const big = await makePartnerShare(mine, '2026-10-06', true, 'p');
    expect(big.code).toBeUndefined();
    expect(() => fromShareCode('hello')).toThrow(NotOurFileError);
    expect(toShareCode(JSON.parse(small.text)).startsWith('WIAI1.')).toBe(true);
    expect(() => fromShareCode(small.code!.slice(0, -10).split('.').slice(0, 4).join('.'))).toThrow(/incomplete/);
  });
});

describe('CSV export', () => {
  it('exports every transaction with a header; neutralises spreadsheet formulas', () => {
    const csv = transactionsToCsv(
      [
        { id: '1', date: '2026-10-02', amount: -575, accountId: 'a', note: 'Coffee, large', source: 'manual', cleared: false, updatedAt: 1 },
        { id: '2', date: '2026-09-30', amount: 185000, accountId: 'a', note: '=HYPERLINK("x")', source: 'import', importDescription: 'ACME PAYROLL', cleared: true, updatedAt: 1 },
      ],
      [],
      [{ id: 'a', name: 'Everyday', type: 'checking', openingBalance: 0, openingDate: '2026-10-01', includeInSafeToSpend: true, archived: false, updatedAt: 0 }],
    );
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('Date,Description,Amount,Category,Account,Type,Bank description,Counts in balance');
    expect(lines[1]).toBe(`2026-09-30,"'=HYPERLINK(""x"")",1850.00,,Everyday,Imported,ACME PAYROLL,No (before you started)`);
    expect(lines[2]).toBe('2026-10-02,"Coffee, large",-5.75,,Everyday,Logged,,Yes');
  });
});
