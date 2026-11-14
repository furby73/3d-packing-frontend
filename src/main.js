import '@fontsource-variable/inter';
import './styles/tokens.css';
import './styles/components.css';
import './styles/app.css';
import './lib/theme.svelte.js';
import { mount } from 'svelte';
import App from './App.svelte';

export default mount(App, { target: document.getElementById('app') });
