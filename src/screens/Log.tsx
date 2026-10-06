// Spec §7.3: month view grouped by day, search across all months (grouped by month), filters by
// account and category, add / edit / delete with undo.

import { useMemo, useState } from 'preact/hooks';
import { uid } from '../db/db';
import type { Transaction } from '../db/types';
import { addMonthsYM, parts, ymd } from '../lib/dates';
import { isBeforeStart } from '../lib/safeToSpend';
import { addTransfer, deleteTransactions, defaultAccount, saveWithUndo } from '../state/actions';
import { filterLog, groupBy, LOG_PAGE } from '../lib/logFilter';
import { isTransfer } from '../lib/transfers';
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
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [shown, setShown] = useState(LOG_PAGE);
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const prefix = ymd(ym.y, ym.m, 1).slice(0, 7);
  const searching = query.trim() !== '';
  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);
  const accById = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts]);
  const liveAccounts = data.accounts.filter((a) => !a.archived);

  const rows = useMemo(
    () => filterLog(data.transactions, { month: prefix, query, accountId, categoryId }, data.categories),
    [data.transactions, data.categories, prefix, query, accountId, categoryId],
  );
  const groups = useMemo(() => groupBy(rows.slice(0, shown), searching ? 'month' : 'day'), [rows, shown, searching]);
  const moneyOut = rows.filter((r) => r.amount < 0 && !isTransfer(r) && r.source !== 'adjustment').reduce((s, r) => s - r.amount, 0);
  const filtered = !!accountId || !!categoryId;
  // A new search or filter starts from the top of the list again.
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setShown(LOG_PAGE);
  };

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
      {!searching && (
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
      )}
      <input
        class="input search"
        type="search"
        placeholder="Search all months"
        aria-label="Search transactions"
        value={query}
        onInput={(e) => reset(setQuery)(e.currentTarget.value)}
      />
      <div class="log-filters">
        {liveAccounts.length > 1 && (
          <Select
            label="Show account"
            value={accountId}
            onChange={reset(setAccountId)}
            options={[{ value: '', label: 'All accounts' }, ...liveAccounts.map((a) => ({ value: a.id, label: a.name }))]}
          />
        )}
        <Select
          label="Show category"
          value={categoryId}
          onChange={reset(setCategoryId)}
          options={[
            { value: '', label: 'All categories' },
            { value: 'none', label: 'No category' },
            ...data.categories.filter((c) => !c.archived).map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` })),
          ]}
        />
      </div>
      <p class="muted" aria-live="polite">
        {searching
          ? `${rows.length} ${rows.length === 1 ? 'result' : 'results'} across all months · money out ${fmt.money(moneyOut)}`
          : `Money out this month${filtered ? ' (filtered)' : ''}: ${fmt.money(moneyOut)}`}
      </p>
      {groups.length === 0 ? (
        <div class="card">
          <p>
            {searching
              ? 'Nothing matches that search in any month.'
              : filtered
                ? 'Nothing this month matches these filters.'
                : 'Nothing logged this month yet. Use the box on Today — "12.50 coffee" is enough.'}
          </p>
        </div>
      ) : (
        groups.map(([key, list]) => {
          const title = searching ? fmt.month(`${key}-01`) : fmt.dayLong(key);
          return (
            <section key={key} class="log-day" aria-label={title}>
              <h3 class="log-day-title">{title}</h3>
              <ul class="card rows">
                {list.map((tx) => {
                  const cat = catById.get(tx.categoryId ?? '');
                  const acc = accById.get(tx.accountId);
                  const tag = tx.transferId && tx.source !== 'transfer' ? 'Transfer' : SOURCE_LABEL[tx.source];
                  return (
                    <li key={tx.id} class="row">
                      <button type="button" class="row-main row-button" onClick={() => setEditing(tx)}>
                        <span>
                          <span aria-hidden="true">{cat?.emoji ?? '•'} </span>
                          {tx.note || cat?.name || 'Spend'}
                        </span>
                        <span class="row-sub">
                          {[searching ? fmt.day(tx.date) : '', cat?.name, acc?.name, tag, isBeforeStart(acc, tx) ? 'Before you started' : '']
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </button>
                      <span class={`mono ${tx.amount > 0 ? 'amount-in' : ''}`}>{fmt.money(tx.amount, { signed: true })}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
      {rows.length > shown && (
        <button type="button" class="btn btn-block" onClick={() => setShown(shown + LOG_PAGE)}>
          Show more ({rows.length - shown} left)
        </button>
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
  const fmt = useFmt();
  const dec = data.settings.decimalSeparator;
  const [direction, setDirection] = useState<'out' | 'in' | 'transfer'>(tx && tx.amount > 0 ? 'in' : 'out');
  const [amount, setAmount] = useState(moneyText(tx ? Math.abs(tx.amount) : null, dec));
  const [note, setNote] = useState(tx?.note ?? '');
  const [date, setDate] = useState(tx?.date ?? today);
  const [categoryId, setCategoryId] = useState(tx?.categoryId ?? '');
  const [accountId, setAccountId] = useState(tx?.accountId ?? defaultAccount(store)?.id ?? '');
  const live = data.accounts.filter((a) => !a.archived);
  const [toAccountId, setToAccountId] = useState(live.find((a) => a.id !== accountId)?.id ?? '');
  const [showErrors, setShowErrors] = useState(false);
  // Either side of a transfer: change it by deleting (both sides go) and adding it again.
  const locked = !!tx && isTransfer(tx);
  const partner = locked ? data.transactions.find((t) => t.transferId === tx.transferId && t.id !== tx.id) : undefined;
  const accName = (id?: string) => data.accounts.find((a) => a.id === id)?.name ?? 'another account';

  const save = async (e: Event) => {
    e.preventDefault();
    const c = checkMoney(amount, dec);
    if (c.state !== 'ok' || !accountId) return setShowErrors(true);
    const value = Math.abs(c.value);
    if (direction === 'transfer') {
      if (!toAccountId || toAccountId === accountId) return setShowErrors(true);
      const { undo } = await addTransfer(store, { fromAccountId: accountId, toAccountId, amount: value, date, note: note.trim() || 'Transfer' });
      toast(`Moved ${fmt.money(value)} to ${accName(toAccountId)}`, undo);
      return onDone();
    }
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
        <p class="muted">
          {tx.billId
            ? 'This is a card payment (a transfer between your accounts). To change it, delete it and mark the bill paid again.'
            : `This is a transfer ${tx.amount < 0 ? 'to' : 'from'} ${accName(partner?.accountId)}. It isn't spending or income. To change it, delete it (both sides go) and add it again.`}
        </p>
      ) : (
        <>
          <Segmented
            label="Money in or out"
            value={direction}
            onChange={setDirection}
            options={[
              { value: 'out', label: 'Money out' },
              { value: 'in', label: 'Money in' },
              ...(!tx && live.length > 1 ? [{ value: 'transfer' as const, label: 'Transfer' }] : []),
            ]}
          />
          <MoneyInput label="Amount" value={amount} onInput={setAmount} showErrors={showErrors} autoFocus={!tx} />
          <TextInput label="Note" value={note} onInput={setNote} placeholder={direction === 'transfer' ? 'e.g. To savings' : 'What was it?'} />
          {direction !== 'transfer' && (
            <Select
              label="Category"
              value={categoryId}
              onChange={setCategoryId}
              options={[{ value: '', label: 'None' }, ...data.categories.filter((c) => !c.archived).map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` }))]}
            />
          )}
          <DateInput label="Date" value={date} onInput={setDate} />
          {(live.length > 1 || direction === 'transfer') && (
            <Select
              label={direction === 'transfer' ? 'From' : 'Account'}
              value={accountId}
              onChange={setAccountId}
              options={live.map((a) => ({ value: a.id, label: a.name }))}
            />
          )}
          {direction === 'transfer' && (
            <>
              <Select label="To" value={toAccountId} onChange={setToAccountId} options={live.map((a) => ({ value: a.id, label: a.name }))} />
              {showErrors && toAccountId === accountId && <p class="field-error">Pick two different accounts.</p>}
              <p class="field-hint">A transfer isn't spending or income — it just moves money between your accounts.</p>
            </>
          )}
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-grow">
              Save
            </button>
          </div>
        </>
      )}
      {tx && (
        <button type="button" class="link-btn delete-btn" onClick={remove}>
          Delete this entry
        </button>
      )}
    </form>
  );
}
