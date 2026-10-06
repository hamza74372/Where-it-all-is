// Spec §7.6: accounts, paychecks, categories, notes, quick-log chips, settings, about & privacy.
import type { ComponentChildren } from 'preact';

import { useState } from 'preact/hooks';
import { DISCLAIMER } from '../copy';
import { uid } from '../db/db';
import type { Account, Category, Income, QuickPreset, Schedule, Settings } from '../db/types';
import { addDays, weekday } from '../lib/dates';
import { amountExample, CURRENCIES, CURRENCY_INFO } from '../lib/money';
import { accountBalance } from '../lib/safeToSpend';
import { describeSchedule } from '../lib/schedule';
import { clearExampleData, openingBalanceFor, saveWithUndo } from '../state/actions';
import { useData, useStore } from '../state/store';
import { checkMoney, MoneyInput, moneyText, ScheduleFields, Segmented, Select, TextInput, Toggle } from '../ui/fields';
import { useFmt, useToday } from '../ui/hooks';
import { Icon } from '../ui/icons';
import { Sheet } from '../ui/Sheet';
import { dismissToast, toast } from '../ui/Toast';
import { Notes } from './Notes';
import { CategoryForm } from './plan/Envelopes';

type Page = 'menu' | 'accounts' | 'paychecks' | 'categories' | 'notes' | 'chips' | 'settings' | 'about';

const PAGES: Array<{ id: Exclude<Page, 'menu'>; label: string; sub: string }> = [
  { id: 'accounts', label: 'Accounts', sub: 'Bank accounts, cash, savings, cards' },
  { id: 'paychecks', label: 'Paychecks', sub: 'When money comes in' },
  { id: 'categories', label: 'Categories', sub: 'Kinds of spending and their monthly amounts' },
  { id: 'notes', label: 'Notes', sub: 'A brain dump for each month' },
  { id: 'chips', label: 'Quick-log chips', sub: 'One-tap spends on Today' },
  { id: 'settings', label: 'Settings', sub: 'Theme, currency, cushion, how you type amounts' },
  { id: 'about', label: 'About & privacy', sub: 'Where your data lives' },
];

export function More() {
  const [page, setPageState] = useState<Page>('menu');
  const setPage = (p: Page) => {
    setPageState(p);
    dismissToast();
    document.getElementById('main')?.scrollTo(0, 0);
  };
  if (page === 'menu') {
    return (
      <>
        <h1 class="screen-title">More</h1>
        <ul class="card rows">
          {PAGES.map((p) => (
            <li key={p.id} class="row">
              <button type="button" class="row-main row-button" onClick={() => setPage(p.id)}>
                <span>{p.label}</span>
                <span class="row-sub">{p.sub}</span>
              </button>
              <span aria-hidden="true" class="chev">
                ›
              </span>
            </li>
          ))}
        </ul>
        <p class="muted">Rules, sharing, backups and help arrive in later updates.</p>
        <p class="footer-note">{DISCLAIMER}</p>
      </>
    );
  }
  const title = PAGES.find((p) => p.id === page)!.label;
  return (
    <>
      <button type="button" class="link-btn back-btn" onClick={() => setPage('menu')}>
        ‹ More
      </button>
      <h1 class="screen-title">{title}</h1>
      {page === 'accounts' && <Accounts />}
      {page === 'paychecks' && <Paychecks />}
      {page === 'categories' && <Categories />}
      {page === 'notes' && <Notes />}
      {page === 'chips' && <Chips />}
      {page === 'settings' && <SettingsPage />}
      {page === 'about' && <About />}
    </>
  );
}

/* ---------------- Categories ---------------- */

function Categories() {
  const data = useData();
  const fmt = useFmt();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const live = data.categories.filter((c) => !c.archived);
  const hidden = data.categories.filter((c) => c.archived);
  return (
    <>
      <ul class="card rows">
        {live.map((c) => (
          <li key={c.id} class="row">
            <button type="button" class="row-main row-button" onClick={() => setEditing(c)}>
              <span>
                <span aria-hidden="true">{c.emoji}</span> {c.name}
              </span>
              <span class="row-sub">{c.monthlyLimit != null ? `${fmt.money(c.monthlyLimit)} a month` : 'No monthly amount'}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" class="btn" onClick={() => setEditing('new')}>
        <Icon name="plus" /> Add category
      </button>
      {hidden.length > 0 && (
        <>
          <h2 class="log-day-title">Hidden</h2>
          <ul class="card rows">
            {hidden.map((c) => (
              <li key={c.id} class="row">
                <span class="row-main">
                  <span>
                    <span aria-hidden="true">{c.emoji}</span> {c.name}
                  </span>
                </span>
                <UnhideButton category={c} />
              </li>
            ))}
          </ul>
        </>
      )}
      <Sheet open={editing != null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add category' : 'Edit category'}>
        {editing != null && <CategoryForm key={editing === 'new' ? 'new' : editing.id} category={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

function UnhideButton({ category }: { category: Category }) {
  const store = useStore();
  return (
    <button
      type="button"
      class="btn btn-small"
      onClick={async () => {
        const undo = await saveWithUndo(store, 'categories', { ...category, archived: false });
        toast(`${category.name} is back`, undo);
      }}
    >
      Show again
    </button>
  );
}

/* ---------------- Accounts ---------------- */

const TYPE_LABEL: Record<Account['type'], string> = {
  checking: 'Everyday account',
  savings: 'Savings',
  cash: 'Cash',
  credit: 'Credit card',
};

function Accounts() {
  const data = useData();
  const fmt = useFmt();
  const today = useToday();
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const live = data.accounts.filter((a) => !a.archived);
  return (
    <>
      <ul class="card rows">
        {live.length === 0 && <li class="row">No accounts yet.</li>}
        {live.map((a) => {
          const bal = accountBalance(a, data.transactions, today);
          return (
            <li key={a.id} class="row">
              <button type="button" class="row-main row-button" onClick={() => setEditing(a)}>
                <span>
                  {a.name}
                  {a.id === data.settings.defaultAccountId && <span class="badge">Quick log</span>}
                </span>
                <span class="row-sub">
                  {TYPE_LABEL[a.type]} · {a.includeInSafeToSpend ? 'Counted in safe to spend' : 'Not counted'}
                </span>
              </button>
              <span class="mono">{a.type === 'credit' ? `${fmt.money(Math.max(0, -bal))} owed` : fmt.money(bal)}</span>
            </li>
          );
        })}
      </ul>
      <button type="button" class="btn" onClick={() => setEditing('new')}>
        <Icon name="plus" /> Add account
      </button>
      <Sheet open={editing != null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add account' : 'Edit account'}>
        {editing != null && (
          <AccountForm key={editing === 'new' ? 'new' : editing.id} account={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
        )}
      </Sheet>
    </>
  );
}

function AccountForm({ account, onDone }: { account: Account | null; onDone: () => void }) {
  const store = useStore();
  const data = useData();
  const today = useToday();
  const dec = data.settings.decimalSeparator;
  const current = account ? accountBalance(account, data.transactions, today) : null;
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<Account['type']>(account?.type ?? 'checking');
  const isCredit = type === 'credit';
  const [balance, setBalance] = useState(moneyText(current == null ? null : isCredit ? -current : current, dec));
  const [include, setInclude] = useState(account?.includeInSafeToSpend ?? true);
  const [makeDefault, setMakeDefault] = useState(account ? account.id === data.settings.defaultAccountId : false);
  const [showErrors, setShowErrors] = useState(false);

  const changeType = (t: Account['type']) => {
    setType(t);
    if (!account) setInclude(t === 'checking' || t === 'cash');
  };

  const save = async (e: Event) => {
    e.preventDefault();
    const c = checkMoney(balance, dec);
    if (!name.trim() || (c.state !== 'ok' && c.state !== 'empty')) return setShowErrors(true);
    const entered = c.state === 'ok' ? c.value : 0;
    const signed = isCredit ? -Math.abs(entered) : entered; // card: what you owe, stored negative
    const id = account?.id ?? uid();
    const undo = await saveWithUndo(store, 'accounts', {
        id,
        name: name.trim(),
        type,
        openingBalance: openingBalanceFor({ id }, signed, store, today),
        includeInSafeToSpend: include,
        archived: false,
    });
    if (makeDefault && !isCredit) await store.saveSettings({ defaultAccountId: id });
    toast(account ? 'Account saved' : `${name.trim()} added`, undo);
    onDone();
  };

  const archive = async () => {
    if (!account) return;
    await store.upsert('accounts', [{ ...account, archived: true }]);
    toast(`${account.name} hidden`, async () => void (await store.upsert('accounts', [{ ...account, archived: false }])));
    onDone();
  };

  return (
    <form class="form" onSubmit={save}>
      <TextInput label="Name" value={name} onInput={setName} placeholder="e.g. Chase checking" autoFocus={!account} />
      <Select
        label="Type"
        value={type}
        onChange={changeType}
        options={(Object.keys(TYPE_LABEL) as Account['type'][]).map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
      />
      <MoneyInput
        label={isCredit ? 'How much do you owe on it right now?' : 'Balance right now'}
        value={balance}
        onInput={setBalance}
        showErrors={showErrors}
        hint={account ? 'Changing this adjusts the starting balance — your log stays as it is.' : undefined}
      />
      <Toggle
        label="Count in safe to spend"
        checked={include}
        onChange={setInclude}
        hint={
          isCredit
            ? 'On: card spending comes off your number straight away (good if you pay it in full). Off: it shows as "card to pay" and is set aside when the card bill is due.'
            : 'Turn off for savings or money you don\'t want to touch.'
        }
      />
      {!isCredit && <Toggle label="Use for quick log" checked={makeDefault} onChange={setMakeDefault} />}
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-grow">
          Save
        </button>
      </div>
      {account && (
        <button type="button" class="link-btn" onClick={archive}>
          Hide this account
        </button>
      )}
    </form>
  );
}

/* ---------------- Paychecks ---------------- */

function Paychecks() {
  const data = useData();
  const fmt = useFmt();
  const [editing, setEditing] = useState<Income | 'new' | null>(null);
  return (
    <>
      <ul class="card rows">
        {data.incomes.length === 0 && <li class="row">No paychecks yet — we'll plan to the end of each month.</li>}
        {data.incomes.map((i) => (
          <li key={i.id} class="row">
            <button type="button" class="row-main row-button" onClick={() => setEditing(i)}>
              <span>
                {i.name}
                {!i.active && <span class="badge">Paused</span>}
              </span>
              <span class="row-sub">
                {describeSchedule(i.schedule)}
                {i.variable ? ' · varies' : ''}
              </span>
            </button>
            <span class="mono">
              {i.variable ? '~' : ''}
              {fmt.money(i.amount)}
            </span>
          </li>
        ))}
      </ul>
      <button type="button" class="btn" onClick={() => setEditing('new')}>
        <Icon name="plus" /> Add paycheck
      </button>
      <Sheet open={editing != null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add paycheck' : 'Edit paycheck'}>
        {editing != null && (
          <IncomeForm key={editing === 'new' ? 'new' : editing.id} income={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
        )}
      </Sheet>
    </>
  );
}

function IncomeForm({ income, onDone }: { income: Income | null; onDone: () => void }) {
  const store = useStore();
  const data = useData();
  const today = useToday();
  const dec = data.settings.decimalSeparator;
  const accounts = data.accounts.filter((a) => !a.archived && a.type !== 'credit');
  const nextFriday = addDays(today, (5 - weekday(today) + 7) % 7 || 7);
  const [name, setName] = useState(income?.name ?? 'Paycheck');
  const [amount, setAmount] = useState(moneyText(income?.amount, dec));
  const [variable, setVariable] = useState(income?.variable ?? false);
  const [schedule, setSchedule] = useState<Schedule>(income?.schedule ?? { kind: 'biweekly', anchorDate: nextFriday, weekendShift: 'before' });
  const [accountId, setAccountId] = useState(income?.accountId ?? data.settings.defaultAccountId ?? accounts[0]?.id ?? '');
  const [active, setActive] = useState(income?.active ?? true);
  const [showErrors, setShowErrors] = useState(false);

  if (!accounts.length) return <p>Add an account first, so we know where your pay lands.</p>;

  const save = async (e: Event) => {
    e.preventDefault();
    const c = checkMoney(amount, dec);
    if (!name.trim() || c.state !== 'ok') return setShowErrors(true);
    const undo = await saveWithUndo(store, 'incomes', {
      id: income?.id ?? uid(), name: name.trim(), amount: Math.abs(c.value), accountId, schedule, variable, active,
    });
    toast('Paycheck saved', undo);
    onDone();
  };

  const remove = async () => {
    if (!income) return;
    await store.remove('incomes', [income.id]);
    toast(`${income.name} deleted`, async () => void (await store.upsert('incomes', [income])));
    onDone();
  };

  return (
    <form class="form" onSubmit={save}>
      <TextInput label="Name" value={name} onInput={setName} />
      <MoneyInput label={variable ? 'About how much, on average?' : 'Amount that lands'} value={amount} onInput={setAmount} showErrors={showErrors} />
      <Toggle label="My pay varies" checked={variable} onChange={setVariable} hint="You'll confirm the real amount each payday." />
      <ScheduleFields value={schedule} onChange={setSchedule} dateLabel="Next payday" />
      {accounts.length > 1 && (
        <Select label="Paid into" value={accountId} onChange={setAccountId} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
      )}
      {income && <Toggle label="Active" checked={active} onChange={setActive} hint="Pause it if this pay has stopped for now." />}
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-grow">
          Save
        </button>
      </div>
      {income && (
        <button type="button" class="link-btn" onClick={remove}>
          Delete this paycheck
        </button>
      )}
    </form>
  );
}

/* ---------------- Quick-log chips ---------------- */

function Chips() {
  const store = useStore();
  const data = useData();
  const fmt = useFmt();
  const [editing, setEditing] = useState<QuickPreset | 'new' | null>(null);
  const presets = data.settings.presets;
  const savePresets = (p: QuickPreset[]) => store.saveSettings({ presets: p });
  return (
    <>
      <p class="muted">Tap a chip on Today to log it instantly. Up to 6.</p>
      <ul class="card rows">
        {presets.length === 0 && <li class="row">No chips.</li>}
        {presets.map((p) => (
          <li key={p.id} class="row">
            <button type="button" class="row-main row-button" onClick={() => setEditing(p)}>
              <span>
                {p.emoji} {p.label}
              </span>
              <span class="row-sub">{p.categoryName ?? 'No category'}</span>
            </button>
            <span class="mono">{fmt.money(p.amount)}</span>
          </li>
        ))}
      </ul>
      {presets.length < 6 && (
        <button type="button" class="btn" onClick={() => setEditing('new')}>
          <Icon name="plus" /> Add chip
        </button>
      )}
      <Sheet open={editing != null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add chip' : 'Edit chip'}>
        {editing != null && (
          <ChipForm
            key={editing === 'new' ? 'new' : editing.id}
            preset={editing === 'new' ? null : editing}
            onSave={async (p) => {
              await savePresets(editing === 'new' ? [...presets, p] : presets.map((x) => (x.id === p.id ? p : x)));
              setEditing(null);
            }}
            onDelete={async (p) => {
              await savePresets(presets.filter((x) => x.id !== p.id));
              toast('Chip removed', async () => void (await savePresets(presets)));
              setEditing(null);
            }}
          />
        )}
      </Sheet>
    </>
  );
}

function ChipForm(props: { preset: QuickPreset | null; onSave: (p: QuickPreset) => void; onDelete: (p: QuickPreset) => void }) {
  const data = useData();
  const dec = data.settings.decimalSeparator;
  const p = props.preset;
  const [emoji, setEmoji] = useState(p?.emoji ?? '⭐');
  const [label, setLabel] = useState(p?.label ?? '');
  const [amount, setAmount] = useState(moneyText(p?.amount, dec));
  const [categoryName, setCategoryName] = useState(p?.categoryName ?? '');
  const [showErrors, setShowErrors] = useState(false);
  return (
    <form
      class="form"
      onSubmit={(e) => {
        e.preventDefault();
        const c = checkMoney(amount, dec);
        if (!label.trim() || c.state !== 'ok') return setShowErrors(true);
        props.onSave({ id: p?.id ?? uid(), emoji: emoji.trim() || '⭐', label: label.trim(), amount: Math.abs(c.value), categoryName: categoryName || undefined });
      }}
    >
      <TextInput label="Emoji" value={emoji} onInput={setEmoji} />
      <TextInput label="Label" value={label} onInput={setLabel} placeholder="e.g. Coffee" />
      <MoneyInput label="Amount" value={amount} onInput={setAmount} showErrors={showErrors} />
      <Select
        label="Category"
        value={categoryName}
        onChange={setCategoryName}
        options={[{ value: '', label: 'None' }, ...data.categories.filter((c) => !c.archived).map((c) => ({ value: c.name, label: `${c.emoji} ${c.name}` }))]}
      />
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-grow">
          Save
        </button>
      </div>
      {p && (
        <button type="button" class="link-btn" onClick={() => props.onDelete(p)}>
          Remove this chip
        </button>
      )}
    </form>
  );
}

/* ---------------- Settings ---------------- */

function SettingsPage() {
  const store = useStore();
  const { settings } = useData();
  const set = (patch: Partial<Settings>) => store.saveSettings(patch);
  const dec = settings.decimalSeparator;
  const [cushion, setCushion] = useState(moneyText(settings.buffer || null, dec));
  const [name, setName] = useState(settings.name);

  return (
    <div class="form">
      <TextInput label="Your name" value={name} onInput={(v) => (setName(v), set({ name: v.trim() }))} />
      <Field2 label="Theme">
        <Segmented
          label="Theme"
          value={settings.theme}
          onChange={(theme) => set({ theme })}
          options={[
            { value: 'auto', label: 'Match device' },
            { value: 'soft', label: 'Soft' },
            { value: 'midnight', label: 'Midnight' },
          ]}
        />
      </Field2>
      <Select
        label="Currency"
        value={settings.currency}
        options={CURRENCIES.map((c) => ({ value: c, label: CURRENCY_INFO[c].label }))}
        onChange={(currency) => set({ currency })}
      />
      <Field2 label="How you type amounts">
        <Segmented
          label="Decimal point"
          value={dec}
          onChange={(d) => {
            set({ decimalSeparator: d });
            setCushion(moneyText(settings.buffer || null, d));
          }}
          options={[
            { value: '.', label: amountExample('.') },
            { value: ',', label: amountExample(',') },
          ]}
        />
      </Field2>
      <MoneyInput
        label="Cushion"
        value={cushion}
        onInput={(v) => {
          setCushion(v);
          const c = checkMoney(v, dec);
          if (c.state === 'ok') set({ buffer: Math.abs(c.value) });
          if (c.state === 'empty') set({ buffer: 0 });
        }}
        hint="Kept back from safe to spend, just in case. Leave blank for none."
      />
      <Toggle
        label="Some bills come out before my pay arrives on payday"
        checked={settings.billsBeforePayOnPayday}
        onChange={(v) => set({ billsBeforePayOnPayday: v })}
        hint="Turn on if your bank takes payments before wages land. Bills due on payday are then set aside too."
      />
      <Select
        label="Weeks start on"
        value={String(settings.weekStart) as '0' | '1' | '6'}
        options={[
          { value: '1', label: 'Monday' },
          { value: '0', label: 'Sunday' },
          { value: '6', label: 'Saturday' },
        ]}
        onChange={(v) => set({ weekStart: Number(v) as 0 | 1 | 6 })}
      />
    </div>
  );
}

function Field2(props: { label: string; children: ComponentChildren }) {
  return (
    <div class="field">
      <span class="field-label">{props.label}</span>
      {props.children}
    </div>
  );
}

/* ---------------- About ---------------- */

function About() {
  const store = useStore();
  const { settings } = useData();
  return (
    <div class="card prose">
      <h2 class="card-title">Your data stays here</h2>
      <p>
        Everything you enter is stored on this device, in this browser. There's no account and no cloud. Nothing is sent
        anywhere — the app makes no network requests at all, and there are no analytics or trackers.
      </p>
      <p>
        That also means clearing this browser's site data deletes your budget. Backups are coming in a later update — until
        then, avoid clearing browsing data for this app.
      </p>
      <h2 class="card-title">The small print</h2>
      <p>{DISCLAIMER}</p>
      <p>Licensed for personal and household use. Please don't resell or redistribute it.</p>
      <p class="muted">Version {__APP_VERSION__}</p>
      {settings.exampleData && (
        <button type="button" class="btn" onClick={() => clearExampleData(store)}>
          Clear example numbers and set up mine
        </button>
      )}
    </div>
  );
}
