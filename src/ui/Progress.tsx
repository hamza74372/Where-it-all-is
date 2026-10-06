// Calm progress bar: soft green → amber → coral. Never red, never flashing.

export function Progress(props: { value: number; level: 'ok' | 'near' | 'over' | 'goal'; label: string; valueText: string }) {
  const pct = Math.max(0, Math.min(1, props.value)) * 100;
  return (
    <div
      class={`progress-bar level-${props.level}`}
      role="progressbar"
      aria-label={props.label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-valuetext={props.valueText}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}
