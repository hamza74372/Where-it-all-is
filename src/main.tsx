import { render } from 'preact';
import { App } from './app';
import './styles.css';
import './components.css';

render(<App />, document.getElementById('app')!);
