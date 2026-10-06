// Backup, restore (replace or merge, both undoable), CSV export and partner sharing.

import { encryptJson, decryptJson, NotOurFileError, type EncryptedFile } from '../lib/backup/crypto';
import { backupFileName, buildBackup, type BackupFile } from '../lib/backup/format';
import { mergeSnapshots, type MergeStats } from '../lib/backup/merge';
import { buildPartnerSummary, isPartnerSummary, partnerFileName, QR_MAX_CHARS, toShareCode, type PartnerSummary } from '../lib/backup/partner';
import { transactionsToCsv } from '../lib/backup/csvExport';
import type { Undo } from './actions';
import type { Store } from './store';

export interface MadeFile {
  name: string;
  text: string;
  type: string;
}

/** Build a backup file (optionally locked with a passphrase). Doesn't mark it saved — see markBackedUp. */
export async function makeBackup(store: Store, appVersion: string, passphrase?: string, now = new Date()): Promise<MadeFile> {
  const file = await buildBackup(await store.exportSnapshot(), appVersion, now);
  const body = passphrase ? await encryptJson(file, passphrase, 'backup') : file;
  return { name: backupFileName(now, !!passphrase), text: JSON.stringify(body), type: 'application/json' };
}

export async function markBackedUp(store: Store, now = Date.now()): Promise<void> {
  await store.saveSettings({ lastBackupAt: now });
}

/**
 * Apply a backup. "replace" swaps all data for the backup's; "merge" combines them (newest
 * change per item wins, deletions respected). Either way the undo restores the exact state before.
 */
export async function applyBackup(store: Store, file: BackupFile, mode: 'replace' | 'merge'): Promise<{ stats?: MergeStats; undo: Undo }> {
  const before = await store.exportSnapshot();
  let stats: MergeStats | undefined;
  if (mode === 'replace') {
    await store.replaceAll(file.stores);
  } else {
    const merged = mergeSnapshots(before, file.stores);
    stats = merged.stats;
    await store.replaceAll(merged.result);
  }
  return { stats, undo: () => store.replaceAll(before) };
}

export function makeTransactionsCsv(store: Store, now = new Date()): MadeFile {
  const { transactions, categories, accounts } = store.data;
  return {
    name: `where-it-all-is-transactions-${now.toISOString().slice(0, 10)}.csv`,
    text: transactionsToCsv(transactions, categories, accounts),
    type: 'text/csv',
  };
}

// ---------------- Partner share ----------------

export interface PartnerShareFile extends MadeFile {
  /** A copy-and-paste / QR code, only when the share is small enough (≈ 2 KB). */
  code?: string;
}

export async function makePartnerShare(store: Store, today: string, includeTransactions: boolean, passphrase: string, now = new Date()): Promise<PartnerShareFile> {
  const summary = buildPartnerSummary(store.data, today, includeTransactions, now.getTime());
  const envelope = await encryptJson(summary, passphrase, 'partner');
  const code = toShareCode(envelope);
  return { name: partnerFileName(now), text: JSON.stringify(envelope), type: 'application/octet-stream', code: code.length <= QR_MAX_CHARS ? code : undefined };
}

/** Open a partner's share into the separate, read-only partner view. */
export async function openPartnerShare(store: Store, envelope: EncryptedFile, passphrase: string, now = Date.now()): Promise<PartnerSummary> {
  if (envelope.kind !== 'partner') throw new NotOurFileError('That’s a backup, not a partner share. Restore it from Backup & restore instead.');
  const summary = await decryptJson(envelope, passphrase);
  if (!isPartnerSummary(summary)) throw new NotOurFileError('That isn’t a partner share from this app.');
  await store.setPartner({ id: 'partner', receivedAt: now, summary });
  return summary;
}

export async function removePartnerShare(store: Store): Promise<Undo> {
  const previous = store.data.partner;
  await store.setPartner(null);
  return async () => {
    if (previous) await store.setPartner(previous);
  };
}
