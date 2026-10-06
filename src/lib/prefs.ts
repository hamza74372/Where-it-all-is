// UI-only preferences in localStorage (spec §4: never user data).
// Every access is guarded: storage can be disabled or throw (private mode, file:// quirks).

// The demo uses its own prefix so it never changes the real app's preferences on the same site.
const PREFIX = typeof __DEMO__ !== 'undefined' && __DEMO__ ? 'wiai-demo.' : 'wiai.';

export function getPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function setPref<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* non-essential */
  }
}
