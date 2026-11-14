<script>
  let { label, kind = 'checks', options = [], value, onchange } = $props();

  let open = $state(false);
  let root;
  let draft = $state(null);

  const applied = $derived(kind === 'checks' ? value.length > 0 : Boolean(value.from || value.to));

  const summary = $derived.by(() => {
    if (!applied) return '';
    if (kind === 'checks') {
      const names = options.filter((option) => value.includes(option.value)).map((option) => option.label);
      return names.length > 2 ? `${names.length} selected` : names.join(', ');
    }
    if (value.from && value.to) return `${value.from} – ${value.to}`;
    return value.from ? `from ${value.from}` : `until ${value.to}`;
  });

  function toggle() {
    open = !open;
    if (open) draft = kind === 'checks' ? [...value] : { ...value };
  }

  function outside(event) {
    if (open && !root.contains(event.target)) open = false;
  }

  function flip(option) {
    draft = draft.includes(option) ? draft.filter((entry) => entry !== option) : [...draft, option];
  }

  function apply() {
    open = false;
    onchange(draft);
  }

  function clear() {
    open = false;
    onchange(kind === 'checks' ? [] : { from: '', to: '' });
  }
</script>

<svelte:window onmousedown={outside} onkeydown={(event) => event.key === 'Escape' && (open = false)} />

<div class="filter" bind:this={root}>
  <button
    type="button"
    class="pk-btn pk-btn--filter"
    class:is-applied={applied}
    class:is-open={open}
    aria-expanded={open}
    onclick={toggle}
  >
    {label}{#if summary}: <b>{summary}</b>{/if}
  </button>
  {#if open}
    <div class="pk-popover">
      <div class="pk-popover__label">{label}</div>
      {#if kind === 'checks'}
        {#each options as option (option.value)}
          <label class="pk-check">
            <input type="checkbox" checked={draft.includes(option.value)} onchange={() => flip(option.value)} />{option.label}
          </label>
        {/each}
      {:else}
        <div class="dates">
          <label class="pk-field">
            <span class="pk-hint">From</span>
            <input class="pk-input" type="date" bind:value={draft.from} max={draft.to || undefined} />
          </label>
          <label class="pk-field">
            <span class="pk-hint">Until</span>
            <input class="pk-input" type="date" bind:value={draft.to} min={draft.from || undefined} />
          </label>
        </div>
      {/if}
      <div class="pk-popover__foot">
        <button type="button" class="pk-btn pk-btn--ghost" onclick={clear}>Clear</button>
        <button type="button" class="pk-btn pk-btn--solid" onclick={apply}>Apply</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .filter {
    position: relative;
  }
  .pk-popover {
    top: calc(100% + 6px);
    left: 0;
  }
  .is-open:not(.is-applied) {
    background: var(--surface-hover);
  }
  .dates {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 8px 4px;
  }
  .dates .pk-input {
    height: 32px;
  }
</style>
