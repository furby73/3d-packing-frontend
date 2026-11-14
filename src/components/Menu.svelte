<script>
  import Icon from './Icon.svelte';

  let { label = 'More actions', items = [], footnote = '', align = 'right', width = 220 } = $props();

  let open = $state(false);
  let root;
  let position = $state({ top: 0, left: 0 });
  let button;

  function toggle() {
    open = !open;
    if (open) place();
  }

  function place() {
    const rect = button.getBoundingClientRect();
    const estimate = items.length * 34 + 24 + (footnote ? 28 : 0);
    const below = rect.bottom + 4 + estimate < window.innerHeight;
    position = {
      top: below ? rect.bottom + 4 : Math.max(8, rect.top - 4 - estimate),
      left: align === 'right' ? Math.max(8, rect.right - width) : rect.left
    };
  }

  function outside(event) {
    if (open && !root.contains(event.target)) open = false;
  }

  function pick(item) {
    if (item.disabled) return;
    open = false;
    item.onselect?.();
  }
</script>

<svelte:window onmousedown={outside} onkeydown={(event) => event.key === 'Escape' && (open = false)} onscroll={() => (open = false)} onresize={() => (open = false)} />

<div class="menu-root" bind:this={root}>
  <button
    type="button"
    class="pk-btn pk-btn--icon"
    class:is-open={open}
    aria-label={label}
    aria-haspopup="menu"
    aria-expanded={open}
    bind:this={button}
    onclick={toggle}
  >
    <Icon name="more" />
  </button>
  {#if open}
    <div class="pk-menu menu" role="menu" style:top="{position.top}px" style:left="{position.left}px" style:width="{width}px">
      {#each items as item, index (index)}
        {#if item.separator}
          <div class="pk-menu__sep"></div>
        {:else}
          <button
            type="button"
            class="pk-menu__item"
            class:pk-menu__item--danger={item.danger}
            role="menuitem"
            aria-disabled={item.disabled ? 'true' : undefined}
            title={item.title}
            onclick={() => pick(item)}
          >
            {#if item.icon}<Icon name={item.icon} />{/if}{item.label}
          </button>
        {/if}
      {/each}
      {#if footnote}<div class="footnote">{footnote}</div>{/if}
    </div>
  {/if}
</div>

<style>
  .menu-root {
    display: inline-flex;
  }
  .menu {
    position: fixed;
    z-index: 40;
  }
  .pk-menu__item {
    border: 0;
    background: none;
    width: 100%;
    text-align: left;
    font-family: inherit;
  }
  .is-open {
    background: var(--surface-hover);
    color: var(--ink);
  }
  .footnote {
    padding: 6px 10px 4px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--ink-muted);
  }
</style>
