// More → Your data: import history (each import can be undone) and "Erase all my data".

import { useState } from 'preact/hooks';
import type { ImportBatch } from '../db/types';
import { todayISO } from '../lib/dates';
import { eraseEverything } from '../state/actions';
import { undoImport } from '../state/importActions';
import { useNav } from '../state/nav';
import { useData, useStore } from '../state/store';
import { Confirm } from '../ui/Confirm';
import { EmptyState } from '../ui/EmptyState';
import { useFmt } from '../ui/hooks';
import { toast } from '../ui/Toast';
import { lastBackupText } from './Backup';

/** Past imports, newest first. Undoing one removes only the rows it added (after a confirm). */
export function ImportHistory({ limit, onImport }: { limit?: number; onImport?: () => void }) {
  const store = useStore();
  const data = useData();
  const fmt = useFmt();
  const [undoing, setUndoing] = useState<ImportBatch | null>(null);
  const batches = [...data.importBatches].sort((a, b) => b.importedAt - a.importedAt).slice(0, limit);
  const accName = (id: string) => data.accounts.find((a) => a.id === id)?.name;
  const linkedCount = (b: ImportBatch) => data.transactions.filter((t) => t.matchedBatchId === b.id).length;
  if (!batches.length) return <EmptyState line="No imports yet." action="Import a statement" onAction={onImport} icon="inbox" />;
  return (
    <>
      <ul class="rows" aria-label="Past imports">
        {batches.map((b) => (
          <li key={b.id} class="row">
            <span class="row-main">
              <span>{b.fileName}</span>
              <span class="row-sub">
                {fmt.day(todayISO(new Date(b.importedAt)))} · {b.rowCount} {b.rowCount === 1 ? 'row' : 'rows'} added
                {accName(b.accountId) ? ` · ${accName(b.accountId)}` : ''}
              </span>
            </span>
            <button type="button" class="btn btn-small" onClick={() => setUndoing(b)} aria-label={`Undo import of ${b.fileName}`}>
              Undo import
            </button>
          </li>
        ))}
      </ul>
      <Confirm
        open={undoing != null}
        title="Undo this import?"
        confirmLabel={`Remove ${undoing?.rowCount ?? 0} ${undoing?.rowCount === 1 ? 'row' : 'rows'}`}
        onCancel={() => setUndoing(null)}
        onConfirm={async () => {
          const b = undoing!;
          setUndoing(null);
          const redo = await undoImport(store, b.id);
          toast(`Import undone — ${b.rowCount} ${b.rowCount === 1 ? 'row' : 'rows'} removed`, redo);
        }}
      >
        {undoing && (
          <>
            <p>
              This removes the {undoing.rowCount} {undoing.rowCount === 1 ? 'row' : 'rows'} that <strong>{undoing.fileName}</strong> added.
            </p>
            <p class="muted">
              Things you'd already logged, bills you'd marked paid and pay you'd confirmed stay
              {linkedCount(undoing) ? ` (${linkedCount(undoing)} were linked to this import)` : ''}.
            </p>
          </>
        )}
      </Confirm>
    </>
  );
}

export function YourData({ onBackup }: { onBackup: () => void }) {
  const store = useStore();
  const nav = useNav();
  const { settings } = useData();
  const [erasing, setErasing] = useState(false);
  return (
    <>
      <section class="card" aria-labelledby="history-title">
        <h2 id="history-title" class="card-title">
          Import history
        </h2>
        <ImportHistory onImport={() => nav('log')} />
      </section>
      <section class="card" aria-labelledby="erase-title">
        <h2 id="erase-title" class="card-title">
          Erase all my data
        </h2>
        <p class="muted">
          Removes everything from this device: accounts, transactions, bills, plans, notes, imports and any partner view. Use it before you
          sell or give away this phone, or to start again. It can't be undone.
        </p>
        <p class="muted">{lastBackupText(settings.lastBackupAt)}.</p>
        {!__DEMO__ && (
          <button type="button" class="btn" onClick={onBackup}>
            Back up first
          </button>
        )}
        <button type="button" class="btn btn-danger" onClick={() => setErasing(true)}>
          Erase everything…
        </button>
      </section>
      <Confirm
        open={erasing}
        title="Erase everything on this device?"
        confirmLabel="Erase everything"
        typeToConfirm="ERASE"
        onCancel={() => setErasing(false)}
        onConfirm={async () => {
          setErasing(false);
          await eraseEverything(store);
        }}
      >
        <p>All your budget data on this device goes, and the app starts fresh. Backup files you've saved elsewhere aren't touched.</p>
        {!settings.lastBackupAt && !__DEMO__ && <p class="review-warn">You haven't made a backup yet.</p>}
      </Confirm>
    </>
  );
}
