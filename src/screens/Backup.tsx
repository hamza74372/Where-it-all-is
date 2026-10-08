// Spec §7.10 — backup & restore. Everything stays on the device unless you save or send the file.

import { useState } from 'preact/hooks';
import { MIN_PASSPHRASE, WrongPassphraseError } from '../lib/backup/crypto';
import { readBackupText, summariseBackup, type BackupFile, type BackupSummary } from '../lib/backup/format';
import { CURRENCY_INFO, type Currency } from '../lib/money';
import { saveFile } from '../lib/saveFile';
import { applyBackup, makeBackup, verifyBackup, makeTransactionsCsv, markBackedUp } from '../state/backupActions';
import { useData, useStore } from '../state/store';
import { Select, Toggle } from '../ui/fields';
import { useFmt } from '../ui/hooks';
import { Icon } from '../ui/icons';
import { toast } from '../ui/Toast';

export function daysSince(ms: number | undefined, now = Date.now()): number | null {
  return ms ? Math.floor((now - ms) / 86_400_000) : null;
}

export function lastBackupText(ms: number | undefined, now = Date.now()): string {
  const d = daysSince(ms, now);
  if (d === null) return 'No backup yet';
  if (d === 0) return 'Last backup: today';
  if (d === 1) return 'Last backup: yesterday';
  return `Last backup: ${d} days ago`;
}

export function BackupScreen() {
  const data = useData();
  const store = useStore();
  const { settings } = data;
  return (
    <>
      <section class="card" aria-labelledby="bk-status">
        <h2 id="bk-status" class="card-title">
          {lastBackupText(settings.lastBackupAt)}
        </h2>
        <p>{STAYS_ON_DEVICE}</p>
        <p class="muted">
          A backup is a file you keep somewhere safe — Files, iCloud Drive, Google Drive, or email it to yourself.
        </p>
        <p class="muted">
          {settings.storagePersisted
            ? 'This browser has agreed to keep the app’s data even when space runs low.'
            : 'This browser may clear the app’s data if storage runs low, or if you clear browsing data.'}{' '}
          On iPhone and iPad, Safari can delete a website’s data after 7 days without use — unless you add the app to your Home Screen. Add it
          there, and back up weekly.
        </p>
      </section>
      <BackupNow />
      <RestorePanel />
      <section class="card" aria-labelledby="bk-more">
        <h2 id="bk-more" class="card-title">
          More
        </h2>
        <Select
          label="Remind me to back up"
          value={String(settings.backupRemindDays)}
          onChange={(v) => store.saveSettings({ backupRemindDays: Number(v) })}
          options={[
            { value: '3', label: 'Every 3 days' },
            { value: '7', label: 'Every week' },
            { value: '14', label: 'Every 2 weeks' },
            { value: '30', label: 'Every month' },
            { value: '0', label: 'Never' },
          ]}
        />
        <button
          type="button"
          class="btn"
          onClick={async () => {
            const outcome = await saveFile(makeTransactionsCsv(store));
            if (outcome !== 'cancelled') toast('Transactions exported as CSV');
          }}
        >
          Export transactions (CSV)
        </button>
        <p class="field-hint">Opens in Excel, Numbers or Google Sheets. This is a copy for you — to restore the app, use a backup file.</p>
      </section>
    </>
  );
}

/** The one-line reminder of where data lives (Backup, Your data, the first-backup prompt). */
export const STAYS_ON_DEVICE = 'Your information stays on this device. Clearing browser data deletes it, so back up occasionally.';

export function BackupNow({ onDone }: { onDone?: () => void }) {
  const store = useStore();
  const [checked, setChecked] = useState('');
  const [lock, setLock] = useState(false);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const passOk = !lock || (pass.length >= MIN_PASSPHRASE && pass === pass2);

  return (
    <section class="card" aria-labelledby="bk-now">
      <h2 id="bk-now" class="card-title">
        Back up now
      </h2>
      <Toggle
        label="Lock it with a passphrase"
        checked={lock}
        onChange={setLock}
        hint="Recommended if you’ll store it in the cloud or send it anywhere."
      />
      {lock && (
        <>
          <PassField id="bk-pass" label="Passphrase" value={pass} onInput={setPass} autoComplete="new-password" />
          <PassField id="bk-pass2" label="Type it again" value={pass2} onInput={setPass2} autoComplete="new-password" />
          <p class="warn-box" role="note">
            <strong>If you forget this passphrase, this backup can’t be opened.</strong> Nobody can recover it — the app never stores it.
          </p>
          {pass.length > 0 && pass.length < MIN_PASSPHRASE && <p class="field-error">Use at least {MIN_PASSPHRASE} characters (a few words is best).</p>}
          {pass2.length > 0 && pass !== pass2 && <p class="field-error">The two passphrases don’t match.</p>}
        </>
      )}
      {error && (
        <p class="field-error" role="alert">
          {error}
        </p>
      )}
      {checked && (
        <p class="backup-checked">
          <Icon name="done" small /> Backup checked — <strong>{checked}</strong> opens correctly{lock ? ' with your passphrase' : ''}.
        </p>
      )}
      <button
        type="button"
        class="btn btn-primary btn-block"
        disabled={busy || !passOk}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            setChecked('');
            const file = await makeBackup(store, __APP_VERSION__, lock ? pass : undefined);
            const outcome = await saveFile(file);
            if (outcome === 'cancelled') return;
            // Open the file again exactly as a restore would (decrypt, checksum, contents).
            await verifyBackup(store, file, lock ? pass : undefined);
            await markBackedUp(store);
            setChecked(file.name);
            toast(outcome === 'shared' ? 'Backup checked — keep it somewhere safe' : `Backup checked: ${file.name}`);
            onDone?.();
            setPass('');
            setPass2('');
          } catch (e) {
            setError(e instanceof Error ? e.message : 'The backup couldn’t be made.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? (lock ? 'Locking…' : 'Preparing…') : 'Back up now'}
      </button>
    </section>
  );
}

function PassField(props: { id: string; label: string; value: string; onInput: (v: string) => void; autoComplete: string; autoFocus?: boolean }) {
  const { id } = props;
  return (
    <div class="field">
      <label class="field-label" for={id}>
        {props.label}
      </label>
      <input
        id={id}
        class="input"
        type="password"
        autoComplete={props.autoComplete}
        autoFocus={props.autoFocus}
        spellcheck={false}
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
      />
    </div>
  );
}

/** Pick a backup → (passphrase) → preview → Replace or Merge. Used in More and on the welcome screen. */
export function RestorePanel({ onRestored }: { onRestored?: () => void }) {
  const store = useStore();
  const fmt = useFmt();
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [needPass, setNeedPass] = useState(false);
  const [pass, setPass] = useState('');
  const [file, setFile] = useState<BackupFile | null>(null);
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [encrypted, setEncrypted] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setText(null);
    setNeedPass(false);
    setPass('');
    setFile(null);
    setSummary(null);
    setError('');
  };

  const open = async (t: string, passphrase?: string) => {
    setError('');
    setBusy(true);
    try {
      const r = await readBackupText(t, passphrase);
      if (r.kind === 'partner') {
        setError('This is a partner share, not a backup. Open it from More → Share with partner.');
      } else if (r.kind === 'needsPassphrase') {
        setNeedPass(true);
      } else {
        setFile(r.file);
        setSummary(summariseBackup(r.file));
        setEncrypted(r.encrypted);
        setNeedPass(false);
      }
    } catch (e) {
      setError(e instanceof WrongPassphraseError ? e.message : e instanceof Error ? e.message : 'That file couldn’t be opened.');
    } finally {
      setBusy(false);
    }
  };

  // Currency guard: amounts are plain numbers, so restoring £ data into a $ device would mislabel them.
  const data = useData();
  const [pendingMode, setPendingMode] = useState<'replace' | 'merge' | null>(null);
  const backupCurrency = (file?.stores.settings?.[0] as { currency?: Currency } | undefined)?.currency;
  const deviceCurrency = data.settings.currency;
  const currencyDiffers = !!data.settings.onboarded && !!backupCurrency && backupCurrency !== deviceCurrency;

  const apply = async (mode: 'replace' | 'merge', switchCurrency = false) => {
    if (!file) return;
    if (currencyDiffers && !switchCurrency) return setPendingMode(mode);
    setPendingMode(null);
    setBusy(true);
    try {
      const { stats, undo } = await applyBackup(store, file, mode);
      // A merge keeps this device's settings, so switch the currency explicitly (undo reverts it too).
      if (switchCurrency && backupCurrency && store.data.settings.currency !== backupCurrency) {
        await store.saveSettings({ currency: backupCurrency });
      }
      const msg =
        mode === 'replace'
          ? 'Backup restored'
          : `Merged: ${stats!.added} added, ${stats!.updated} updated, ${stats!.removed} removed`;
      reset();
      onRestored?.();
      toast(msg, undo);
    } finally {
      setBusy(false);
    }
  };

  const exported = summary ? new Date(summary.exportedAt) : null;
  return (
    <section class="card" aria-labelledby="restore-title">
      <h2 id="restore-title" class="card-title">
        Restore from a backup
      </h2>
      {!text && (
        <>
          <p class="muted">Pick a backup file you saved earlier. Nothing changes until you choose what to do with it.</p>
          <label class="btn file-btn">
            Choose backup file
            <input
              class="sr-only"
              type="file"
              accept=".json,application/json"
              onChange={async (e) => {
                const f = e.currentTarget.files?.[0];
                e.currentTarget.value = '';
                if (!f) return;
                const t = await f.text();
                setText(t);
                setFileName(f.name);
                open(t);
              }}
            />
          </label>
        </>
      )}

      {text && needPass && (
        <form
          class="form"
          onSubmit={(e) => {
            e.preventDefault();
            open(text, pass);
          }}
        >
          <p>
            <strong>{fileName}</strong> is locked. Enter the passphrase it was saved with.
          </p>
          <PassField id="rs-pass" label="Passphrase" value={pass} onInput={setPass} autoComplete="current-password" autoFocus />
          <div class="form-actions">
            <button type="button" class="btn" onClick={reset}>
              Cancel
            </button>
            <button type="submit" class="btn btn-primary btn-grow" disabled={busy || !pass}>
              {busy ? 'Unlocking…' : 'Unlock'}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div role="alert">
          <p class="field-error">{error}</p>
          {!needPass && (
            <button type="button" class="btn btn-small" onClick={reset}>
              Choose a different file
            </button>
          )}
        </div>
      )}

      {summary && exported && (
        <div class="restore-preview">
          <p class="restore-summary">
            This backup has <strong>{summary.transactions}</strong> {summary.transactions === 1 ? 'transaction' : 'transactions'}
            {summary.from && summary.to ? (
              <>
                {' '}
                from <strong>{fmt.day(summary.from)}</strong> to <strong>{fmt.day(summary.to)}</strong>
              </>
            ) : null}
            , <strong>{summary.accounts}</strong> {summary.accounts === 1 ? 'account' : 'accounts'} and <strong>{summary.bills}</strong>{' '}
            {summary.bills === 1 ? 'bill' : 'bills'}.
          </p>
          <p class="muted">
            Made {fmt.dayLong(exported.toISOString().slice(0, 10))} at{' '}
            {exported.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            {encrypted ? ' · was locked with a passphrase' : ''} · app version {summary.appVersion}
          </p>
          {pendingMode && backupCurrency && (
            <div class="card card-accent currency-guard" role="group" aria-labelledby="currency-q">
              <p id="currency-q">
                <strong>
                  This backup is in {symbolOf(backupCurrency, data.settings.locale)} ({CURRENCY_INFO[backupCurrency].label.replace(/ \(.*\)$/, '')}). This
                  device is set to {symbolOf(deviceCurrency, data.settings.locale)} ({CURRENCY_INFO[deviceCurrency].label.replace(/ \(.*\)$/, '')}).
                </strong>{' '}
                Amounts are saved as plain numbers, so they’d show in the wrong currency unless you switch.
              </p>
              <div class="row-gap">
                <button type="button" class="btn btn-primary" disabled={busy} onClick={() => apply(pendingMode, true)}>
                  Switch to {symbolOf(backupCurrency, data.settings.locale)}
                </button>
                <button type="button" class="btn" onClick={() => setPendingMode(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div class="choice-grid" role="group" aria-label="What should happen with this backup?">
            <button type="button" class="choice" disabled={busy} onClick={() => apply('replace')}>
              <span class="choice-title">Replace my data</span>
              <span class="choice-sub">Use this backup instead of what’s here now. Best when moving to a new phone or starting over.</span>
            </button>
            <button type="button" class="choice" disabled={busy} onClick={() => apply('merge')}>
              <span class="choice-title">Merge with my data</span>
              <span class="choice-sub">
                Combine the two. For each item the most recent change wins, and anything deleted on either device stays deleted.
              </span>
            </button>
          </div>
          <p class="field-hint">Either way, you can undo it straight after.</p>
          <button type="button" class="link-btn" onClick={reset}>
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}

/** "£", "$", "€" for a currency, as this locale writes it. */
export function symbolOf(currency: Currency, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).formatToParts(1).find((p) => p.type === 'currency')?.value ?? currency;
}
