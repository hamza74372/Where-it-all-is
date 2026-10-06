// Merge two snapshots (this device + a backup from another): match by id, newest updatedAt wins,
// and deletions (tombstones) win over older copies so deleted things don't come back.

import { BACKUP_STORES } from '../../db/schema';
import type { StoreName } from '../../db/types';
import type { Snapshot } from './format';

export const TOMBSTONE_DAYS = 90;

type Row = Record<string, unknown> & { id: string; updatedAt?: number };
interface Tomb extends Row {
  store: StoreName;
  rowId: string;
  deletedAt: number;
}

export interface MergeStats {
  added: number;
  updated: number;
  removed: number;
}

const stamp = (r: Row) => (typeof r.updatedAt === 'number' ? r.updatedAt : 0);

export function pruneTombstones(tombs: Tomb[], now: number): Tomb[] {
  const cutoff = now - TOMBSTONE_DAYS * 86_400_000;
  return tombs.filter((t) => t.deletedAt >= cutoff);
}

export function mergeSnapshots(local: Snapshot, incoming: Snapshot, now = Date.now()): { result: Snapshot; stats: MergeStats } {
  const stats: MergeStats = { added: 0, updated: 0, removed: 0 };

  // Union of deletion records, newest per item, minus anything past 90 days.
  const tombMap = new Map<string, Tomb>();
  for (const t of [...((local.tombstones ?? []) as Tomb[]), ...((incoming.tombstones ?? []) as Tomb[])]) {
    const have = tombMap.get(t.id);
    if (!have || t.deletedAt > have.deletedAt) tombMap.set(t.id, t);
  }
  const tombs = pruneTombstones([...tombMap.values()], now);
  const tombFor = new Map(tombs.map((t) => [`${t.store}:${t.rowId}`, t]));

  const result: Snapshot = { tombstones: tombs };
  for (const store of BACKUP_STORES) {
    if (store === 'tombstones') continue;
    const rows = new Map(((local[store] ?? []) as Row[]).map((r) => [r.id, r]));
    for (const r of (incoming[store] ?? []) as Row[]) {
      const t = tombFor.get(`${store}:${r.id}`);
      if (t && t.deletedAt >= stamp(r)) continue; // deleted after this copy was made
      const mine = rows.get(r.id);
      if (!mine) {
        rows.set(r.id, r);
        stats.added++;
      } else if (stamp(r) > stamp(mine)) {
        rows.set(r.id, r);
        stats.updated++;
      }
    }
    // Deletions from the other device remove our copy unless we changed it afterwards.
    for (const [id, r] of rows) {
      const t = tombFor.get(`${store}:${id}`);
      if (t && t.deletedAt > stamp(r)) {
        rows.delete(id);
        if (((local[store] ?? []) as Row[]).some((x) => x.id === id)) stats.removed++;
      }
    }
    result[store] = [...rows.values()] as Snapshot[StoreName];
  }
  return { result, stats };
}
