// Every scene and caption, in seconds. The compositions are built from this, and check.ts reads it
// to prove each caption is fully on screen for at least 1.8 s and each video is exactly as long as it should be.
export const FPS = 30;

/** How long a caption takes to come in at the start of its scene (it's then fully on screen until the cut). */
export const CAPTION_IN = 0.2;

export interface Scene {
  id: string;
  from: number;
  to: number;
  caption: string;
  small?: string;
  /** End cards: the text is there from the first frame (no entrance). */
  instant?: boolean;
}

export const oneNumber: Scene[] = [
  { id: 'question', from: 0, to: 2, caption: 'Can I afford this?' },
  { id: 'today', from: 2, to: 5, caption: 'Safe to spend today.', small: 'Bills before payday already set aside' },
  { id: 'coffee', from: 5, to: 8, caption: 'Log a spend in one tap.' },
  { id: 'why', from: 8, to: 11, caption: 'See exactly why.' },
  { id: 'calendar', from: 11, to: 13.2, caption: 'Bills and payday, already counted.' },
  { id: 'end', from: 13.2, to: 15, caption: 'No subscription · Works offline · Instant download', instant: true },
];

export const importVideo: Scene[] = [
  { id: 'title', from: 0, to: 2, caption: 'Stop typing every purchase.' },
  { id: 'drop', from: 2, to: 4.5, caption: 'Drop in your bank statement.' },
  { id: 'preview', from: 4.5, to: 8.5, caption: 'No duplicates. Nothing counted twice.' },
  { id: 'check', from: 8.5, to: 11.2, caption: 'Checked against your bank.' },
  { id: 'today', from: 11.2, to: 13.2, caption: 'Your number, up to date.' },
  { id: 'end', from: 13.2, to: 15, caption: 'No bank login · Your data stays on your device', instant: true },
];

export const product: Scene[] = [
  { id: 'problem', from: 0, to: 5, caption: 'Can I afford this?', small: 'Your bank shows a balance — not what’s safe to spend.' },
  { id: 'number', from: 5, to: 11, caption: 'One number: safe to spend today.', small: 'Bills before payday already set aside' },
  { id: 'log', from: 11, to: 17, caption: 'Log a spend in seconds.', small: 'Type “12.50 lunch”, or tap a chip' },
  { id: 'bills', from: 17, to: 23, caption: 'Bills and payday, already counted.' },
  { id: 'import', from: 23, to: 30, caption: 'Drop in your bank statement.', small: 'Duplicates skipped. Nothing counted twice.' },
  { id: 'away', from: 30, to: 37, caption: 'Away for a week? No guilt.', small: 'Come back to one question at a time' },
  { id: 'plan', from: 37, to: 44, caption: 'Envelopes, goals, a debt-free date.' },
  { id: 'insights', from: 44, to: 50, caption: 'See where it all went.' },
  { id: 'private', from: 50, to: 56, caption: 'Private by design.', small: 'No bank login · No account · Stays on your device' },
  { id: 'devices', from: 56, to: 62, caption: 'Works on everything you own.', small: 'Phone, tablet and laptop' },
  { id: 'end', from: 62, to: 67, caption: 'Try the free demo.', small: 'ADHD-friendly budget app · No subscription', instant: true },
];

export const lengthOf = (scenes: Scene[]) => scenes[scenes.length - 1].to;
export const frames = (s: number) => Math.round(s * FPS);
