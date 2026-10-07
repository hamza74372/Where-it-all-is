import { render } from 'preact';
import { App } from './app';
import { getPref } from './lib/prefs';
import './fonts.css';
import './styles.css';
import './components.css';
import './plan.css';
import './import.css';

// The chosen theme applies before anything draws (no flash of the wrong colours).
document.documentElement.dataset.theme = getPref('theme', 'auto');
document.documentElement.dataset.accent = getPref('accentTheme', 'navy');
render(<App />, document.getElementById('app')!);

// Website version only: work offline after the first visit. (The downloaded file needs no worker.)
if (__HOSTED__ && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is a bonus; the app works without it */
    });
  });
}
