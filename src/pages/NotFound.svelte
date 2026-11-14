<script>
  import Shell from '../components/Shell.svelte';

  let { kind = 'page' } = $props();
</script>

<Shell crumbs={kind === 'project' ? [{ label: 'Projects', href: '/' }, { label: 'Not found' }] : [{ label: 'Not found' }]}>
  <div class="center">
    <div class="pk-empty box">
      <svg class="pk-empty__art art" viewBox="0 0 120 72" aria-hidden="true">
        <rect x="1" y="1" width="118" height="70" rx="12" fill="none" stroke="var(--control-line)" stroke-width="2" stroke-dasharray="4 4" />
        <rect x="44" y="22" width="32" height="32" rx="8" fill="none" stroke="var(--ink-faint)" stroke-width="2" stroke-dasharray="3 3" />
        <text x="60" y="44" text-anchor="middle" font-family="Inter Variable, Inter, sans-serif" font-size="16" font-weight="700" fill="var(--ink-muted)">?</text>
      </svg>
      {#if kind === 'project'}
        <h1 class="title">Project not found</h1>
        <p class="pk-empty__body">It may have been deleted, or you are not a member of it. Ask an Owner of the project to add you.</p>
      {:else}
        <h1 class="title">Page not found</h1>
        <p class="pk-empty__body">The address may be mistyped, or the page no longer exists.</p>
      {/if}
      <a href="/" class="pk-btn pk-btn--cta">Back to projects</a>
    </div>
  </div>
</Shell>

<style>
  .center {
    min-height: calc(100vh - var(--size-topbar));
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 48px 16px;
  }
  .box {
    max-width: 520px;
    background: transparent;
  }
  .art {
    width: 160px;
    height: 96px;
  }
  .title {
    font: 700 26px/1.23 var(--font-sans);
    letter-spacing: -0.625px;
  }
</style>
