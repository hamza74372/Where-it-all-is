// Insights: simple bars, no complex charts. Milestones celebrate; nothing can "break".

import { useState } from 'preact/hooks';
import { compareMonths, currentMonth, milestones, previousMonth, topPlaces, type Milestone } from '../../lib/insights';
import { useData } from '../../state/store';
import { useFmt, useToday, type Fmt } from '../../ui/hooks';

export function Insights() {
  const data = useData();
  const fmt = useFmt();
  const today = useToday();
  const [month, setMonth] = useState(currentMonth(today));
  const rows = compareMonths(data.transactions, data.categories, month);
  const places = topPlaces(data.transactions, month);
  const wins = milestones(data.transactions, data.debts, data.goals, today);
  const max = Math.max(1, ...rows.flatMap((r) => [r.thisMonth, r.lastMonth]));
  const label = fmt.month(`${month}-01`);
  const lastLabel = fmt.month(`${previousMonth(month)}-01`);
  const next = (() => {
    const [y, m] = month.split('-').map(Number);
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  })();

  return (
    <>
      <div class="cal-head">
        <button type="button" class="icon-btn" onClick={() => setMonth(previousMonth(month))} aria-label="Previous month">
          ‹
        </button>
        <h2 class="card-title" aria-live="polite">
          {label}
        </h2>
        <button type="button" class="icon-btn" onClick={() => setMonth(next)} aria-label="Next month" disabled={month >= currentMonth(today)}>
          ›
        </button>
      </div>

      <section class="card" aria-labelledby="cmp-title">
        <h2 id="cmp-title" class="card-title">
          This month vs last month
        </h2>
        {rows.length === 0 ? (
          <p class="muted">Nothing logged in {label} or {lastLabel} yet.</p>
        ) : (
          <>
            <p class="bar-legend muted">
              <i class="swatch swatch-now" /> {label} <i class="swatch swatch-before" /> {lastLabel}
            </p>
            <ul class="bars">
              {rows.map((r) => (
                <li key={r.categoryId ?? 'none'} class="bar-row">
                  <span class="bar-name">
                    <span aria-hidden="true">{r.emoji}</span> {r.name}
                  </span>
                  <span class="bar-track" aria-hidden="true">
                    <span class="bar bar-now" style={{ width: `${(r.thisMonth / max) * 100}%`, visibility: r.thisMonth > 0 ? 'visible' : 'hidden' }} />
                    <span class="bar bar-before" style={{ width: `${(r.lastMonth / max) * 100}%`, visibility: r.lastMonth > 0 ? 'visible' : 'hidden' }} />
                  </span>
                  <span class="bar-values">
                    <span class="mono">{fmt.money(r.thisMonth, { wholeIfRound: true })}</span>
                    <span class="row-sub mono">was {fmt.money(r.lastMonth, { wholeIfRound: true })}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section class="card" aria-labelledby="places-title">
        <h2 id="places-title" class="card-title">
          Where it all went
        </h2>
        {places.length === 0 ? (
          <p class="muted">Add a note when you log (like "12 Tesco") and your top places show up here.</p>
        ) : (
          <ol class="rows">
            {places.map((p) => (
              <li key={p.label} class="row">
                <span class="row-main">
                  <span>{p.label}</span>
                  <span class="row-sub">
                    {p.times} {p.times === 1 ? 'time' : 'times'}
                  </span>
                </span>
                <span class="mono">{fmt.money(p.total)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section class="card" aria-labelledby="wins-title">
        <h2 id="wins-title" class="card-title">
          Milestones
        </h2>
        {wins.length === 0 ? (
          <p class="muted">Milestones show up here as they happen — your first month in the black, a debt paid off, a goal reached.</p>
        ) : (
          <ul class="rows">
            {wins.map((w, i) => (
              <li key={i} class="row">
                <span>🎉 {milestoneText(w, fmt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function milestoneText(m: Milestone, fmt: Fmt): string {
  switch (m.kind) {
    case 'inTheBlack':
      return `${fmt.month(`${m.month}-01`)}: more came in than went out.`;
    case 'debtPaid':
      return `Paid off ${m.name}.`;
    case 'goalReached':
      return `Reached your ${m.name} goal.`;
  }
}
