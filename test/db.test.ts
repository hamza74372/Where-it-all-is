import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DB, uid } from '../src/db/db';
import { ALL_STORES, SCHEMA_VERSION } from '../src/db/schema';
import { defaultSettings, guessCurrency, loadSettings } from '../src/db/settings';

const fresh = () => DB.open('test-' + uid(), new IDBFactory());

describe('IndexedDB wrapper', () => {
  it('creates every store at the current schema version', async () => {
    const db = await fresh();
    expect(db.idb.version).toBe(SCHEMA_VERSION);
    expect([...db.idb.objectStoreNames].sort()).toEqual([...ALL_STORES].sort());
    db.close();
  });

  it('put/get/all/delete with updatedAt stamping', async () => {
    const db = await fresh();
    const rec = await db.put('accounts', {
      id: 'a1', name: 'Checking', type: 'checking', openingBalance: 50000, includeInSafeToSpend: true, archived: false,
    });
    expect(typeof rec.updatedAt).toBe('number');
    expect((await db.get('accounts', 'a1'))?.name).toBe('Checking');
    expect(await db.all('accounts')).toHaveLength(1);
    await db.delete('accounts', 'a1');
    expect(await db.get('accounts', 'a1')).toBeUndefined();
    db.close();
  });

  it('keepStamp preserves updatedAt (for merge/restore)', async () => {
    const db = await fresh();
    const rec = await db.put('goals', { id: 'g', name: 'Trip', target: 1, saved: 0, emoji: '✈️', updatedAt: 42 }, true);
    expect(rec.updatedAt).toBe(42);
    db.close();
  });

  it('queries by index', async () => {
    const db = await fresh();
    await db.batch(['transactions'], (w) => {
      for (const [id, date] of [['t1', '2026-10-01'], ['t2', '2026-10-05'], ['t3', '2026-11-01']]) {
        w.put('transactions', { id, date, amount: -100, accountId: 'a', note: '', source: 'manual', cleared: false });
      }
    });
    const oct = await db.byIndex('transactions', 'date', IDBKeyRange.bound('2026-10-01', '2026-10-31'));
    expect(oct.map((t) => t.id).sort()).toEqual(['t1', 't2']);
    db.close();
  });

  it('batch is atomic: a failing write rolls everything back', async () => {
    const db = await fresh();
    await expect(
      db.batch(['notes'], (w) => {
        w.put('notes', { id: 'n1', month: '2026-10', text: 'a' });
        w.put('notes', { id: 'n2', month: '2026-10', text: 'b' }); // unique index violation
      }),
    ).rejects.toBeTruthy();
    expect(await db.count('notes')).toBe(0);
    db.close();
  });

  it('reopening an existing database keeps data (migrations are idempotent)', async () => {
    const factory = new IDBFactory();
    const name = 'reopen';
    const a = await DB.open(name, factory);
    await a.put('settings', defaultSettings('en-GB', 1));
    a.close();
    const b = await DB.open(name, factory);
    expect((await b.get('settings', 'main'))?.currency).toBe('GBP');
    b.close();
  });
});

describe('settings defaults', () => {
  it('guesses currency from browser language', () => {
    expect(guessCurrency('en-GB')).toBe('GBP');
    expect(guessCurrency('en-AU')).toBe('AUD');
    expect(guessCurrency('fr-FR')).toBe('EUR');
    expect(guessCurrency('en')).toBe('USD');
  });
  it('US week starts Sunday, UK Monday', () => {
    expect(defaultSettings('en-US').weekStart).toBe(0);
    expect(defaultSettings('en-GB').weekStart).toBe(1);
  });
});

describe('decimal separator setting', () => {
  it('defaults from the browser locale', () => {
    expect(defaultSettings('en-US').decimalSeparator).toBe('.');
    expect(defaultSettings('en-GB').decimalSeparator).toBe('.');
    expect(defaultSettings('de-DE').decimalSeparator).toBe(',');
    expect(defaultSettings('fr-FR').decimalSeparator).toBe(',');
  });

  it('is stored, and a saved choice is never overwritten by the locale on load', async () => {
    const factory = new IDBFactory();
    const a = await DB.open('sep', factory);
    await a.put('settings', { ...defaultSettings('de-DE', 1), decimalSeparator: '.' });
    const { settings } = await loadSettings(a);
    expect(settings.decimalSeparator).toBe('.');
    a.close();
  });

  it('records saved before the setting existed get it filled in once', async () => {
    const factory = new IDBFactory();
    const a = await DB.open('sep-old', factory);
    const { decimalSeparator: _drop, ...old } = defaultSettings('en-US', 1);
    await a.put('settings', old as never);
    const { settings } = await loadSettings(a);
    expect(['.', ',']).toContain(settings.decimalSeparator);
    expect((await a.get('settings', 'main'))?.decimalSeparator).toBe(settings.decimalSeparator);
    a.close();
  });
});
