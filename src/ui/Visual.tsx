import type { ComponentChildren } from 'preact';
import { Icon } from './icons';

export const toneClass = (index: number) => `tone-${Math.abs(index) % 8}`;
export const progressPercent = (value: number) => Math.max(0, Math.min(1, value)) * 100;
export const shouldUseDonut = (categoryCount: number) => categoryCount >= 2;
export const progressArc = (value: number) => {
  const length = progressPercent(value);
  return { length, offset: 100 - length };
};

export function CategoryChip(props: { name: string; icon?: string; index?: number; compact?: boolean }) {
  return (
    <span
      class={`category-chip ${toneClass(props.index ?? 0)} ${props.compact ? 'category-chip-compact' : ''}`}
      aria-label={props.name}
    >
      <span class="category-chip-icon" aria-hidden="true"><Icon name={props.icon ?? 'package'} small /></span>
      <span class="category-chip-label">{props.name}</span>
    </span>
  );
}

export function StatTile(props: { label: string; value: string; sub?: string; children?: ComponentChildren }) {
  return (
    <section class="stat-tile">
      <span class="stat-label">{props.label}</span>
      <strong class="stat-value money">{props.value}</strong>
      {props.children}
      {props.sub && <span class="stat-sub">{props.sub}</span>}
    </section>
  );
}

export function ProgressRing(props: { value: number; label: string; valueText: string; children?: ComponentChildren }) {
  const pct = progressPercent(props.value);
  const arc = progressArc(props.value);
  return (
    <span
      class="progress-ring"
      role="progressbar"
      aria-label={props.label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-valuetext={props.valueText}
    >
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle class="ring-track" cx="22" cy="22" r="18" pathLength="100" />
        <circle class="ring-value" cx="22" cy="22" r="18" pathLength="100" stroke-dasharray="100" stroke-dashoffset={arc.offset} />
      </svg>
      <span class="ring-content">{props.children ?? `${Math.round(pct)}%`}</span>
    </span>
  );
}

export interface ChartDatum {
  label: string;
  value: number;
  display: string;
  tone?: number;
}

const DONUT_GAP = 1.5;

export function donutArcs(data: ChartDatum[]) {
  const rows = data.slice(0, 8);
  const total = Math.max(1, rows.reduce((sum, item) => sum + Math.max(0, item.value), 0));
  let cursor = 0;
  return rows.map((item, index) => {
    const share = (Math.max(0, item.value) / total) * 100;
    const gap = Math.min(DONUT_GAP, share / 3);
    const arc = { item, tone: Math.abs(item.tone ?? index) % 8, length: Math.max(0, share - gap), offset: -(cursor + gap / 2) };
    cursor += share;
    return arc;
  });
}

export function DonutChart(props: { title: string; total: string; data: ChartDatum[] }) {
  if (!shouldUseDonut(props.data.length)) {
    return (
      <div class="category-bars" aria-label={`${props.title}. Total ${props.total}.`}>
        <ul aria-label={`${props.title} data`}>
          {props.data.map((item, index) => (
            <li key={item.label} class={`chart-tone-${Math.abs(item.tone ?? index) % 8}`}>
              <span><i aria-hidden="true" />{item.label}</span>
              <strong class="money">{item.display}</strong>
              <span class="category-bar-track" aria-hidden="true"><i /></span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const arcs = donutArcs(props.data);
  return (
    <div class="donut-wrap">
      <div class="donut-chart" role="img" aria-label={`${props.title}. Total ${props.total}.`}>
        <svg viewBox="0 0 44 44" aria-hidden="true">
          <circle class="donut-track" cx="22" cy="22" r="16" pathLength="100" />
          {arcs.map(({ item, tone, length, offset }) => {
            return (
              <circle
                key={item.label}
                class={`donut-segment chart-tone-${tone}`}
                cx="22"
                cy="22"
                r="16"
                pathLength="100"
                stroke-dasharray={`${length} ${100 - length}`}
                stroke-dashoffset={offset}
              />
            );
          })}
        </svg>
        <span class="donut-centre">
          <strong class="money">{props.total}</strong>
          <span>spent</span>
        </span>
      </div>
      <ul class="chart-legend" aria-label={`${props.title} data`}>
        {arcs.map(({ item, tone }) => (
          <li key={item.label}><i class={`chart-tone-${tone}`} /> <span>{item.label}</span><strong class="money">{item.display}</strong></li>
        ))}
      </ul>
    </div>
  );
}

export function MiniSparkline(props: { values: number[]; label: string }) {
  const values = props.values.length > 1 ? props.values : [0, ...(props.values.length ? props.values : [0])];
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${30 - (value / max) * 26}`).join(' ');
  return (
    <svg class="sparkline" viewBox="0 0 100 32" role="img" aria-label={props.label}>
      <polyline points={points} />
    </svg>
  );
}

export function InOutBars(props: { rows: Array<{ label: string; fullLabel?: string; incoming: number; outgoing: number; inText: string; outText: string }> }) {
  const max = Math.max(1, ...props.rows.flatMap((row) => [row.incoming, row.outgoing]));
  return (
    <div class="inout-chart">
      <div class="inout-visual" aria-hidden="true">
        {props.rows.map((row) => (
          <div class="inout-month" key={row.label}>
            <span class="inout-bars">
              <i class="in-bar" style={{ height: `${(row.incoming / max) * 100}%` }} />
              <i class="out-bar" style={{ height: `${(row.outgoing / max) * 100}%` }} />
            </span>
            <span>{row.label}</span>
          </div>
        ))}
      </div>
      <table class="sr-only">
        <caption>Six month money in and money out</caption>
        <thead><tr><th>Month</th><th>Money in</th><th>Money out</th></tr></thead>
        <tbody>{props.rows.map((row) => <tr key={row.label}><th>{row.fullLabel ?? row.label}</th><td>{row.inText}</td><td>{row.outText}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export function DebtLine(props: { start: number; months: number; startText: string; endLabel: string }) {
  const points = '2,4 22,9 42,13 62,20 80,25 98,29';
  return (
    <div class="debt-chart">
      <svg viewBox="0 0 100 34" role="img" aria-label={`Debt falls from ${props.startText} to zero over about ${props.months} months, by ${props.endLabel}.`}>
        <line class="chart-axis" x1="2" y1="30" x2="98" y2="30" />
        <polyline class="debt-line" points={points} />
        <circle class="debt-end" cx="98" cy="29" r="2" />
      </svg>
      <ul class="sr-only"><li>Starting balance: {props.startText}</li><li>Estimated debt-free date: {props.endLabel}</li></ul>
    </div>
  );
}
