// Spec §7.4 — bill list + month calendar with paydays, mark paid, big yearly bills helper.

import { useState } from 'preact/hooks';
import { uid } from '../db/db';
import type { Bill, ISODate, Schedule } from '../db/types';
import { billsBetween, monthlySetAside, nextUnpaid, paydaysBetween } from '../lib/bills';
import { addMonthsYM, daysInMonth, parts, weekday, ymd } from '../lib/dates';
import { describeSchedule } from '../lib/schedule';
import { billPaymentAmount, markBillPaid, saveWithUndo } from '../state/actions';
import { useData, useStore } from '../state/store';
import { checkMoney, MoneyInput, moneyText, ScheduleFields, Segmented, Select, TextInput, Toggle } from '../ui/fields';
import { useFmt, useToday } from '../ui/hooks';
import { Icon } from '../ui/icons';
import { Sheet } from '../ui/Sheet';
import { toast } from '../ui/Toast';

export function Bills() {
  const data = useData();
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [editing, setEditing] = useState<Bill | 'new' | null>(null);
  const active = data.bills.filter((b) => b.active);
  const yearly = active.filter((b) => monthlySetAside(b) > 0);

  return (
    <>
      <div class="title-row">
        <h1 class="screen-title">Bills</h1>
        <button type="button" class="btn btn-small btn-primary" onClick={() => setEditing('new')}>
          <Icon name="plus" /> Add bill
        </button>
      </div>
      <Segmented
        label="Show bills as"
        value={view}
        onChange={setView}
        options={[
          { value: 'list', label: 'List' },
          { value: 'calendar', label: 'Calendar' },
        ]}
      />
      {view === 'list' ? <BillList bills={active} onEdit={setEditing} /> : <Calendar onEdit={setEditing} />}
      {yearly.length > 0 && view === 'list' && <BigBills bills={yearly} />}
      <BillSheet bill={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function BillList({ bills, onEdit }: { bills: Bill[]; onEdit: (b: Bill) => void }) {
  const store = useStore();
  const data = useData();
  const fmt = useFmt();
  const today = useToday();
  if (!bills.length) {
    return (
      <div class="card">
        <p>No bills yet. Add rent, phone, subscriptions — anything that comes out regularly. They'll be set aside before payday.</p>
      </div>
    );
  }
  const rows = bills
    .map((bill) => ({ bill, due: nextUnpaid(bill, today, data.transactions) }))
    .sort((a, b) => (a.due ?? '9999') .localeCompare(b.due ?? '9999'));

  return (
    <ul class="card rows" aria-label="Bills">
      {rows.map(({ bill, due }) => {
        const amount = billPaymentAmount(store, bill, today);
        const overdue = due != null && due < today;
        return (
          <li key={bill.id} class="row row-bill">
            <button type="button" class="row-main row-button" onClick={() => onEdit(bill)} aria-label={`Edit ${bill.name}`}>
              <span>
                {bill.name}
                {bill.autopay && <span class="badge">Autopay</span>}
              </span>
              <span class="row-sub">
                {due ? `${overdue ? 'Was due' : 'Next'} ${fmt.day(due)} (${fmt.relative(due, today)})` : 'No more due dates'} ·{' '}
                {describeSchedule(bill.schedule)}
              </span>
            </button>
            <span class="row-end">
              <span class="mono">{fmt.money(amount)}</span>
              {due && (
                <button
                  type="button"
                  class="btn btn-small"
                  onClick={async () => {
                    const undo = await markBillPaid(store, bill, due, overdue ? due : today, amount);
                    toast(`${bill.name} marked paid`, undo);
                  }}
                  aria-label={`Mark ${bill.name} paid for ${fmt.day(due)}`}
                >
                  Mark paid
                </button>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function BigBills({ bills }: { bills: Bill[] }) {
  const fmt = useFmt();
  const total = bills.reduce((s, b) => s + monthlySetAside(b), 0);
  return (
    <section class="card" aria-labelledby="big-bills">
      <h2 id="big-bills" class="card-title">
        Big yearly bills
      </h2>
      <p class="muted">Putting a little aside each month means these never land all at once.</p>
      <ul class="rows">
        {bills.map((b) => (
          <li key={b.id} class="row">
            <span class="row-main">
              <span>{b.name}</span>
              <span class="row-sub">
                {fmt.money(b.amount)}, {describeSchedule(b.schedule)}
              </span>
            </span>
            <span class="mono">{fmt.money(monthlySetAside(b))}/mo</span>
          </li>
        ))}
      </ul>
      <p>
        Set aside about <strong>{fmt.money(total)}</strong> a month in total.
      </p>
    </section>
  );
}

function Calendar({ onEdit }: { onEdit: (b: Bill) => void }) {
  const data = useData();
  const fmt = useFmt();
  const today = useToday();
  const t = parts(today);
  const [ym, setYm] = useState({ y: t.y, m: t.m });
  const [selected, setSelected] = useState<ISODate>(today);
  const first = ymd(ym.y, ym.m, 1);
  const last = ymd(ym.y, ym.m, daysInMonth(ym.y, ym.m));
  const bills = billsBetween(data.bills, first, last, data.transactions);
  const paydays = paydaysBetween(data.incomes, first, last);
  const weekStart = data.settings.weekStart;
  const lead = (weekday(first) - weekStart + 7) % 7;
  const dayNames = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(data.settings.locale, { weekday: 'narrow', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2023, 0, 1 + ((weekStart + i) % 7))), // 1 Jan 2023 was a Sunday
    ),
  );
  const shift = (n: number) => setYm(addMonthsYM(ym.y, ym.m, n));
  const selBills = bills.filter((b) => b.date === selected);
  const selPay = paydays.filter((p) => p.date === selected);

  return (
    <section class="card cal-card" aria-label="Bills calendar">
      <div class="cal-head">
        <button type="button" class="icon-btn" onClick={() => shift(-1)} aria-label="Previous month">
          ‹
        </button>
        <h2 class="card-title" aria-live="polite">
          {fmt.month(first)}
        </h2>
        <button type="button" class="icon-btn" onClick={() => shift(1)} aria-label="Next month">
          ›
        </button>
      </div>
      <div class="cal-grid" role="grid">
        {dayNames.map((d, i) => (
          <span key={`h${i}`} class="cal-dow" aria-hidden="true">
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`e${i}`} />
        ))}
        {Array.from({ length: daysInMonth(ym.y, ym.m) }, (_, i) => {
          const date = ymd(ym.y, ym.m, i + 1);
          const db = bills.filter((b) => b.date === date);
          const dp = paydays.filter((p) => p.date === date);
          const label = [fmt.day(date), ...dp.map(() => 'payday'), ...db.map((b) => `${b.bill.name}${b.paid ? ' (paid)' : ''}`)].join(', ');
          return (
            <button
              key={date}
              type="button"
              class={`cal-day ${date === today ? 'is-today' : ''} ${date === selected ? 'is-selected' : ''}`}
              aria-label={label}
              aria-pressed={date === selected}
              onClick={() => setSelected(date)}
            >
              <span>{i + 1}</span>
              <span class="cal-dots" aria-hidden="true">
                {dp.length > 0 && <i class="dot dot-pay" />}
                {db.some((b) => !b.paid) && <i class="dot dot-bill" />}
                {db.length > 0 && db.every((b) => b.paid) && <i class="dot dot-paid" />}
              </span>
            </button>
          );
        })}
      </div>
      <p class="cal-legend muted">
        <i class="dot dot-pay" /> Payday <i class="dot dot-bill" /> Bill due <i class="dot dot-paid" /> Paid
      </p>
      <h3 class="cal-sel-title">{fmt.dayLong(selected)}</h3>
      {selPay.length + selBills.length === 0 ? (
        <p class="muted">Nothing on this day.</p>
      ) : (
        <ul class="rows">
          {selPay.map((p) => (
            <li key={p.income.id} class="row">
              <span class="row-main">💰 {p.income.name}</span>
              <span class="mono">{fmt.money(p.income.amount)}</span>
            </li>
          ))}
          {selBills.map((b) => (
            <li key={b.bill.id} class="row">
              <button type="button" class="row-main row-button" onClick={() => onEdit(b.bill)}>
                {b.bill.name} {b.paid && <span class="badge">Paid</span>}
              </button>
              <span class="mono">{fmt.money(b.bill.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BillSheet({ bill, onClose }: { bill: Bill | 'new' | null; onClose: () => void }) {
  return (
    <Sheet open={bill != null} onClose={onClose} title={bill === 'new' ? 'Add a bill' : 'Edit bill'}>
      {bill != null && <BillForm key={bill === 'new' ? 'new' : bill.id} bill={bill === 'new' ? null : bill} onDone={onClose} />}
    </Sheet>
  );
}

function BillForm({ bill, onDone }: { bill: Bill | null; onDone: () => void }) {
  const store = useStore();
  const data = useData();
  const today = useToday();
  const dec = data.settings.decimalSeparator;
  const payFrom = data.accounts.filter((a) => !a.archived && a.type !== 'credit');
  const cards = data.accounts.filter((a) => !a.archived && a.type === 'credit');

  const [name, setName] = useState(bill?.name ?? '');
  const [amount, setAmount] = useState(moneyText(bill?.amount, dec));
  const [schedule, setSchedule] = useState<Schedule>(
    bill?.schedule ?? { kind: 'monthly', anchorDate: today, dayOfMonth: parts(today).d, weekendShift: 'none' },
  );
  const [accountId, setAccountId] = useState(bill?.accountId ?? store.data.settings.defaultAccountId ?? payFrom[0]?.id ?? '');
  const [payTo, setPayTo] = useState(bill?.payToAccountId ?? '');
  const [followCard, setFollowCard] = useState(bill ? bill.amountSource !== 'fixed' : true);
  const [categoryId, setCategoryId] = useState(bill?.categoryId ?? '');
  const [autopay, setAutopay] = useState(bill?.autopay ?? false);
  const [showErrors, setShowErrors] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isCardBill = !!payTo;
  const amountCheck = checkMoney(amount, dec);
  const amountOk = isCardBill && followCard ? amountCheck.state !== 'invalid' && amountCheck.state !== 'confirm' : amountCheck.state === 'ok';

  const save = async (e: Event) => {
    e.preventDefault();
    if (!name.trim() || !amountOk || !accountId) return setShowErrors(true);
    const value = amountCheck.state === 'ok' ? amountCheck.value : 0;
    const row: Omit<Bill, 'updatedAt'> = {
      id: bill?.id ?? uid(),
      name: name.trim(),
      amount: Math.abs(value),
      accountId,
      categoryId: categoryId || undefined,
      schedule,
      autopay,
      isDebtMinimum: bill?.isDebtMinimum ?? false,
      debtId: bill?.debtId,
      payToAccountId: payTo || undefined,
      amountSource: payTo ? (followCard ? 'cardBalance' : 'fixed') : undefined,
      active: true,
    };
    const undo = await saveWithUndo(store, 'bills', row);
    toast(bill ? 'Bill saved' : `${row.name} added`, undo);
    onDone();
  };

  const remove = async () => {
    if (!bill) return;
    await store.remove('bills', [bill.id]);
    toast(`${bill.name} deleted`, async () => void (await store.upsert('bills', [bill])));
    onDone();
  };

  if (!payFrom.length) {
    return <p>Add an account first (More → Accounts), so we know where bills are paid from.</p>;
  }

  return (
    <form onSubmit={save} class="form">
      <TextInput label="Name" value={name} onInput={setName} placeholder="e.g. Phone" autoFocus={!bill} />
      {showErrors && !name.trim() && <p class="field-error">Give it a name so you can spot it.</p>}
      {cards.length > 0 && (
        <Select
          label="Is this a credit card payment?"
          value={payTo}
          onChange={setPayTo}
          options={[{ value: '', label: 'No' }, ...cards.map((c) => ({ value: c.id, label: `Yes — pays ${c.name}` }))]}
        />
      )}
      {isCardBill && (
        <Toggle
          label="Use what I owe on the card"
          checked={followCard}
          onChange={setFollowCard}
          hint="Sets aside your current card balance. Turn off to use a fixed amount, like the minimum."
        />
      )}
      {!(isCardBill && followCard) && (
        <MoneyInput label="Amount" value={amount} onInput={setAmount} showErrors={showErrors} />
      )}
      <ScheduleFields value={schedule} onChange={setSchedule} dateLabel="Next due date" />
      {payFrom.length > 1 && (
        <Select label="Paid from" value={accountId} onChange={setAccountId} options={payFrom.map((a) => ({ value: a.id, label: a.name }))} />
      )}
      {!isCardBill && (
        <Select
          label="Category"
          value={categoryId}
          onChange={setCategoryId}
          options={[{ value: '', label: 'None' }, ...data.categories.filter((c) => !c.archived).map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` }))]}
        />
      )}
      <Toggle label="Autopay" checked={autopay} onChange={setAutopay} hint="Comes out by itself. We'll still ask you to confirm it went." />
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-grow">
          Save
        </button>
      </div>
      {bill &&
        (confirmDelete ? (
          <div class="row-gap">
            <span>Delete {bill.name}? Past payments stay in your log.</span>
            <button type="button" class="btn btn-small" onClick={remove}>
              Delete
            </button>
            <button type="button" class="btn btn-small btn-quiet" onClick={() => setConfirmDelete(false)}>
              Keep
            </button>
          </div>
        ) : (
          <button type="button" class="link-btn" onClick={() => setConfirmDelete(true)}>
            Delete this bill
          </button>
        ))}
    </form>
  );
}
