<script>
  import { retrySession, signOut } from '../lib/session.svelte.js';

  let { error = '' } = $props();
</script>

<div class="splash">
  <div class="brand">3D Packing</div>
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
    <div class="pk-row loading" role="status"><span class="pk-spinner"></span>Connecting…</div>
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
