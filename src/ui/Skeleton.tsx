// While the budget loads from the device's storage, show the shape of the screen — never a blank page.

export function TodaySkeleton() {
  return (
    <>
      <span class="skeleton skeleton-line short" />
      <div class="hero">
        <span class="skeleton skeleton-line short" />
        <span class="skeleton skeleton-hero" />
        <span class="skeleton skeleton-line" />
      </div>
      <span class="skeleton skeleton-card" />
      <span class="skeleton skeleton-card" />
    </>
  );
}

export function LogSkeleton() {
  return (
    <>
      <span class="skeleton skeleton-line short" />
      <span class="skeleton skeleton-row" />
      <span class="skeleton skeleton-line short" />
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} class="skeleton skeleton-row" />
      ))}
    </>
  );
}
