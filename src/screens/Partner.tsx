// Spec §7.9 — household sharing without a server: an encrypted summary file your partner opens
// in their own copy. It shows up as a separate, read-only Partner tab.

import qrcode from 'qrcode-generator';
import { useState } from 'preact/hooks';
import { isEncryptedFile, MIN_PASSPHRASE, NotOurFileError, type EncryptedFile } from '../lib/backup/crypto';
import { fromShareCode, type PartnerSummary } from '../lib/backup/partner';
import { todayISO } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { saveFile } from '../lib/saveFile';
import { makePartnerShare, openPartnerShare, removePartnerShare, type PartnerShareFile } from '../state/backupActions';
import { useNav } from '../state/nav';
import { useData, useStore } from '../state/store';
import { Toggle } from '../ui/fields';
import { makeFmt, useToday } from '../ui/hooks';
import { Progress } from '../ui/Progress';
import { toast } from '../ui/Toast';

export const STALE_DAYS = 3;

function PassInput(props: { id: string; label: string; value: string; onInput: (v: string) => void; autoComplete: string }) {
  return (
    <div class="field">
      <label class="field-label" for={props.id}>
        {props.label}
      </label>
      <input
        id={props.id}
        class="input"
        type="password"
        spellcheck={false}
        autoComplete={props.autoComplete}
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
      />
    </div>
  );
}

/** More → Share with partner. */
export function ShareWithPartner() {
  const data = useData();
  return (
    <>
      <p class="muted">
        No account, no cloud. You make a locked file and send it however you like — AirDrop, WhatsApp, email. Your partner opens it in their
        own copy of the app, where it shows as a read-only Partner tab. It never mixes with their own budget.
      </p>
      <CreateShare />
      <OpenShare />
      {data.partner && <PartnerHeldNote />}
    </>
  );
}

function CreateShare() {
  const store = useStore();
  const today = useToday();
  const [includeTx, setIncludeTx] = useState(false);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<PartnerShareFile | null>(null);
  const [showQr, setShowQr] = useState(false);
  const ok = pass.length >= MIN_PASSPHRASE && pass === pass2;

  return (
    <section class="card" aria-labelledby="share-make">
      <h2 id="share-make" class="card-title">
        Share with your partner
      </h2>
      <p class="muted">Includes: safe to spend today, bills and paydays for the next 6 weeks, envelopes and goals.</p>
      <Toggle
        label="Include recent transactions"
        checked={includeTx}
        onChange={setIncludeTx}
        hint="Off by default. When on, the last 30 days of spending are included too."
      />
      <PassInput id="share-pass" label="Passphrase for this share" value={pass} onInput={setPass} autoComplete="new-password" />
      <PassInput id="share-pass2" label="Type it again" value={pass2} onInput={setPass2} autoComplete="new-password" />
      <p class="field-hint">Tell your partner the passphrase separately, not in the same message as the file.</p>
      {pass.length > 0 && pass.length < MIN_PASSPHRASE && <p class="field-error">Use at least {MIN_PASSPHRASE} characters (a few words is best).</p>}
      {pass2.length > 0 && pass !== pass2 && <p class="field-error">The two passphrases don’t match.</p>}
      <button
        type="button"
        class="btn btn-primary btn-block"
        disabled={!ok || busy}
        onClick={async () => {
          setBusy(true);
          try {
            const file = await makePartnerShare(store, today, includeTx, pass);
            setMade(file);
            const outcome = await saveFile(file);
            if (outcome !== 'cancelled') toast('Share file ready to send');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Locking…' : 'Create share file'}
      </button>
      {made && (
        <div class="share-made">
          <p>
            Made <strong>{made.name}</strong>. Send it to your partner; they open it from More → Share with partner.
          </p>
          <button type="button" class="btn btn-small" onClick={() => saveFile(made)}>
            Save or send it again
          </button>
          {made.code ? (
            <>
              <button type="button" class="btn btn-small" aria-expanded={showQr} onClick={() => setShowQr(!showQr)}>
                {showQr ? 'Hide QR code' : 'Show as a QR code'}
              </button>
              {showQr && <QrBlock code={made.code} />}
            </>
          ) : (
            <p class="field-hint">This share is too big for a QR code, so use the file.</p>
          )}
        </div>
      )}
    </section>
  );
}

function QrBlock({ code }: { code: string }) {
  const qr = qrcode(0, 'L');
  qr.addData(code);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  return (
    <div class="qr-block">
      {/* Generated locally by qrcode-generator; contains only the locked share code. */}
      <div class="qr-svg" role="img" aria-label="QR code for this share" dangerouslySetInnerHTML={{ __html: svg }} />
      <p class="field-hint">
        Your partner scans it with their phone’s camera, copies the text, and pastes it into “Open a share” in their app. They still need
        the passphrase.
      </p>
      <label class="field-label" for="share-code">
        Or copy the code
      </label>
      <textarea id="share-code" class="input share-code" readOnly value={code} onFocus={(e) => e.currentTarget.select()} />
    </div>
  );
}

function OpenShare() {
  const store = useStore();
  const nav = useNav();
  const [envelope, setEnvelope] = useState<EncryptedFile | null>(null);
  const [code, setCode] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pickEnvelope = (json: unknown) => {
    if (!isEncryptedFile(json)) throw new NotOurFileError('That isn’t a partner share from this app.');
    if (json.kind !== 'partner') throw new NotOurFileError('That’s a backup, not a partner share. Restore it from Backup & restore.');
    setEnvelope(json);
  };

  return (
    <section class="card" aria-labelledby="share-open">
      <h2 id="share-open" class="card-title">
        Open a share from your partner
      </h2>
      {!envelope ? (
        <>
          <label class="btn file-btn">
            Choose share file
            <input
              class="sr-only"
              type="file"
              accept=".wiai,application/octet-stream,application/json"
              onChange={async (e) => {
                const f = e.currentTarget.files?.[0];
                e.currentTarget.value = '';
                if (!f) return;
                setError('');
                try {
                  pickEnvelope(JSON.parse(await f.text()));
                } catch (err) {
                  setError(err instanceof NotOurFileError ? err.message : 'That file couldn’t be read as a partner share.');
                }
              }}
            />
          </label>
          <div class="field">
            <label class="field-label" for="paste-code">
              …or paste a share code
            </label>
            <textarea id="paste-code" class="input share-code" value={code} placeholder="WIAI1.…" onInput={(e) => setCode(e.currentTarget.value)} />
          </div>
          <button
            type="button"
            class="btn btn-small"
            disabled={!code.trim()}
            onClick={() => {
              setError('');
              try {
                pickEnvelope(fromShareCode(code));
              } catch (err) {
                setError(err instanceof Error ? err.message : 'That code couldn’t be read.');
              }
            }}
          >
            Use this code
          </button>
        </>
      ) : (
        <form
          class="form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await openPartnerShare(store, envelope, pass);
              setEnvelope(null);
              setPass('');
              setCode('');
              nav('partner');
              toast('Partner view added');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'That share couldn’t be opened.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <PassInput id="open-pass" label="Passphrase your partner gave you" value={pass} onInput={setPass} autoComplete="off" />
          <div class="form-actions">
            <button type="button" class="btn" onClick={() => setEnvelope(null)}>
              Cancel
            </button>
            <button type="submit" class="btn btn-primary btn-grow" disabled={!pass || busy}>
              {busy ? 'Unlocking…' : 'Open'}
            </button>
          </div>
        </form>
      )}
      {error && (
        <p class="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function PartnerHeldNote() {
  const nav = useNav();
  return (
    <section class="card card-quiet">
      <p>You’re holding a share from your partner. It’s in the Partner tab.</p>
      <button type="button" class="btn btn-small" onClick={() => nav('partner')}>
        Open Partner tab
      </button>
    </section>
  );
}

// ---------------- The Partner tab (read-only) ----------------

export function PartnerTab() {
  const store = useStore();
  const data = useData();
  const nav = useNav();
  if (!data.partner) return null;
  const s: PartnerSummary = data.partner.summary;
  const fmt = makeFmt({ currency: s.currency, locale: s.locale, decimalSeparator: s.decimal });
  const created = new Date(s.createdAt);
  const asOf = `${fmt.day(created.toISOString().slice(0, 10))}, ${created.toLocaleTimeString(s.locale, { hour: 'numeric', minute: '2-digit' })}`;
  const ageDays = Math.floor((Date.now() - s.createdAt) / 86_400_000);
  // The number was "today" for the sender when they made it; say which day once that's not today.
  const snapshotDay = todayISO(created);
  const today = todayISO();
  const who = s.fromName ? `${s.fromName}’s` : 'Your partner’s';
  const money = (n: number, whole = false) => formatMoney(n, s.currency, s.locale, { decimal: s.decimal, wholeIfRound: whole });

  return (
    <div class="partner-view" aria-label={`${who} shared budget (read only)`}>
      <h1 class="screen-title">{who} budget</h1>
      <p class="partner-asof">
        <span class="badge">Read only</span> As of {asOf}
      </p>
      {ageDays >= STALE_DAYS && (
        <p class="card card-note" role="note">
          This is {ageDays} days old — things may have changed. Ask for a fresh share.
        </p>
      )}

      <section class="card hero">
        <h2 class="hero-label">
          {s.safe.status === 'tight' ? 'Tight until payday' : snapshotDay === today ? 'Safe to spend today' : `Safe to spend on ${fmt.day(snapshotDay)}`}
        </h2>
        <p class="big-number">{money(Math.floor((s.safe.status === 'tight' ? s.safe.shortfall : Math.max(0, s.safe.today)) / 100) * 100, true)}</p>
        <p class="muted">
          {s.safe.untilPayday ? `Until payday ${fmt.day(s.safe.nextPayday)}` : 'Until the end of the month'}: {money(s.safe.period)}
        </p>
      </section>

      <section class="card" aria-labelledby="pv-bills">
        <h2 id="pv-bills" class="card-title">
          Bills coming up
        </h2>
        {s.bills.length === 0 ? (
          <p class="muted">None in the next 6 weeks.</p>
        ) : (
          <ul class="rows">
            {s.bills.map((b, i) => (
              <li key={i} class="row">
                <span class="row-main">
                  <span>{b.name}</span>
                  <span class="row-sub">
                    {fmt.day(b.date)}
                    {b.autopay ? ' · autopay' : ''}
                  </span>
                </span>
                <span class="mono">{money(b.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section class="card" aria-labelledby="pv-pay">
        <h2 id="pv-pay" class="card-title">
          Paydays
        </h2>
        {s.paydays.length === 0 ? (
          <p class="muted">None in the next 6 weeks.</p>
        ) : (
          <ul class="rows">
            {s.paydays.map((p, i) => (
              <li key={i} class="row">
                <span class="row-main">
                  <span>{p.name}</span>
                  <span class="row-sub">{fmt.day(p.date)}</span>
                </span>
                <span class="mono">
                  {p.variable ? '~' : ''}
                  {money(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {s.envelopes.length > 0 && (
        <section class="card" aria-labelledby="pv-env">
          <h2 id="pv-env" class="card-title">
            Envelopes this month
          </h2>
          <ul class="rows">
            {s.envelopes.map((e, i) => {
              const level = e.spent > e.limit ? 'over' : e.limit > 0 && e.spent / e.limit >= 0.75 ? 'near' : 'ok';
              return (
                <li key={i} class="row row-envelope">
                  <div class="row-main">
                    <span class="env-head">
                      <span>
                        <span aria-hidden="true">{e.emoji}</span> {e.name}
                      </span>
                      <span class="mono">
                        {money(e.spent)} of {money(e.limit)}
                      </span>
                    </span>
                    <Progress value={e.limit > 0 ? e.spent / e.limit : 0} level={level} label={e.name} valueText={`${money(e.spent)} of ${money(e.limit)}`} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {s.goals.length > 0 && (
        <section class="card" aria-labelledby="pv-goals">
          <h2 id="pv-goals" class="card-title">
            Goals
          </h2>
          <ul class="rows">
            {s.goals.map((g, i) => (
              <li key={i} class="row row-envelope">
                <div class="row-main">
                  <span class="env-head">
                    <span>
                      <span aria-hidden="true">{g.emoji}</span> {g.name}
                    </span>
                    <span class="mono">
                      {money(g.saved, true)} of {money(g.target, true)}
                    </span>
                  </span>
                  <Progress value={g.target ? g.saved / g.target : 0} level="goal" label={g.name} valueText={`${money(g.saved)} of ${money(g.target)}`} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {s.transactions && (
        <section class="card" aria-labelledby="pv-tx">
          <h2 id="pv-tx" class="card-title">
            Recent spending
          </h2>
          <ul class="rows">
            {s.transactions.slice(0, 50).map((t, i) => (
              <li key={i} class="row">
                <span class="row-main">
                  <span>{t.note || t.category || 'Spend'}</span>
                  <span class="row-sub">
                    {fmt.day(t.date)}
                    {t.category ? ` · ${t.category}` : ''}
                  </span>
                </span>
                <span class={`mono ${t.amount > 0 ? 'amount-in' : ''}`}>{formatMoney(t.amount, s.currency, s.locale, { decimal: s.decimal, signed: true })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p class="muted">This is a snapshot your partner shared. It doesn’t change your own numbers, and nothing here can be edited.</p>
      <button
        type="button"
        class="btn"
        onClick={async () => {
          const undo = await removePartnerShare(store);
          nav('today');
          toast('Partner view removed', undo);
        }}
      >
        Remove partner view
      </button>
    </div>
  );
}
