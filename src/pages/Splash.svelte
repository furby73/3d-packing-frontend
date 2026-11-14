<script>
  import Logo from '../components/Logo.svelte';
  import { retrySession, signOut } from '../lib/session.svelte.js';

  let { error = '' } = $props();
</script>

<div class="splash">
  <div class="brand"><Logo size={56} motion={error ? 'none' : 'press'} label="3D Packing" /><span>3D Packing</span></div>
  {#if error}
    <div class="pk-empty card" role="alert">
      <h1 class="pk-empty__title">Can't reach the service</h1>
      <p class="pk-empty__body">{error}</p>
      <div class="pk-row">
        <button type="button" class="pk-btn pk-btn--solid" onclick={retrySession}>Try again</button>
        <button type="button" class="pk-btn pk-btn--ghost" onclick={() => signOut()}>Sign out</button>
      </div>
    </div>
  {:else}
    <div class="loading" role="status">Connecting…</div>
  {/if}
</div>

<style>
  .splash {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 24px;
    padding: 24px;
  }
  .brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    font: 600 17px/1 var(--font-sans);
    letter-spacing: -0.2px;
  }
  .loading {
    color: var(--ink-muted);
    font-size: 14px;
  }
  .card {
    max-width: 480px;
  }
</style>
