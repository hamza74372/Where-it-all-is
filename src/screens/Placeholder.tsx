// Phase 0 stand-in for screens built in later phases.
export function Placeholder({ title }: { title: string }) {
  return (
    <>
      <h1 class="screen-title">{title}</h1>
      <div class="card">
        <p class="muted">This screen is coming in a later build phase.</p>
      </div>
    </>
  );
}
