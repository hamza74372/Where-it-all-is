// Backup, restore (replace or merge, both undoable), CSV export and partner sharing.

import { checkPassphrase, encryptJson, decryptJson, NotOurFileError, type EncryptedFile } from '../lib/backup/crypto';
import { backupFileName, buildBackup, readBackupText, type BackupFile } from '../lib/backup/format';
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
  if (passphrase !== undefined) checkPassphrase(passphrase);
  const file = await buildBackup(await store.exportSnapshot(), appVersion, now);
  const body = passphrase ? await encryptJson(file, passphrase, 'backup') : file;
  return { name: backupFileName(now, !!passphrase), text: JSON.stringify(body), type: 'application/json' };
}

/**
 * Read a just-made backup back, the way a restore would: decrypt it (with the same passphrase),
 * check its checksum, and compare what's inside with what's on the device. Throws if anything
 * doesn't line up, so "Backup checked" is only said when the file really opens.
 */
export async function verifyBackup(store: Store, made: MadeFile, passphrase?: string): Promise<void> {
  const read = await readBackupText(made.text, passphrase);
  if (read.kind !== 'backup') throw new Error('The backup file couldn’t be opened again — please try once more.');
  const now = await store.exportSnapshot();
  for (const name of ['transactions', 'accounts', 'bills', 'categories'] as const) {
    if ((read.file.stores[name] ?? []).length !== (now[name] ?? []).length) {
      throw new Error('The backup file doesn’t match what’s on this device — please try once more.');
    }
  }
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
  checkPassphrase(passphrase);
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
