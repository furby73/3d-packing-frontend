<script>
  import { route } from '../lib/router.svelte.js';
  import Icon from './Icon.svelte';
  import Sidebar from './Sidebar.svelte';

  let { crumbs = [], actions, children } = $props();

  let drawer = $state(false);

  $effect(() => {
    route.path;
    drawer = false;
  });
</script>

<div class="pk-shell">
  <div class="desktop-nav"><Sidebar /></div>
  {#if drawer}
    <div class="mobile-nav" role="presentation" onmousedown={(event) => event.target === event.currentTarget && (drawer = false)}>
      <Sidebar onnavigate={() => (drawer = false)} />
    </div>
  {/if}
  <main class="pk-main">
    <header class="pk-topbar">
      <div class="lead">
        <button type="button" class="pk-btn pk-btn--icon menu-button" aria-label="Open navigation" onclick={() => (drawer = true)}>
          <Icon name="menu" />
        </button>
        <nav class="pk-crumbs" aria-label="Breadcrumb">
          {#each crumbs as crumb, index (index)}
            {#if index > 0}<span aria-hidden="true">/</span>{/if}
            {#if crumb.href && index < crumbs.length - 1}
              <a href={crumb.href} class="crumb">{crumb.label}</a>
            {:else if index === crumbs.length - 1}
              <b aria-current="page">{crumb.label}</b>
            {:else}
              <span>{crumb.label}</span>
            {/if}
          {/each}
        </nav>
      </div>
      {#if actions}<div class="pk-row">{@render actions()}</div>{/if}
    </header>
    {@render children()}
  </main>
</div>

<style>
  .lead {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .crumb {
    color: var(--ink-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .crumb:hover {
    color: var(--ink);
  }
  .menu-button {
    display: none;
    margin-left: -8px;
  }
  .mobile-nav {
    position: fixed;
    inset: 0;
    z-index: 45;
    background: var(--scrim);
  }
  .mobile-nav :global(.pk-sidebar) {
    display: flex;
    width: min(var(--size-sidebar), 86vw);
    background: var(--canvas);
    box-shadow: var(--shadow-2);
  }
  @media (max-width: 840px) {
    .desktop-nav {
      display: none;
    }
    .menu-button {
      display: inline-flex;
    }
  }
</style>
