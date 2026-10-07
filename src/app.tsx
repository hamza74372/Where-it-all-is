import { useEffect, useState } from 'preact/hooks';
import { DB } from './db/db';
import { DB_NAME } from './db/schema';
import { todayISO } from './lib/dates';
import { DEMO_MAX_ENTRIES, DemoLimitError } from './lib/demo';
import { loadExampleData } from './state/actions';
import { toast } from './ui/Toast';
import { getPref, setPref } from './lib/prefs';
import { Bills } from './screens/Bills';
import { Log } from './screens/Log';
import { More } from './screens/More';
import { Onboarding } from './screens/Onboarding';
import { PartnerTab } from './screens/Partner';
import { Plan } from './screens/Plan';
import { Today } from './screens/Today';
import { NavContext, type Tab } from './state/nav';
import { Store, StoreContext, useData, useStore } from './state/store';
import { Icon, type IconName } from './ui/icons';
import { LogSkeleton, TodaySkeleton } from './ui/Skeleton';
import { dismissToast, ToastHost } from './ui/Toast';

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
        if (__DEMO__) await resetDemoIfNewSession();
        const store = await Store.load(await DB.open());
        // The demo starts with example numbers already in, so people can explore straight away.
        if (__DEMO__ && !store.data.settings.onboarded) await loadExampleData(store, todayISO());
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
  if (boot.state === 'loading') {
    // The shape of the screen while the budget loads from the device — never a blank page.
    const tab = getPref<Tab>('tab', 'today');
    return (
      <div class="shell">
        <main class="screen skeleton-screen" aria-busy="true" aria-label="Loading your budget">
          {tab === 'log' ? <LogSkeleton /> : <TodaySkeleton />}
        </main>
        <nav class="bottom-nav" aria-hidden="true">
          <ul>
            {TABS.map((t) => (
              <li key={t.id}>
                <button type="button" tabIndex={-1} disabled aria-current={t.id === tab ? 'page' : undefined}>
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

  return (
    <StoreContext.Provider value={boot.store}>
      <Shell />
    </StoreContext.Provider>
  );
}

function Shell() {
  const store = useStore();
  const { settings, partner } = useData();
  const [tabState, setTab] = useState<Tab>(() => getPref<Tab>('tab', 'today'));
  // The Partner tab only exists while a share is held.
  const tab: Tab = tabState === 'partner' && !partner ? 'today' : tabState;
  const tabs = partner ? [...TABS.slice(0, 4), { id: 'partner' as Tab, label: 'Partner', icon: 'partner' as IconName }, TABS[4]] : TABS;

  // Finishing setup (or restoring a backup onto a fresh device) always lands on Today.
  const [wasOnboarded, setWasOnboarded] = useState(settings.onboarded);
  useEffect(() => {
    if (settings.onboarded && !wasOnboarded) {
      setTab('today');
      setPref('tab', 'today');
    }
    setWasOnboarded(!!settings.onboarded);
  }, [settings.onboarded]);

  // Demo: the 30-entry limit surfaces as a friendly message wherever an entry was being added.
  useEffect(() => {
    if (!__DEMO__) return;
    const onReject = (e: PromiseRejectionEvent) => {
      if (e.reason instanceof DemoLimitError) {
        e.preventDefault();
        toast(e.reason.message);
      }
    };
    window.addEventListener('unhandledrejection', onReject);
    return () => window.removeEventListener('unhandledrejection', onReject);
  }, []);

  // Ask the browser to keep this app's data even when storage is low (best effort).
  useEffect(() => {
    navigator.storage?.persist?.().then((granted) => {
      if (granted !== store.data.settings.storagePersisted) store.saveSettings({ storagePersisted: granted });
    }, () => {});
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    setPref('theme', settings.theme);
  }, [settings.theme]);

  const go = (t: Tab) => {
    setTab(t);
    setPref('tab', t);
    dismissToast();
    document.getElementById('main')?.scrollTo(0, 0);
  };

  return (
    <NavContext.Provider value={go}>
      <div class="shell">
        {__DEMO__ && (
          <div class="demo-banner" role="note">
            <span>
              <strong>Demo — data resets</strong> when you close this tab. Up to {DEMO_MAX_ENTRIES} entries.
              <br />
              This is a demo. It isn’t meant to be installed.
            </span>
            <a class="demo-cta" href={__ETSY_URL__} target="_blank" rel="noopener noreferrer">
              Get the full version
            </a>
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
              {tab === 'plan' && <Plan />}
              {tab === 'more' && <More />}
              {tab === 'partner' && <PartnerTab />}
            </main>
            <ToastHost />
            <nav class="bottom-nav" aria-label="Main">
              <ul>
                {tabs.map((t) => (
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
        {!settings.onboarded && <ToastHost />}
      </div>
    </NavContext.Provider>
  );
}

/** "Demo — data resets": each new browser tab starts the demo fresh (reloading keeps it). */
async function resetDemoIfNewSession(): Promise<void> {
  try {
    if (sessionStorage.getItem('wiai-demo-session')) return;
    sessionStorage.setItem('wiai-demo-session', '1');
  } catch {
    return; // no session storage: keep whatever is there
  }
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
}
