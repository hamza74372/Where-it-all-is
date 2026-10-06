// Spec §7.8 — bank CSV import: pick → check columns → review → import → sort → done.
// Everything is read on the device; nothing is uploaded.

import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { CsvMapping, Id, Transaction } from '../db/types';
import { merchantKey } from '../lib/csv/convert';
import { DATE_FORMAT_LABELS, type DateFormat } from '../lib/csv/dates';
import { detectMapping, type Detection, type MappingDraft } from '../lib/csv/detect';
import { parseCsv } from '../lib/csv/parse';
import { saveWithUndo } from '../state/actions';
import { addRule, commitImport, prepareImport, saveMapping, undoImport, type Prepared } from '../state/importActions';
import { useData, useStore } from '../state/store';
import { Segmented, Select, TextInput, Toggle } from '../ui/fields';
import { useFmt } from '../ui/hooks';
import { dismissToast, toast } from '../ui/Toast';

type Step = 'pick' | 'map' | 'review' | 'sort' | 'done';

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
  const [result, setResult] = useState<{ batchId: Id; imported: number; duplicates: number; toSort: Id[] } | null>(null);
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
    setMapping(saved ? (savedDraft as MappingDraft) : detection.mapping);
    setMappingName(saved?.name ?? file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 40));
    setStep('map');
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
          onBack={() => setStep('map')}
          onImport={async () => {
            const saved = await saveMapping(store, mappingName, mapping, loaded.savedId);
            const { batch, transactions } = await commitImport(store, { fileName: loaded.fileName, accountId, mappingId: saved.id, items: prepared.items });
            const toSort = transactions.filter((t) => !t.categoryId && t.amount < 0).map((t) => t.id);
            setResult({ batchId: batch.id, imported: transactions.length, duplicates: prepared.duplicateCount, toSort });
            setStep(toSort.length ? 'sort' : 'done');
          }}
        />
      )}
      {step === 'sort' && result && <SortStep ids={result.toSort} onDone={() => setStep('done')} />}
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
      <button type="button" class="link-btn back-btn" onClick={props.onClose}>
        ‹ Log
      </button>
      <h1 class="screen-title">{props.title}</h1>
      {props.children}
    </>
  );
}

function PickStep({ onFile, error }: { onFile: (f: File) => void; error: string }) {
  const store = useStore();
  const data = useData();
  const fmt = useFmt();
  const [over, setOver] = useState(false);
  const recent = [...data.importBatches].sort((a, b) => b.importedAt - a.importedAt).slice(0, 5);
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
      {recent.length > 0 && (
        <section class="card" aria-labelledby="recent-imports">
          <h2 id="recent-imports" class="card-title">
            Recent imports
          </h2>
          <ul class="rows">
            {recent.map((b) => (
              <li key={b.id} class="row">
                <span class="row-main">
                  <span>{b.fileName}</span>
                  <span class="row-sub">
                    {b.rowCount} transactions · {fmt.day(new Date(b.importedAt).toISOString().slice(0, 10))}
                  </span>
                </span>
                <button
                  type="button"
                  class="btn btn-small"
                  onClick={async () => {
                    const redo = await undoImport(store, b.id);
                    toast(`Removed ${b.rowCount} imported transactions`, redo);
                  }}
                >
                  Undo import
                </button>
              </li>
            ))}
          </ul>
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

      <section class="card" aria-labelledby="preview-title">
        <h2 id="preview-title" class="card-title">
          Preview
        </h2>
        {preview.items.length === 0 ? (
          <p class="field-error">No transactions found with these settings — try a different date or amount column below.</p>
        ) : (
          <ul class="rows">
            {preview.items.slice(0, 8).map((it) => (
              <li key={it.draft.rowIndex} class="row">
                <span class="row-main">
                  <span>{it.note || '(no description)'}</span>
                  <span class="row-sub">
                    {fmt.day(it.draft.date)}
                    {it.duplicate ? ' · already in your log' : ''}
                  </span>
                </span>
                <span class={`mono ${it.draft.amount > 0 ? 'amount-in' : ''}`}>{fmt.money(it.draft.amount, { signed: true })}</span>
              </li>
            ))}
          </ul>
        )}
        {preview.items.length > 8 && <p class="muted">…and {preview.items.length - 8} more.</p>}
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

function ReviewStep({ prepared, onBack, onImport }: { prepared: Prepared; onBack: () => void; onImport: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <section class="card" aria-labelledby="review-title">
        <h2 id="review-title" class="card-title">
          Ready to import
        </h2>
        <ul class="review-list">
          <li>
            <strong>{prepared.newCount}</strong> new {prepared.newCount === 1 ? 'transaction' : 'transactions'}
          </li>
          {prepared.duplicateCount > 0 && (
            <li>
              <strong>{prepared.duplicateCount}</strong> already in your log — these are skipped
            </li>
          )}
          {prepared.needSorting > 0 && (
            <li>
              <strong>{prepared.needSorting}</strong> will need a category (quick, one at a time)
            </li>
          )}
          {prepared.skipped.length > 0 && (
            <li>
              <strong>{prepared.skipped.length}</strong> rows left out
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
      <div class="form-actions">
        <button type="button" class="btn" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          class="btn btn-primary btn-grow"
          disabled={busy || prepared.newCount === 0}
          onClick={async () => {
            setBusy(true);
            await onImport();
          }}
        >
          {prepared.newCount === 0 ? 'Nothing new to import' : `Import ${prepared.newCount}`}
        </button>
      </div>
    </>
  );
}

function SortStep({ ids, onDone }: { ids: Id[]; onDone: () => void }) {
  const store = useStore();
  const data = useData();
  const fmt = useFmt();
  const [queue, setQueue] = useState(ids);
  const [done, setDone] = useState(0);
  const [always, setAlways] = useState(false);
  const total = ids.length;
  const tx = data.transactions.find((t) => t.id === queue[0]);
  useEffect(() => {
    if (!tx) onDone(); // everything sorted (or the rows were removed)
  }, [tx]);
  if (!tx) return null;
  const key = merchantKey(tx.importDescription ?? tx.note);
  const cats = data.categories.filter((c) => !c.archived);

  const choose = async (categoryId: Id | null) => {
    let rest = queue.slice(1);
    if (categoryId) {
      await saveWithUndo(store, 'transactions', { ...tx, categoryId });
      if (always && key) {
        await addRule(store, key, categoryId);
        // The new rule also sorts any others from this import that match.
        const matching = rest
          .map((id) => store.data.transactions.find((t) => t.id === id))
          .filter((t): t is Transaction => !!t && (t.importDescription ?? t.note).toUpperCase().includes(key));
        await store.upsert('transactions', matching.map((t) => ({ ...t, categoryId })));
        rest = rest.filter((id) => !matching.some((t) => t.id === id));
        setDone((d) => d + matching.length);
      }
    }
    setDone((d) => d + 1);
    setAlways(false);
    setQueue(rest);
    if (!rest.length) onDone();
  };

  return (
    <section class="card sort-card" aria-labelledby="sort-title">
      <p class="muted" aria-live="polite">
        {Math.min(done + 1, total)} of {total}
      </p>
      <h2 id="sort-title" class="sort-desc">
        {tx.note}
      </h2>
      <p class="sort-meta">
        <span class="mono">{fmt.money(tx.amount)}</span> · {fmt.day(tx.date)}
      </p>
      <div class="sort-grid" role="group" aria-label="Choose a category">
        {cats.map((c) => (
          <button key={c.id} type="button" class="sort-choice" onClick={() => choose(c.id)}>
            <span aria-hidden="true">{c.emoji}</span>
            <span>{c.name}</span>
          </button>
        ))}
      </div>
      {key && (
        <Toggle
          label={`Always put "${key}" in this category`}
          checked={always}
          onChange={setAlways}
          hint="Turn on before you pick — future imports will be sorted for you."
        />
      )}
      <div class="row-gap">
        <button type="button" class="btn btn-quiet" onClick={() => choose(null)}>
          Skip this one
        </button>
        <button type="button" class="btn btn-quiet" onClick={onDone}>
          Finish later
        </button>
      </div>
    </section>
  );
}

function DoneStep(props: { result: { imported: number; duplicates: number; toSort: Id[] }; onUndo: () => void; onClose: () => void }) {
  const { imported, duplicates } = props.result;
  return (
    <section class="card" aria-labelledby="done-title">
      <h2 id="done-title" class="card-title">
        Imported {imported} {imported === 1 ? 'transaction' : 'transactions'}
      </h2>
      {duplicates > 0 && <p class="muted">{duplicates} were already in your log, so they were skipped.</p>}
      <p>Your safe-to-spend number now includes them.</p>
      <div class="row-gap">
        <button type="button" class="btn btn-primary" onClick={props.onClose}>
          Done
        </button>
        <button type="button" class="btn" onClick={props.onUndo}>
          Undo this import
        </button>
      </div>
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
