// Spec §7.8 — bank CSV import: pick → check columns → review → import → sort → done.
// Everything is read on the device; nothing is uploaded.

import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { CsvMapping, Id, Transaction } from '../db/types';
import { merchantKey, tidyDescription } from '../lib/csv/convert';
import { DATE_FORMAT_LABELS, type DateFormat } from '../lib/csv/dates';
import { detectMapping, type Detection, type MappingDraft } from '../lib/csv/detect';
import { parseCsv } from '../lib/csv/parse';
import { DEMO_MAX_ENTRIES, demoRemaining } from '../lib/demo';
import { isBeforeStart } from '../lib/safeToSpend';
import { markBalanceChecked, saveWithUndo } from '../state/actions';
import {
  addBalanceAdjustment, addRule, addStatementAdjustment, balanceReport, bankStyleBalance, commitImport, countsOf, entryKind, entryNoun, importNotes, isBigGap, isConfirmedTransfer,
  prepareImport, resolutionOf, saveMapping, undoImport, type Prepared, type PreparedItem,
} from '../state/importActions';
import { useData, useStore } from '../state/store';
import { checkMoney, MoneyInput, Segmented, Select, TextInput, Toggle } from '../ui/fields';
import { useFmt, useToday } from '../ui/hooks';
import { Confirm } from '../ui/Confirm';
import { dismissToast, toast } from '../ui/Toast';
import { ImportHistory } from './YourData';
import { Icon } from '../ui/icons';

/** Rows shown in the column preview (spec: the first 10). */
const PREVIEW_ROWS = 10;

type Step = 'pick' | 'map' | 'review' | 'choose' | 'sort' | 'balance' | 'done';

interface ImportResult {
  batchId: Id;
  imported: number;
  duplicates: number;
  matched: number;
  transfers: number;
  leftOut: number;
  /** Rows in the file that couldn't be read as transactions (blank, balance lines, not completed…). */
  unreadable: number;
  toSort: Id[];
  /** Transactions added by this import (for the balance check's "check the rows" list). */
  importedIds: Id[];
}

interface Loaded {
  fileName: string;
  rows: string[][];
  detection: Detection;
  savedName?: string;
  savedId?: Id;
}

export function Import({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const data = useData();
  const [step, setStepState] = useState<Step>('pick');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [mapping, setMapping] = useState<MappingDraft | null>(null);
  const [mappingName, setMappingName] = useState('');
  const accounts = data.accounts.filter((a) => !a.archived);
  const [accountId, setAccountId] = useState(data.settings.defaultAccountId ?? accounts[0]?.id ?? '');
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const setStep = (s: Step) => {
    setStepState(s);
    dismissToast();
    document.getElementById('main')?.scrollTo(0, 0);
  };
  const regionOrder: 'DMY' | 'MDY' = data.settings.currency === 'USD' ? 'MDY' : 'DMY';

  const readFile = async (file: File) => {
    setError('');
    if (file.size > 10_000_000) return setError('That file is over 10 MB — try exporting a shorter date range.');
    const text = await file.text();
    const { rows } = parseCsv(text);
    const detection = detectMapping(rows, regionOrder);
    if (!detection || rows.length < 2) return setError("We couldn't find any transactions in that file. Is it a CSV export from your bank?");
    const saved = data.csvMappings.find((m) => m.signature === detection.mapping.signature);
    const { id: _id, name: _name, updatedAt: _u, ...savedDraft } = saved ?? ({} as CsvMapping);
    setLoaded({ fileName: file.name, rows, detection, savedName: saved?.name, savedId: saved?.id });
    // Older saved settings don't know about the balance column; take it from this file.
    setMapping(saved ? ({ balanceCol: detection.mapping.balanceCol, ...savedDraft } as MappingDraft) : detection.mapping);
    setMappingName(saved?.name ?? file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 40));
    setStep('map');
  };

  const finish = async (p: Prepared) => {
    if (!loaded || !mapping) return;
    const saved = await saveMapping(store, mappingName, mapping, loaded.savedId);
    const { batch, transactions, matched, transfers } = await commitImport(store, { fileName: loaded.fileName, accountId, mappingId: saved.id, items: p.items });
    const toSort = transactions.filter((t) => !t.categoryId && t.amount < 0 && !t.transferId).map((t) => t.id);
    const counts = countsOf(p);
    setResult({
      batchId: batch.id, imported: transactions.length, duplicates: counts.duplicateCount, matched: matched.length, transfers,
      leftOut: counts.leftOutCount + counts.undecidedCount, unreadable: p.skipped.length, toSort, importedIds: [...transactions, ...matched].map((t) => t.id),
    });
    setStep(toSort.length ? 'sort' : 'balance');
  };

  if (!accounts.length) {
    return (
      <ImportFrame title="Import a statement" onClose={onClose}>
        <p>Add an account first (More → Accounts), so we know where these transactions belong.</p>
      </ImportFrame>
    );
  }

  return (
    <ImportFrame title="Import a statement" onClose={onClose}>
      {step === 'pick' && <PickStep onFile={readFile} error={error} />}
      {step === 'map' && loaded && mapping && (
        <MapStep
          loaded={loaded}
          mapping={mapping}
          onMapping={setMapping}
          accountId={accountId}
          onAccount={setAccountId}
          name={mappingName}
          onName={setMappingName}
          onBack={() => setStep('pick')}
          onNext={() => {
            setPrepared(prepareImport(store, loaded.rows, mapping, accountId));
            setStep('review');
          }}
        />
      )}
      {step === 'review' && loaded && mapping && prepared && (
        <ReviewStep
          prepared={prepared}
          accountId={accountId}
          onItem={(index, patch) => setPrepared({ ...prepared, items: prepared.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) })}
          onBack={() => setStep('map')}
          onImport={async () => {
            if (countsOf(prepared).undecidedCount > 0) setStep('choose');
            else await finish(prepared);
          }}
        />
      )}
      {step === 'choose' && prepared && (
        <ChooseStep
          prepared={prepared}
          onChoose={(index, choice) => setPrepared({ ...prepared, items: prepared.items.map((it, i) => (i === index ? { ...it, choice } : it)) })}
          onDone={(final) => finish(final)}
        />
      )}
      {step === 'sort' && result && <SortStep ids={result.toSort} onDone={() => setStep('balance')} />}
      {step === 'balance' && result && prepared?.statement && (
        <StatementCheck accountId={accountId} prepared={prepared} onDone={() => setStep('done')} />
      )}
      {step === 'balance' && result && !prepared?.statement && (
        <BalanceStep accountId={accountId} importedIds={result.importedIds} onDone={() => setStep('done')} />
      )}
      {step === 'done' && result && (
        <DoneStep
          result={result}
          onUndo={async () => {
            const redo = await undoImport(store, result.batchId);
            toast(`Import undone — ${result.imported} transactions removed`, redo);
            onClose();
          }}
          onClose={onClose}
        />
      )}
    </ImportFrame>
  );
}

function ImportFrame(props: { title: string; onClose: () => void; children: ComponentChildren }) {
  return (
    <>
      <button type="button" class="link-btn back-btn" onClick={props.onClose} aria-label="Back to Log">
        <Icon name="back" small /> Log
      </button>
      <h1 class="screen-title">{props.title}</h1>
      {props.children}
    </>
  );
}

function PickStep({ onFile, error }: { onFile: (f: File) => void; error: string }) {
  const data = useData();
  const [over, setOver] = useState(false);
  return (
    <>
      <div
        class={`drop-zone ${over ? 'is-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer?.files?.[0];
          if (f) onFile(f);
        }}
      >
        <p class="lead">Download a CSV statement from your bank's website or app, then pick it here.</p>
        <label class="btn btn-primary file-btn">
          Choose CSV file
          <input
            class="sr-only"
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) onFile(f);
              e.currentTarget.value = '';
            }}
          />
        </label>
        <p class="muted">or drag it onto this box. The file is read on this device — it isn't uploaded anywhere.</p>
      </div>
      {error && (
        <p class="field-error" role="alert">
          {error}
        </p>
      )}
      <details class="assumptions">
        <summary>Where do I find my bank's CSV?</summary>
        <ul>
          <li>Most banks: sign in on the website → your account → Statements or Transactions → Download or Export → choose CSV.</li>
          <li>Some apps only export from the website, not the phone app.</li>
          <li>Pick a date range that overlaps your last import — anything already here is skipped automatically.</li>
        </ul>
      </details>
      {data.importBatches.length > 0 && (
        <section class="card" aria-labelledby="recent-imports">
          <h2 id="recent-imports" class="card-title">
            Recent imports
          </h2>
          <ImportHistory limit={5} />
          {data.importBatches.length > 5 && <p class="muted">The full list is in More → Your data.</p>}
        </section>
      )}
    </>
  );
}

function MapStep(props: {
  loaded: Loaded;
  mapping: MappingDraft;
  onMapping: (m: MappingDraft) => void;
  accountId: Id;
  onAccount: (id: Id) => void;
  name: string;
  onName: (n: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const store = useStore();
  const data = useData();
  const fmt = useFmt();
  const { loaded, mapping: m } = props;
  const { headers } = loaded.detection;
  const set = (patch: Partial<MappingDraft>) => props.onMapping({ ...m, ...patch });
  const colOptions = headers.map((h, i) => ({ value: String(i), label: `${h}${sample(loaded.rows, m.headerRow, i)}` }));
  const preview = useMemo(() => prepareImport(store, loaded.rows, m, props.accountId), [m, props.accountId, loaded]);
  const today = useToday();
  const futureRows = preview.items.filter((it) => !it.duplicate && it.draft.date > today);
  const sampleDate = loaded.rows[m.headerRow + 1]?.[m.dateCol] ?? '';
  const [askDate, setAskDate] = useState(loaded.detection.ambiguousDate && !loaded.savedName);

  return (
    <>
      {loaded.savedName ? (
        <p class="card card-note">Using your saved settings for "{loaded.savedName}". Check the preview, then continue.</p>
      ) : (
        <p class="muted">
          We read {loaded.rows.length - (m.headerRow + 1)} rows from <strong>{loaded.fileName}</strong> and matched the columns. Check the preview
          looks right.
        </p>
      )}

      {askDate && (
        <div class="card card-accent" role="group" aria-labelledby="date-q">
          <p id="date-q">
            <strong>Quick check:</strong> in this file, is "{sampleDate}" the…
          </p>
          <div class="stack">
            {(['DMY', 'MDY'] as const).map((f) => {
              const iso = parseFirst(sampleDate, f);
              return (
                <button
                  key={f}
                  type="button"
                  class="btn"
                  onClick={() => {
                    set({ dateFormat: f });
                    setAskDate(false);
                  }}
                >
                  {iso ? fmt.dayLong(iso) : f}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {futureRows.length > 0 && (
        <div class="card warn-box" role="alert">
          <p>
            <strong>
              {futureRows.length} {futureRows.length === 1 ? 'row is' : 'rows are'} dated in the future — check the date format.
            </strong>{' '}
            That usually means the day and month were read the wrong way round (for example {fmt.day(futureRows[0].draft.date)}). Change
            "Date format" below if so.
          </p>
        </div>
      )}

      <section class="card" aria-labelledby="preview-title">
        <h2 id="preview-title" class="card-title">
          Preview
        </h2>
        <p class="muted">Nothing changes until you confirm.</p>
        {preview.items.length === 0 ? (
          <p class="field-error">No transactions found with these settings — try a different date or amount column below.</p>
        ) : (
          <ul class="rows">
            {/* First rows of the file, plus any future-dated ones so they can't hide further down. */}
            {[...preview.items.slice(0, PREVIEW_ROWS), ...futureRows.filter((f) => preview.items.indexOf(f) >= PREVIEW_ROWS).slice(0, 3)].map((it) => (
              <li key={`${it.draft.rowIndex}-${it.draft.feeOf ?? ''}`} class="row">
                <span class="row-main">
                  <span>{it.note || '(no description)'}</span>
                  <span class="row-sub">
                    {fmt.day(it.draft.date)}
                    {it.duplicate ? ' · already imported' : it.matchId ? ' · matches something you logged' : ''}
                  </span>
                  {it.draft.date > today && <span class="row-flag">Dated in the future — check the date format</span>}
                </span>
                <span class={`money ${it.draft.amount > 0 ? 'amount-in' : ''}`}>{fmt.money(it.draft.amount, { signed: true })}</span>
              </li>
            ))}
          </ul>
        )}
        {preview.items.length > PREVIEW_ROWS && <p class="muted">…and {preview.items.length - PREVIEW_ROWS} more.</p>}
        {preview.skipped.length > 0 && <p class="muted">{preview.skipped.length} rows will be left out (you'll see why on the next step).</p>}
      </section>

      <details class="card mapping-details" open={!loaded.savedName && preview.items.length === 0}>
        <summary class="card-title">Change how columns are read</summary>
        <Select label="Date column" value={String(m.dateCol)} options={colOptions} onChange={(v) => set({ dateCol: Number(v) })} />
        <Select
          label="Date format"
          value={m.dateFormat}
          options={(Object.keys(DATE_FORMAT_LABELS) as DateFormat[]).map((f) => ({ value: f, label: DATE_FORMAT_LABELS[f] }))}
          onChange={(v) => set({ dateFormat: v })}
        />
        <Select label="Description column" value={String(m.descCol)} options={colOptions} onChange={(v) => set({ descCol: Number(v) })} />
        <div class="field">
          <span class="field-label">Amounts are in</span>
          <Segmented
            label="Amounts are in"
            value={m.amountMode}
            onChange={(amountMode) =>
              set(
                amountMode === 'single'
                  ? { amountMode, amountCol: m.amountCol ?? m.debitCol ?? 0 }
                  : { amountMode, debitCol: m.debitCol ?? m.amountCol ?? 0, creditCol: m.creditCol ?? (m.amountCol ?? 0) + 1 },
              )
            }
            options={[
              { value: 'single', label: 'One column' },
              { value: 'debitCredit', label: 'Money out + in' },
            ]}
          />
        </div>
        {m.amountMode === 'single' ? (
          <>
            <Select label="Amount column" value={String(m.amountCol ?? 0)} options={colOptions} onChange={(v) => set({ amountCol: Number(v) })} />
            {m.typeCol === undefined && (
              <Toggle
                label="Money out is shown as positive numbers"
                checked={m.signConvention === 'positiveIsOut'}
                onChange={(v) => set({ signConvention: v ? 'positiveIsOut' : 'negativeIsOut' })}
                hint="Some card statements list purchases as positive. Turn on if spending shows up as money in."
              />
            )}
          </>
        ) : (
          <>
            <Select label="Money out column" value={String(m.debitCol ?? 0)} options={colOptions} onChange={(v) => set({ debitCol: Number(v) })} />
            <Select label="Money in column" value={String(m.creditCol ?? 0)} options={colOptions} onChange={(v) => set({ creditCol: Number(v) })} />
          </>
        )}
        <Toggle
          label="Amounts use a comma for pennies (12,50)"
          checked={m.decimal === ','}
          onChange={(v) => set({ decimal: v ? ',' : '.' })}
        />
      </details>

      <Select
        label="Which account is this statement for?"
        value={props.accountId}
        options={data.accounts.filter((a) => !a.archived).map((a) => ({ value: a.id, label: a.name }))}
        onChange={props.onAccount}
      />
      <TextInput
        label="Remember these settings as"
        value={props.name}
        onInput={props.onName}
        hint="Next time you import a file like this, the columns are set up for you."
      />
      <div class="form-actions">
        <button type="button" class="btn" onClick={props.onBack}>
          Back
        </button>
        <button type="button" class="btn btn-primary btn-grow" disabled={preview.items.length === 0} onClick={props.onNext}>
          Continue
        </button>
      </div>
    </>
  );
}

function ReviewStep(props: {
  prepared: Prepared;
  accountId: Id;
  onItem: (index: number, patch: Partial<PreparedItem>) => void;
  onBack: () => void;
  onImport: () => Promise<void>;
}) {
  const { prepared, onBack, onImport } = props;
  const data = useData();
  const fmt = useFmt();
  const today = useToday();
  const [busy, setBusy] = useState(false);
  const c = countsOf(prepared);
  const account = data.accounts.find((a) => a.id === props.accountId);
  const notes = importNotes(prepared, account, today);
  const remaining = demoRemaining(data.transactions.length);
  const overDemoLimit = c.newCount > remaining;
  const indexed = prepared.items.map((it, index) => ({ it, index }));
  const linkedItems = indexed.filter(({ it }) => resolutionOf(it).kind === 'link');
  const transferItems = indexed.filter(({ it }) => it.transfer && resolutionOf(it).kind === 'new');
  const otherAccounts = data.accounts.filter((a) => !a.archived && a.id !== props.accountId);
  const accName = (id?: Id) => data.accounts.find((a) => a.id === id)?.name ?? '';
  const actionable = c.newCount + c.matchedCount + c.undecidedCount;
  return (
    <>
      <section class="card" aria-labelledby="review-title">
        <h2 id="review-title" class="card-title">
          Ready to import
        </h2>
        <p class="muted">Nothing changes until you confirm.</p>
        <ul class="review-list">
          <li>
            <strong>{c.newCount}</strong> new {c.newCount === 1 ? 'transaction' : 'transactions'}
            {c.feeCount > 0 && ` (including ${c.feeCount} bank ${c.feeCount === 1 ? 'fee' : 'fees'})`}
          </li>
          {c.matchedCount > 0 && (
            <li>
              <strong>{c.matchedCount}</strong> already in the app — linked, not added twice
            </li>
          )}
          {c.undecidedCount > 0 && (
            <li>
              <strong>{c.undecidedCount}</strong> could be more than one thing already in the app — you'll pick which (needs sorting)
            </li>
          )}
          {c.duplicateCount > 0 && (
            <li>
              <strong>{c.duplicateCount}</strong> already imported before — skipped
            </li>
          )}
          {transferItems.length > 0 && (
            <li>
              <strong>{transferItems.length}</strong> look like money moving between your accounts — check below
            </li>
          )}
          {notes.beforeStart > 0 && account?.openingDate && (
            <li>
              <strong>{notes.beforeStart}</strong> {notes.beforeStart === 1 ? 'is' : 'are'} from before you started on{' '}
              {fmt.day(account.openingDate)}. They're kept for your history but don't change your balance.
            </li>
          )}
          {notes.future > 0 && (
            <li class="review-warn">
              <strong>{notes.future}</strong> dated in the future — check the date format before importing
            </li>
          )}
          {c.needSorting > 0 && (
            <li>
              <strong>{c.needSorting}</strong> will need a category (quick, one at a time)
            </li>
          )}
          {prepared.skipped.length > 0 && (
            <li>
              <strong>{prepared.skipped.length}</strong> {prepared.skipped.length === 1 ? 'row' : 'rows'} left out
              <ul class="skipped-list">
                {prepared.skipped.slice(0, 6).map((s) => (
                  <li key={s.rowIndex} class="muted">
                    Row {s.rowIndex + 1}: {s.reason}
                  </li>
                ))}
              </ul>
            </li>
          )}
        </ul>
      </section>

      {transferItems.length > 0 && (
        <section class="card" aria-labelledby="transfers-title">
          <h2 id="transfers-title" class="card-title">
            Moves between your accounts?
          </h2>
          <p class="muted">A transfer isn't spending or income. Confirm the ones that are.</p>
          <ul class="rows">
            {transferItems.map(({ it, index }) => {
              const t = it.transfer!;
              const partner = t.partnerId ? data.transactions.find((x) => x.id === t.partnerId) : undefined;
              const confirmed = isConfirmedTransfer(it);
              return (
                <li key={index} class="row transfer-row">
                  <span class="row-main">
                    <span>
                      {it.note} · <span class="money">{fmt.money(it.draft.amount, { signed: true })}</span>
                    </span>
                    <span class="row-sub">
                      {fmt.day(it.draft.date)}
                      {partner
                        ? ` · matches ${fmt.money(partner.amount, { signed: true })} on ${accName(partner.accountId)} (${fmt.day(partner.date)})`
                        : ` · ${it.draft.amount < 0 ? 'to' : 'from'} another account`}
                    </span>
                    {!partner && (
                      <Select
                        label={it.draft.amount < 0 ? 'Moved to' : 'Moved from'}
                        value={t.accountId ?? ''}
                        options={[{ value: '', label: 'Choose an account' }, ...otherAccounts.map((a) => ({ value: a.id, label: a.name }))]}
                        onChange={(v) => props.onItem(index, { transfer: { ...t, accountId: v || undefined } })}
                      />
                    )}
                  </span>
                  <span class="row-gap">
                    <button
                      type="button"
                      class={`btn btn-small ${confirmed ? 'btn-primary' : ''}`}
                      aria-pressed={confirmed}
                      disabled={!partner && !t.accountId}
                      onClick={() => props.onItem(index, { transfer: { ...t, confirmed: !t.confirmed } })}
                    >
                      {confirmed ? (
                        <>
                          <Icon name="check" small /> It's a transfer
                        </>
                      ) : (
                        "Yes, it's a transfer"
                      )}
                    </button>
                    <button type="button" class="link-btn" onClick={() => props.onItem(index, { transfer: undefined })}>
                      No
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {linkedItems.length > 0 && (
        <section class="card" aria-labelledby="matched-title">
          <h2 id="matched-title" class="card-title">
            Already in the app
          </h2>
          <p class="muted">Same amount, within 3 days, so these are linked instead of added again. If one isn't the same thing, unlink it.</p>
          <ul class="rows">
            {linkedItems.map(({ it, index }) => {
              const id = (resolutionOf(it) as { id: Id }).id;
              const entry = data.transactions.find((t) => t.id === id);
              return (
                <li key={index} class="row">
                  <span class="row-main">
                    <span>
                      {it.note} <Icon name="transfer" small label="is the same as" /> {entry?.note || 'your entry'}
                    </span>
                    <span class="row-sub">
                      {fmt.money(it.draft.amount, { signed: true })} · bank {fmt.day(it.draft.date)} · {entry ? `${entryKind(entry)}, ${fmt.day(entry.date)}` : ''}
                    </span>
                  </span>
                  <button
                    type="button"
                    class="btn btn-small"
                    onClick={() => props.onItem(index, it.candidates ? { choice: 'new' } : { matchId: undefined })}
                    aria-label={`Unlink ${it.note}`}
                  >
                    Unlink
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {overDemoLimit && (
        <p class="card card-note" role="note">
          The demo holds up to {DEMO_MAX_ENTRIES} entries, and this file has {c.newCount} new ones ({remaining} left). Try a shorter file, or{' '}
          <a href={__ETSY_URL__} target="_blank" rel="noopener noreferrer">
            get the full version
          </a>
          .
        </p>
      )}
      <div class="form-actions">
        <button type="button" class="btn" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          class="btn btn-primary btn-grow"
          disabled={busy || actionable === 0 || overDemoLimit}
          onClick={async () => {
            setBusy(true);
            await onImport();
            setBusy(false);
          }}
        >
          {actionable === 0
            ? 'Nothing new to import'
            : c.undecidedCount > 0
              ? 'Next: sort the unclear ones'
              : c.newCount === 0
                ? `Link ${c.matchedCount}`
                : `Import ${c.newCount}`}
        </button>
      </div>
    </>
  );
}

/** "Needs sorting": rows that could be more than one entry already in the app. One at a time. */
function ChooseStep({ prepared, onChoose, onDone }: { prepared: Prepared; onChoose: (index: number, choice: PreparedItem['choice']) => void; onDone: (p: Prepared) => void }) {
  const data = useData();
  const fmt = useFmt();
  const [items, setItems] = useState(prepared.items);
  const queue = items.map((it, index) => ({ it, index })).filter(({ it }) => resolutionOf(it).kind === 'undecided');
  const total = prepared.items.filter((it) => resolutionOf(it).kind === 'undecided').length;
  const current = queue[0];
  useEffect(() => {
    if (!current) onDone({ ...prepared, items });
  }, [current]);
  if (!current) return null;
  // Entries already taken by another row in this import can't be picked twice.
  const taken = new Set(
    items.flatMap((it, i) => {
      const r = resolutionOf(it);
      return i !== current.index && r.kind === 'link' ? [r.id] : [];
    }),
  );
  const options = (current.it.candidates ?? []).map((id) => data.transactions.find((t) => t.id === id)).filter((t): t is Transaction => !!t && !taken.has(t.id));
  const choose = (choice: PreparedItem['choice']) => {
    onChoose(current.index, choice);
    setItems(items.map((it, i) => (i === current.index ? { ...it, choice } : it)));
  };
  return (
    <section class="card sort-card" aria-labelledby="choose-title">
      <p class="muted" aria-live="polite">
        Needs sorting · {total - queue.length + 1} of {total}
      </p>
      <h2 id="choose-title" class="sort-desc">
        {current.it.note}
      </h2>
      <p class="sort-meta">
        <span class="money">{fmt.money(current.it.draft.amount, { signed: true })}</span> · {fmt.day(current.it.draft.date)}
      </p>
      <p>This could be more than one thing already in the app. Which is it?</p>
      <div class="stack" role="group" aria-label="Which entry is it?">
        {options.map((t) => (
          <button key={t.id} type="button" class="btn choose-option" onClick={() => choose(t.id)}>
            <span>
              {t.note || 'Entry'} · {fmt.day(t.date)} <span class="muted">({entryKind(t)})</span>
            </span>
          </button>
        ))}
        <button type="button" class="btn" onClick={() => choose('new')}>
          It's something else — add it
        </button>
        <button type="button" class="link-btn" onClick={() => choose('skip')}>
          Leave it out
        </button>
      </div>
    </section>
  );
}

/**
 * After importing a file with a balance column: the bank's closing balance against the app's on
 * the same day, and what might explain any difference.
 */
function StatementCheck({ accountId, prepared, onDone }: { accountId: Id; prepared: Prepared; onDone: () => void }) {
  const store = useStore();
  const fmt = useFmt();
  useData(); // re-render after an adjustment
  const report = balanceReport(store, accountId, prepared);
  if (!report) return null;
  const diff = report.bank - report.app;

  if (diff === 0) {
    return (
      <section class="card" aria-labelledby="balance-title">
        <h2 id="balance-title" class="card-title">
          Your bank and the app agree
        </h2>
        <p>
          Both say <strong>{fmt.money(report.bank)}</strong> on {fmt.day(report.date)}.
        </p>
        <div class="form-actions">
          <button
            type="button"
            class="btn btn-primary btn-grow"
            onClick={async () => {
              await markBalanceChecked(store, accountId, report.date); // the bank confirmed it
              onDone();
            }}
          >
            Continue
          </button>
        </div>
      </section>
    );
  }

  const adjust = async () => {
    const { difference, undo } = await addStatementAdjustment(store, accountId, report);
    await markBalanceChecked(store, accountId, report.date);
    onDone(); // move on first: changing step clears toasts, and this one carries the Undo
    toast(`Balance adjustment of ${fmt.money(difference, { signed: true })} added`, undo);
  };
  return (
    <section class="card" aria-labelledby="balance-title">
      <h2 id="balance-title" class="card-title">
        Your bank says {fmt.money(report.bank)}, the app says {fmt.money(report.app)}. Here's what might be missing.
      </h2>
      <p class="muted">
        On {fmt.day(report.date)}{prepared.statement && report.date === prepared.statement.date ? ", the last day in this statement" : ", the day you started"}. That's {fmt.money(Math.abs(diff))} {diff > 0 ? 'more' : 'less'} at the bank.
      </p>
      <ul class="review-list">
        {report.notOnStatement.slice(0, 6).map((t) => (
          <li key={t.id}>
            <strong>{t.note || 'An entry'}</strong> · <span class="money">{fmt.money(t.amount, { signed: true })}</span> on {fmt.day(t.date)} — {entryNoun(t)}, not on this statement
          </li>
        ))}
        {report.notOnStatement.length > 6 && <li>…and {report.notOnStatement.length - 6} more in the app that aren't on this statement</li>}
        {report.leftOut > 0 && (
          <li>
            <strong>{report.leftOut}</strong> {report.leftOut === 1 ? 'row' : 'rows'} you left out of this import
          </li>
        )}
        {report.beforeStart > 0 && (
          <li>
            <strong>{report.beforeStart}</strong> {report.beforeStart === 1 ? 'row is' : 'rows are'} from before you started — they're inside your
            starting balance. If that was a rough number, the gap may come from there.
          </li>
        )}
        <li>A payment the bank is still processing, or one that's in the bank but not logged yet.</li>
      </ul>
      <p class="muted">If you've checked, an adjustment lines things up. You can undo it.</p>
      <div class="row-gap">
        <button type="button" class="btn btn-primary" onClick={adjust}>
          Add a balance adjustment of {fmt.money(diff, { signed: true })}
        </button>
        <button type="button" class="link-btn" onClick={onDone}>
          Leave it
        </button>
      </div>
    </section>
  );
}

function BalanceStep({ accountId, importedIds, onDone }: { accountId: Id; importedIds: Id[]; onDone: () => void }) {
  const store = useStore();
  const data = useData();
  const fmt = useFmt();
  const today = useToday();
  const account = data.accounts.find((a) => a.id === accountId);
  const isCard = account?.type === 'credit';
  const [text, setText] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [entered, setEntered] = useState<number | null>(null);
  const [showRows, setShowRows] = useState(false);
  const appBalance = bankStyleBalance(store, accountId, today);
  const diff = entered === null ? 0 : entered - appBalance;
  const imported = data.transactions.filter((t) => importedIds.includes(t.id));
  const big = entered !== null && isBigGap(diff, imported.map((t) => t.amount));

  const adjust = async () => {
    const { difference, undo } = await addBalanceAdjustment(store, accountId, entered!, today);
    await markBalanceChecked(store, accountId, today);
    // Move on first: changing step clears toasts, and this one carries the Undo.
    onDone();
    toast(`Balance adjustment of ${fmt.money(difference, { signed: true })} added`, undo);
  };

  return (
    <section class="card" aria-labelledby="balance-title">
      <h2 id="balance-title" class="card-title">
        {isCard ? 'What does your card statement say you owe?' : 'Your bank says your balance is…?'}
      </h2>
      <p class="muted">
        Optional. Checking now keeps your safe-to-spend honest. The app says {fmt.money(appBalance)}
        {isCard ? ' owed' : ''} for {account?.name}.
      </p>
      {entered === null ? (
        <form
          class="form"
          onSubmit={(e) => {
            e.preventDefault();
            const c = checkMoney(text, data.settings.decimalSeparator);
            if (c.state !== 'ok') return setShowErrors(true);
            if (c.value === appBalance) {
              void markBalanceChecked(store, accountId, today);
              onDone();
              toast('Balances match — all good');
            } else setEntered(c.value);
          }}
        >
          <MoneyInput label={isCard ? 'Amount owed' : 'Balance in your bank app'} value={text} onInput={setText} showErrors={showErrors} />
          <div class="form-actions">
            <button type="button" class="btn" onClick={onDone}>
              Skip
            </button>
            <button type="submit" class="btn btn-primary btn-grow">
              Check
            </button>
          </div>
        </form>
      ) : (
        <>
          <p>
            Your bank says <strong>{fmt.money(entered)}</strong>; the app says <strong>{fmt.money(appBalance)}</strong>. That's{' '}
            <strong>{fmt.money(Math.abs(diff))}</strong> {diff > 0 ? 'more' : 'less'} at the bank.
          </p>
          {big ? (
            <>
              <p class="review-warn">
                <strong>That's a big gap — check the imported rows first.</strong> It's bigger than any single transaction in this import, which
                often means the wrong account, a date read the wrong way round, or a missing statement.
              </p>
              <div class="stack">
                <button type="button" class="btn btn-primary" aria-expanded={showRows} onClick={() => setShowRows(!showRows)}>
                  {showRows ? 'Hide the imported rows' : 'Check the imported rows'}
                </button>
              </div>
              {showRows && (
                <ul class="rows imported-rows" aria-label="Rows from this import">
                  {imported.map((t) => (
                    <li key={t.id} class="row">
                      <span class="row-main">
                        <span>{t.note}</span>
                        <span class="row-sub">
                          {fmt.day(t.date)}
                          {isBeforeStart(account, t) ? ' · before you started (doesn’t change the balance)' : ''}
                          {t.date > today ? ' · dated in the future' : ''}
                        </span>
                      </span>
                      <span class={`money ${t.amount > 0 ? 'amount-in' : ''}`}>{fmt.money(t.amount, { signed: true })}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p class="muted">If the rows look right, an adjustment lines things up. You can undo it.</p>
              <div class="row-gap">
                <button type="button" class="btn" onClick={adjust}>
                  Add a balance adjustment anyway
                </button>
                <button type="button" class="btn" onClick={() => setEntered(null)}>
                  Re-enter
                </button>
                <button type="button" class="link-btn" onClick={onDone}>
                  Leave it
                </button>
              </div>
            </>
          ) : (
            <>
              <p class="muted">Often it's a payment that's still pending. An adjustment lines things up; you can undo it.</p>
              <div class="row-gap">
                <button type="button" class="btn btn-primary" onClick={adjust}>
                  Add a balance adjustment
                </button>
                <button type="button" class="btn" onClick={() => setEntered(null)}>
                  Re-enter
                </button>
                <button type="button" class="link-btn" onClick={onDone}>
                  Leave it
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function SortStep({ ids, onDone }: { ids: Id[]; onDone: () => void }) {
  const store = useStore();
  const data = useData();
  const fmt = useFmt();
  const [queue, setQueue] = useState(ids);
  const [done, setDone] = useState(0);
  // After a pick: offer to make it a rule ("Always put Starbucks in Coffee?").
  const [offer, setOffer] = useState<{ key: string; categoryId: Id } | null>(null);
  const total = ids.length;
  const tx = data.transactions.find((t) => t.id === queue[0]);
  useEffect(() => {
    if (!tx && !offer) onDone(); // everything sorted (or the rows were removed)
  }, [tx, offer]);
  if (!tx) return null;
  const cats = data.categories.filter((c) => !c.archived);

  const next = (rest: Id[], extraDone = 0) => {
    setDone((d) => d + 1 + extraDone);
    setOffer(null);
    setQueue(rest);
    if (!rest.length) onDone();
  };

  const choose = async (categoryId: Id | null) => {
    if (!categoryId) return next(queue.slice(1));
    await saveWithUndo(store, 'transactions', { ...tx, categoryId });
    const key = merchantKey(tx.importDescription ?? tx.note);
    // Only offer a rule when there's a real merchant name (never "CHECK", "ATM"…).
    if (key) setOffer({ key, categoryId });
    else next(queue.slice(1));
  };

  const answer = async (always: boolean) => {
    if (!offer) return;
    let rest = queue.slice(1);
    let extra = 0;
    if (always) {
      await addRule(store, offer.key, offer.categoryId);
      // The new rule also sorts any others from this import that match.
      const matching = rest
        .map((id) => store.data.transactions.find((t) => t.id === id))
        .filter((t): t is Transaction => !!t && (t.importDescription ?? t.note).toUpperCase().includes(offer.key));
      await store.upsert('transactions', matching.map((t) => ({ ...t, categoryId: offer.categoryId })));
      rest = rest.filter((id) => !matching.some((t) => t.id === id));
      extra = matching.length;
    }
    next(rest, extra);
  };

  if (offer) {
    const cat = cats.find((c) => c.id === offer.categoryId);
    return (
      <section class="card sort-card" aria-labelledby="rule-q">
        <p class="muted">
          {tx.note} → {cat?.name}
        </p>
        <h2 id="rule-q" class="sort-desc">
          Always put “{tidyDescription(offer.key)}” in {cat?.name}?
        </h2>
        <p class="muted">Future imports with “{tidyDescription(offer.key)}” in the description will be sorted for you. You can change rules in More → Rules.</p>
        <div class="stack">
          <button type="button" class="btn btn-primary" onClick={() => answer(true)}>
            Yes, always
          </button>
          <button type="button" class="btn" onClick={() => answer(false)}>
            Just this once
          </button>
        </div>
      </section>
    );
  }

  return (
    <section class="card sort-card" aria-labelledby="sort-title">
      <p class="muted" aria-live="polite">
        {Math.min(done + 1, total)} of {total}
      </p>
      <h2 id="sort-title" class="sort-desc">
        {tx.note}
      </h2>
      <p class="sort-meta">
        <span class="money">{fmt.money(tx.amount)}</span> · {fmt.day(tx.date)}
      </p>
      <div class="sort-grid" role="group" aria-label="Choose a category">
        {cats.map((c) => (
          <button key={c.id} type="button" class="sort-choice" onClick={() => choose(c.id)}>
            <Icon name={c.icon} small />
            <span>{c.name}</span>
          </button>
        ))}
      </div>
      <div class="row-gap">
        <button type="button" class="link-btn" onClick={() => choose(null)}>
          Skip this one
        </button>
        <button type="button" class="link-btn" onClick={onDone}>
          Finish later
        </button>
      </div>
    </section>
  );
}

function DoneStep(props: { result: ImportResult; onUndo: () => Promise<void>; onClose: () => void }) {
  const data = useData();
  const [confirming, setConfirming] = useState(false);
  const { imported, duplicates, matched, transfers, leftOut, unreadable, toSort } = props.result;
  const stillToSort = toSort.filter((id) => data.transactions.some((t) => t.id === id && !t.categoryId)).length;
  const skipped = duplicates + unreadable;
  return (
    <section class="card" aria-labelledby="done-title">
      <h2 id="done-title" class="card-title">
        {imported > 0 ? `Imported ${imported} ${imported === 1 ? 'transaction' : 'transactions'}` : `Linked ${matched} to what's already here`}
      </h2>
      <ul class="review-list">
        {imported > 0 && matched > 0 && <li>{matched} already in the app, so linked instead of added twice</li>}
        {transfers > 0 && <li>{transfers} marked as moves between your accounts (not spending or income)</li>}
        {skipped > 0 && (
          <li>
            <strong>{skipped}</strong> skipped
            {duplicates > 0 && unreadable > 0
              ? ` (${duplicates} imported before, ${unreadable} not transactions)`
              : duplicates > 0
                ? ' — imported before'
                : unreadable === 1
                  ? ' — a row that isn’t a transaction'
                  : ' — rows that aren’t transactions'}
          </li>
        )}
        {toSort.length > 0 && (
          <li>
            <strong>{toSort.length}</strong> needed sorting —{' '}
            {stillToSort === 0 ? 'all sorted' : `${toSort.length - stillToSort} sorted, ${stillToSort} still without a category (find them in the Log)`}
          </li>
        )}
        {leftOut > 0 && <li>{leftOut} left out, as you chose</li>}
      </ul>
      <p>Your safe-to-spend number now includes them.</p>
      <div class="row-gap">
        <button type="button" class="btn btn-primary" onClick={props.onClose}>
          Done
        </button>
        <button type="button" class="btn" onClick={() => setConfirming(true)}>
          Undo this import
        </button>
      </div>
      <Confirm
        open={confirming}
        title="Undo this import?"
        confirmLabel={`Remove ${imported} ${imported === 1 ? 'row' : 'rows'}`}
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          setConfirming(false);
          await props.onUndo();
        }}
      >
        <p>This removes the {imported} {imported === 1 ? 'row' : 'rows'} this import added.</p>
        {matched > 0 && <p class="muted">The {matched} things that were already in the app stay.</p>}
      </Confirm>
    </section>
  );
}

/** " — e.g. 10/01/2026" from the first data row, to make column choices obvious. */
function sample(rows: string[][], headerRow: number, col: number): string {
  const v = rows[headerRow + 1]?.[col];
  return v ? ` — e.g. ${v.length > 24 ? v.slice(0, 24) + '…' : v}` : '';
}

function parseFirst(value: string, f: 'DMY' | 'MDY'): string | null {
  const m = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})/);
  if (!m) return null;
  const [a, b, y] = [Number(m[1]), Number(m[2]), m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])];
  const [d, mo] = f === 'DMY' ? [a, b] : [b, a];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
