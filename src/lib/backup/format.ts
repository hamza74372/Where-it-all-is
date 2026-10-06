// Backup file format: build, read (decrypt if needed), verify, upgrade, and summarise.

import { SCHEMA_VERSION } from '../../db/schema';
import type { StoreName } from '../../db/types';
import { decryptJson, isEncryptedFile, NotOurFileError, sha256Hex, TamperedFileError, type EncryptedFile } from './crypto';

export type Snapshot = Partial<Record<StoreName, Array<Record<string, unknown> & { id: string; updatedAt?: number }>>>;

export interface BackupFile {
  format: 'wiai-backup';
  schemaVersion: number;
  appVersion: string;
  exportedAt: string; // ISO
  checksum: string; // "sha256:<hex>" of JSON.stringify(stores)
  stores: Snapshot;
}

export class NewerVersionError extends Error {
  constructor(version: number) {
    super(
      `This backup was made by a newer version of the app (data version ${version}; this copy understands up to ${SCHEMA_VERSION}). ` +
        'Update the app — download it again from your Etsy order — then restore.',
    );
    this.name = 'NewerVersionError';
  }
}

export async function buildBackup(stores: Snapshot, appVersion: string, now = new Date()): Promise<BackupFile> {
  return {
    format: 'wiai-backup',
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    exportedAt: now.toISOString(),
    checksum: `sha256:${await sha256Hex(JSON.stringify(stores))}`,
    stores,
  };
}

export type ReadResult =
  | { kind: 'backup'; file: BackupFile; encrypted: boolean }
  | { kind: 'needsPassphrase'; envelope: EncryptedFile }
  | { kind: 'partner'; envelope: EncryptedFile };

/** Read a chosen file. Encrypted backups come back as "needsPassphrase" until one is given. */
export async function readBackupText(text: string, passphrase?: string): Promise<ReadResult> {
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new NotOurFileError('This isn’t a backup file from this app (it couldn’t be read). Pick the .json file you saved.');
  }
  if (isEncryptedFile(json)) {
    if (json.kind === 'partner') return { kind: 'partner', envelope: json };
    if (!passphrase) return { kind: 'needsPassphrase', envelope: json };
    const inner = await decryptJson(json, passphrase);
    return { kind: 'backup', file: await verifyAndUpgrade(inner), encrypted: true };
  }
  return { kind: 'backup', file: await verifyAndUpgrade(json), encrypted: false };
}

export async function verifyAndUpgrade(json: unknown): Promise<BackupFile> {
  const f = json as BackupFile;
  if (!f || f.format !== 'wiai-backup' || typeof f.schemaVersion !== 'number' || !f.stores || typeof f.stores !== 'object') {
    throw new NotOurFileError('This isn’t a backup file from this app.');
  }
  if (f.checksum !== `sha256:${await sha256Hex(JSON.stringify(f.stores))}`) throw new TamperedFileError();
  return upgradeBackup(f);
}

/** Bring an older backup up to the current data version. Newer ones are refused. */
export function upgradeBackup(f: BackupFile): BackupFile {
  if (f.schemaVersion > SCHEMA_VERSION) throw new NewerVersionError(f.schemaVersion);
  const stores: Snapshot = { ...f.stores };
  // v1 → v2: envelope "move money" records didn't exist yet.
  if (f.schemaVersion < 2) stores.envelopeMoves ??= [];
  // v2 → v3: no deletion records yet (nothing to carry over).
  if (f.schemaVersion < 3) stores.tombstones ??= [];
  return { ...f, schemaVersion: SCHEMA_VERSION, stores };
}

export interface BackupSummary {
  transactions: number;
  from?: string;
  to?: string;
  accounts: number;
  bills: number;
  goals: number;
  exportedAt: string;
  appVersion: string;
}

export function summariseBackup(f: BackupFile): BackupSummary {
  const txs = (f.stores.transactions ?? []) as Array<{ date?: string }>;
  const dates = txs.map((t) => t.date).filter((d): d is string => !!d).sort();
  return {
    transactions: txs.length,
    from: dates[0],
    to: dates[dates.length - 1],
    accounts: ((f.stores.accounts ?? []) as Array<{ archived?: boolean }>).filter((a) => !a.archived).length,
    bills: ((f.stores.bills ?? []) as Array<{ active?: boolean }>).filter((b) => b.active !== false).length,
    goals: (f.stores.goals ?? []).length,
    exportedAt: f.exportedAt,
    appVersion: f.appVersion,
  };
}

export function backupFileName(now = new Date(), encrypted = false): string {
  const d = now.toISOString().slice(0, 10);
  return `where-it-all-is-backup-${d}${encrypted ? '-locked' : ''}.json`;
}
