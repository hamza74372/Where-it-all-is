import { render } from 'preact';
import { App } from './app';
import './styles.css';
import './components.css';
import './plan.css';
import './import.css';

render(<App />, document.getElementById('app')!);

// Website version only: work offline after the first visit. (The downloaded file needs no worker.)
if (__HOSTED__ && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is a bonus; the app works without it */
    });
  });
}
