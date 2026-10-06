import { useEffect, useState } from 'preact/hooks';
import { DB } from './db/db';
import { loadSettings } from './db/settings';
import type { Settings } from './db/types';
import { getPref, setPref } from './lib/prefs';
import { Icon, type IconName } from './ui/icons';
import { Placeholder } from './screens/Placeholder';

export type Tab = 'today' | 'log' | 'bills' | 'plan' | 'more';

const TABS: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'log', label: 'Log', icon: 'log' },
  { id: 'bills', label: 'Bills', icon: 'bills' },
  { id: 'plan', label: 'Plan', icon: 'plan' },
  { id: 'more', label: 'More', icon: 'more' },
];

export const DISCLAIMER =
  'A budgeting and organising tool. Not financial advice. ADHD-friendly design; not a medical product.';

type Boot =
  | { state: 'loading' }
  | { state: 'ready'; db: DB; settings: Settings }
  | { state: 'error'; message: string };

export function App() {
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });
  const [tab, setTab] = useState<Tab>(() => getPref<Tab>('tab', 'today'));

  useEffect(() => {
    (async () => {
      try {
        const db = await DB.open();
        const { settings } = await loadSettings(db);
        setBoot({ state: 'ready', db, settings });
      } catch (e) {
        setBoot({ state: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
  }, []);

  const theme = boot.state === 'ready' ? boot.settings.theme : getPref('theme', 'auto');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    setPref('theme', theme);
  }, [theme]);

  const go = (t: Tab) => {
    setTab(t);
    setPref('tab', t);
    window.scrollTo(0, 0);
  };

  if (boot.state === 'error') {
    return (
      <main class="screen">
        <h1 class="screen-title">We couldn't open your data</h1>
        <div class="card">
          <p>
            Your browser blocked on-device storage. This can happen in private browsing, or if site
            data is turned off. Try opening the app in a normal window.
          </p>
          <p class="muted">Details: {boot.message}</p>
        </div>
      </main>
    );
  }

  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div class="shell">
      {__DEMO__ && (
        <div class="demo-banner" role="note">
          Demo — data resets. Nothing leaves your device.
        </div>
      )}
      <main class="screen" id="main" aria-busy={boot.state === 'loading'}>
        <Placeholder title={active.label} />
        {tab === 'more' && <p class="footer-note">{DISCLAIMER}</p>}
      </main>
      <nav class="bottom-nav" aria-label="Main">
        <ul>
          {TABS.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                aria-current={t.id === tab ? 'page' : undefined}
                onClick={() => go(t.id)}
              >
                <Icon name={t.icon} />
                <span>{t.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
