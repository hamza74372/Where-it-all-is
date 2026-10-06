// Spec §7.3 (basic version for Phase 2): month view grouped by day, search, add / edit / delete with undo.

import { useMemo, useState } from 'preact/hooks';
import { uid } from '../db/db';
import type { Transaction } from '../db/types';
import { addMonthsYM, parts, ymd } from '../lib/dates';
import { isBeforeStart } from '../lib/safeToSpend';
import { deleteTransactions, defaultAccount, saveWithUndo } from '../state/actions';
import { useData, useStore } from '../state/store';
import { checkMoney, DateInput, MoneyInput, moneyText, Segmented, Select, TextInput } from '../ui/fields';
import { useFmt, useToday } from '../ui/hooks';
import { Icon } from '../ui/icons';
import { Sheet } from '../ui/Sheet';
import { toast } from '../ui/Toast';
import { Import } from './Import';

const SOURCE_LABEL: Record<Transaction['source'], string> = {
  manual: '',
  import: 'Imported',
  bill: 'Bill',
  income: 'Pay',
  transfer: 'Transfer',
  adjustment: 'Balance adjustment',
};

export function Log() {
  const data = useData();
  const fmt = useFmt();
  const today = useToday();
  const t = parts(today);
  const [ym, setYm] = useState({ y: t.y, m: t.m });
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const prefix = ymd(ym.y, ym.m, 1).slice(0, 7);
  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);
  const accById = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = data.transactions
      .filter((tx) => tx.date.startsWith(prefix))
      .filter((tx) => !q || tx.note.toLowerCase().includes(q) || catById.get(tx.categoryId ?? '')?.name.toLowerCase().includes(q))
      .sort((a, b) => (a.date === b.date ? b.updatedAt - a.updatedAt : a.date < b.date ? 1 : -1));
    const out = new Map<string, Transaction[]>();
    for (const r of rows) out.set(r.date, [...(out.get(r.date) ?? []), r]);
    return [...out.entries()];
  }, [data.transactions, prefix, query, catById]);

  const monthOut = groups.flatMap(([, rows]) => rows).filter((r) => r.amount < 0 && r.source !== 'transfer').reduce((s, r) => s - r.amount, 0);

  if (importing) return <Import onClose={() => setImporting(false)} />;

  return (
    <>
      <div class="title-row">
        <h1 class="screen-title">Log</h1>
        <div class="row-gap">
          <button type="button" class="btn btn-small" onClick={() => setImporting(true)}>
            Import statement
          </button>
          <button type="button" class="btn btn-small btn-primary" onClick={() => setEditing('new')}>
            <Icon name="plus" /> Add
          </button>
        </div>
      </div>
      <div class="cal-head">
        <button type="button" class="icon-btn" onClick={() => setYm(addMonthsYM(ym.y, ym.m, -1))} aria-label="Previous month">
          ‹
        </button>
        <h2 class="card-title" aria-live="polite">
          {fmt.month(`${prefix}-01`)}
        </h2>
        <button type="button" class="icon-btn" onClick={() => setYm(addMonthsYM(ym.y, ym.m, 1))} aria-label="Next month">
          ›
        </button>
      </div>
      <input
        class="input search"
        type="search"
        placeholder="Search notes or categories"
        aria-label="Search transactions"
        value={query}
        onInput={(e) => setQuery(e.currentTarget.value)}
      />
      <p class="muted">Money out this month: {fmt.money(monthOut)}</p>
      {groups.length === 0 ? (
        <div class="card">
          <p>{query ? 'Nothing matches that search.' : 'Nothing logged this month yet. Use the box on Today — "12.50 coffee" is enough.'}</p>
        </div>
      ) : (
        groups.map(([date, rows]) => (
          <section key={date} class="log-day" aria-label={fmt.dayLong(date)}>
            <h3 class="log-day-title">{fmt.dayLong(date)}</h3>
            <ul class="card rows">
              {rows.map((tx) => {
                const cat = catById.get(tx.categoryId ?? '');
                const tag = SOURCE_LABEL[tx.source];
                return (
                  <li key={tx.id} class="row">
                    <button type="button" class="row-main row-button" onClick={() => setEditing(tx)}>
                      <span>
                        <span aria-hidden="true">{cat?.emoji ?? '•'} </span>
                        {tx.note || cat?.name || 'Spend'}
                      </span>
                      <span class="row-sub">
                        {[cat?.name, accById.get(tx.accountId)?.name, tag, isBeforeStart(accById.get(tx.accountId), tx) ? 'Before you started' : ''].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                    <span class={`mono ${tx.amount > 0 ? 'amount-in' : ''}`}>{fmt.money(tx.amount, { signed: true })}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      <Sheet open={editing != null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add to log' : 'Edit'}>
        {editing != null && (
          <TxForm key={editing === 'new' ? 'new' : editing.id} tx={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
        )}
      </Sheet>
    </>
  );
}

function TxForm({ tx, onDone }: { tx: Transaction | null; onDone: () => void }) {
  const store = useStore();
  const data = useData();
  const today = useToday();
  const dec = data.settings.decimalSeparator;
  const [direction, setDirection] = useState<'out' | 'in'>(tx && tx.amount > 0 ? 'in' : 'out');
  const [amount, setAmount] = useState(moneyText(tx ? Math.abs(tx.amount) : null, dec));
  const [note, setNote] = useState(tx?.note ?? '');
  const [date, setDate] = useState(tx?.date ?? today);
  const [categoryId, setCategoryId] = useState(tx?.categoryId ?? '');
  const [accountId, setAccountId] = useState(tx?.accountId ?? defaultAccount(store)?.id ?? '');
  const [showErrors, setShowErrors] = useState(false);
  const locked = tx?.source === 'transfer'; // edit transfers by deleting + re-marking the bill

  const save = async (e: Event) => {
    e.preventDefault();
    const c = checkMoney(amount, dec);
    if (c.state !== 'ok' || !accountId) return setShowErrors(true);
    const value = Math.abs(c.value);
    const undo = await saveWithUndo(store, 'transactions', {
        ...(tx ?? { id: uid(), source: 'manual' as const, cleared: false }),
        date,
        note: note.trim(),
        amount: direction === 'out' ? -value : value,
        categoryId: categoryId || undefined,
        accountId,
    });
    toast(tx ? 'Saved' : 'Added', undo);
    onDone();
  };

  const remove = async () => {
    if (!tx) return;
    const undo = await deleteTransactions(store, [tx]);
    toast('Deleted', undo);
    onDone();
  };

  if (!data.accounts.length) return <p>Add an account first (More → Accounts).</p>;

  return (
    <form class="form" onSubmit={save}>
      {locked ? (
        <p class="muted">This is a card payment (a transfer between your accounts). To change it, delete it and mark the bill paid again.</p>
      ) : (
        <>
          <Segmented
            label="Money in or out"
            value={direction}
            onChange={setDirection}
            options={[
              { value: 'out', label: 'Money out' },
              { value: 'in', label: 'Money in' },
            ]}
          />
          <MoneyInput label="Amount" value={amount} onInput={setAmount} showErrors={showErrors} autoFocus={!tx} />
          <TextInput label="Note" value={note} onInput={setNote} placeholder="What was it?" />
          <Select
            label="Category"
            value={categoryId}
            onChange={setCategoryId}
            options={[{ value: '', label: 'None' }, ...data.categories.filter((c) => !c.archived).map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` }))]}
          />
          <DateInput label="Date" value={date} onInput={setDate} />
          {data.accounts.filter((a) => !a.archived).length > 1 && (
            <Select
              label="Account"
              value={accountId}
              onChange={setAccountId}
              options={data.accounts.filter((a) => !a.archived).map((a) => ({ value: a.id, label: a.name }))}
            />
          )}
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-grow">
              Save
            </button>
          </div>
        </>
      )}
      {tx && (
        <button type="button" class="link-btn" onClick={remove}>
          Delete
        </button>
      )}
    </form>
  );
}
