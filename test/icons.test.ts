// Line icons replaced emoji: the database moves old records over (schema v4), older backups are
// upgraded on restore, and no emoji is left in the interface.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DB, uid } from '../src/db/db';
import { MIGRATIONS, SCHEMA_VERSION } from '../src/db/schema';
import { upgradeBackup, type BackupFile } from '../src/lib/backup/format';
import { iconKeyFrom } from '../src/lib/iconKeys';
import { CHOICE_ICONS, iconFor } from '../src/ui/icons';

describe('icon keys', () => {
  it('maps old emoji to line icons, keeps keys, and falls back to the package icon', () => {
    expect(iconKeyFrom('🛒')).toBe('shopping-cart');
    expect(iconKeyFrom('✈️')).toBe('plane');
    expect(iconKeyFrom('✈')).toBe('plane'); // without the variation selector
    expect(iconKeyFrom('coffee')).toBe('coffee');
    expect(iconKeyFrom('🦄')).toBe('package');
    expect(iconKeyFrom(undefined)).toBe('package');
    expect(iconFor('not-an-icon')).toBe('package');
  });

  it('every default category, goal, chip and common bill uses an icon from the set', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/data/defaults.ts'), 'utf8');
    const used = [...src.matchAll(/icon: '([a-z-]+)'/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(20);
    for (const key of used) expect(Object.keys(CHOICE_ICONS), key).toContain(key);
  });
});

describe('schema v4 migration', () => {
  it('turns stored emoji into icon keys on categories, goals and quick-log chips', async () => {
    expect(SCHEMA_VERSION).toBe(4);
    const factory = new IDBFactory();
    const name = 'mig-' + uid();
    // A version-3 database with emoji, written directly.
    await new Promise<void>((resolve, reject) => {
      const req = factory.open(name, 3);
      req.onupgradeneeded = () => {
        const tx = req.transaction!;
        MIGRATIONS.slice(0, 3).forEach((m) => m(req.result, tx));
        tx.objectStore('categories').put({ id: 'c1', name: 'Groceries', emoji: '🛒', color: '', order: 0, archived: false, updatedAt: 1 });
        tx.objectStore('goals').put({ id: 'g1', name: 'Trip', emoji: '✈️', target: 100, saved: 0, updatedAt: 1 });
        tx.objectStore('settings').put({ id: 'main', presets: [{ id: 'p1', emoji: '☕', label: 'Coffee', amount: 450 }], updatedAt: 1 });
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
    const db = await DB.open(name, factory);
    const cat = await db.get('categories', 'c1');
    const goal = await db.get('goals', 'g1');
    const settings = await db.get('settings', 'main');
    expect(cat).toMatchObject({ icon: 'shopping-cart' });
    expect(cat).not.toHaveProperty('emoji');
    expect(goal).toMatchObject({ icon: 'plane' });
    expect(settings!.presets[0]).toMatchObject({ icon: 'coffee', label: 'Coffee' });
    expect(settings!.presets[0]).not.toHaveProperty('emoji');
  });
});

describe('older backups', () => {
  it('a version-3 backup with emoji restores with icon keys', () => {
    const file = {
      format: 'wiai-backup', schemaVersion: 3, appVersion: '0.1.0', exportedAt: 0,
      stores: {
        categories: [{ id: 'c1', name: 'Home', emoji: '🏠' }],
        goals: [{ id: 'g1', name: 'Cushion', emoji: '🛟' }],
        settings: [{ id: 'main', presets: [{ id: 'p', emoji: '🚌', label: 'Bus', amount: 300 }] }],
      },
    } as unknown as BackupFile;
    const up = upgradeBackup(file);
    expect(up.schemaVersion).toBe(4);
    expect(up.stores.categories![0]).toMatchObject({ icon: 'house' });
    expect(up.stores.goals![0]).toMatchObject({ icon: 'life-buoy' });
    expect((up.stores.settings![0] as unknown as { presets: Array<{ icon: string }> }).presets[0].icon).toBe('bus');
  });
});

describe('no emoji in the interface', () => {
  it('source files contain no emoji (except the old-data table in lib/iconKeys.ts)', () => {
    const files = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? files(p) : /\.(tsx?|css)$/.test(e.name) ? [p] : [];
      });
    const offenders = files(path.resolve(__dirname, '../src'))
      .filter((f) => !f.endsWith(path.join('lib', 'iconKeys.ts')))
      .flatMap((f) =>
        fs
          .readFileSync(f, 'utf8')
          .split('\n')
          .map((line, i) => ({ line, i }))
          .filter(({ line }) => /\p{Extended_Pictographic}/u.test(line.replace(/[©®™]/g, '')))
          .map(({ line, i }) => `${path.basename(f)}:${i + 1} ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
  });
});
