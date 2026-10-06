// Demo limits (spec §4): 30 entries, export off, data resets, and a way to get the full version.

export const DEMO_MAX_ENTRIES = 30;

export class DemoLimitError extends Error {
  constructor() {
    super(`The demo holds up to ${DEMO_MAX_ENTRIES} entries. Get the full version to keep going — it has no limit.`);
    this.name = 'DemoLimitError';
  }
}

/** How many more transactions the demo will accept (Infinity in the full app). */
export function demoRemaining(transactionCount: number, demo = __DEMO__): number {
  return demo ? Math.max(0, DEMO_MAX_ENTRIES - transactionCount) : Infinity;
}
