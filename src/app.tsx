import { useEffect, useState } from 'preact/hooks';
import { DB } from './db/db';
import { getPref, setPref } from './lib/prefs';
import { Bills } from './screens/Bills';
import { Log } from './screens/Log';
import { More } from './screens/More';
import { Onboarding } from './screens/Onboarding';
import { Today } from './screens/Today';
import { NavContext, type Tab } from './state/nav';
import { Store, StoreContext, useData } from './state/store';
import { Icon, type IconName } from './ui/icons';
import { ToastHost } from './ui/Toast';

const TABS: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'log', label: 'Log', icon: 'log' },
  { id: 'bills', label: 'Bills', icon: 'bills' },
  { id: 'plan', label: 'Plan', icon: 'plan' },
  { id: 'more', label: 'More', icon: 'more' },
];

type Boot = { state: 'loading' } | { state: 'ready'; store: Store } | { state: 'error'; message: string };

export function App() {
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });

  useEffect(() => {
    (async () => {
      try {
        const store = await Store.load(await DB.open());
        setBoot({ state: 'ready', store });
      } catch (e) {
        setBoot({ state: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
  }, []);

  if (boot.state === 'error') {
    return (
      <main class="screen">
        <h1 class="screen-title">We couldn't open your data</h1>
        <div class="card">
          <p>
            Your browser blocked on-device storage. This can happen in private browsing, or if site data is turned off.
            Try opening the app in a normal window.
          </p>
          <p class="muted">Details: {boot.message}</p>
        </div>
      </main>
    );
  }
  if (boot.state === 'loading') return <main class="screen" aria-busy="true" />;

  return (
    <StoreContext.Provider value={boot.store}>
      <Shell />
    </StoreContext.Provider>
  );
}

function Shell() {
  const { settings } = useData();
  const [tab, setTab] = useState<Tab>(() => getPref<Tab>('tab', 'today'));

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    setPref('theme', settings.theme);
  }, [settings.theme]);

  const go = (t: Tab) => {
    setTab(t);
    setPref('tab', t);
    window.scrollTo(0, 0);
  };

  return (
    <NavContext.Provider value={go}>
      <div class="shell">
        {__DEMO__ && (
          <div class="demo-banner" role="note">
            Demo — data resets. Nothing leaves your device.
          </div>
        )}
        {!settings.onboarded ? (
          <Onboarding />
        ) : (
          <>
            <main class="screen" id="main">
              {tab === 'today' && <Today />}
              {tab === 'log' && <Log />}
              {tab === 'bills' && <Bills />}
              {tab === 'plan' && <PlanSoon />}
              {tab === 'more' && <More />}
            </main>
            <nav class="bottom-nav" aria-label="Main">
              <ul>
                {TABS.map((t) => (
                  <li key={t.id}>
                    <button type="button" aria-current={t.id === tab ? 'page' : undefined} onClick={() => go(t.id)}>
                      <Icon name={t.icon} />
                      <span>{t.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </>
        )}
        <ToastHost />
      </div>
    </NavContext.Provider>
  );
}

function PlanSoon() {
  return (
    <>
      <h1 class="screen-title">Plan</h1>
      <div class="card">
        <p>Envelopes, goals and a debt-free date are coming in the next update.</p>
      </div>
    </>
  );
}
