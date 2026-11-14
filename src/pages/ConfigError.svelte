<script>
  import { missingConfig } from '../lib/firebase.js';
</script>

<div class="wrap">
  <div class="pk-card pk-stack card">
    <h1 class="pk-card__title">Sign-in is not configured</h1>
    <p class="pk-muted">
      This build has no Firebase web configuration, so nobody can sign in. Missing: <b>{missingConfig.join(', ')}</b>.
    </p>
    <p class="pk-muted">Serve it at runtime from <code>/config.js</code>:</p>
    <pre>window.APP_CONFIG = {'{'}
  firebaseApiKey: '…',
  firebaseAuthDomain: '&lt;project&gt;.firebaseapp.com',
  firebaseProjectId: '&lt;project&gt;'
{'}'};</pre>
    <p class="pk-muted">
      or, for local development, set <code>VITE_FIREBASE_API_KEY</code>, <code>VITE_FIREBASE_AUTH_DOMAIN</code> and
      <code>VITE_FIREBASE_PROJECT_ID</code> in <code>.env.local</code>.
    </p>
  </div>
</div>

<style>
  .wrap {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
  }
  .card {
    max-width: 560px;
  }
  pre {
    margin: 0;
    padding: 12px 14px;
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    font: var(--text-mono-sm, 400 13px/1.5 var(--font-mono));
    overflow-x: auto;
  }
</style>
