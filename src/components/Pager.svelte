<script>
  import Icon from './Icon.svelte';

  let { page, size, total, noun = 'items', onpage, onsize, sizes = [20, 50, 100] } = $props();

  const pages = $derived(Math.max(1, Math.ceil(total / size)));
  const from = $derived(total === 0 ? 0 : page * size + 1);
  const to = $derived(Math.min(total, (page + 1) * size));

  const visible = $derived.by(() => {
    if (pages <= 7) return Array.from({ length: pages }, (_, index) => index);
    const out = new Set([0, pages - 1, page - 1, page, page + 1]);
    if (page <= 2) [1, 2, 3].forEach((index) => out.add(index));
    if (page >= pages - 3) [pages - 4, pages - 3, pages - 2].forEach((index) => out.add(index));
    const sorted = [...out].filter((index) => index >= 0 && index < pages).sort((a, b) => a - b);
    const withGaps = [];
    sorted.forEach((index, position) => {
      if (position > 0 && index - sorted[position - 1] > 1) withGaps.push(null);
      withGaps.push(index);
    });
    return withGaps;
  });
</script>

<div class="pk-pager">
  <span>{from}–{to} of {total} {noun}</span>
  <label class="pk-pagesize" style="margin-left: auto">
    Rows
    <select class="pk-select" value={size} onchange={(event) => onsize(Number(event.currentTarget.value))}>
      {#each sizes as option (option)}<option value={option}>{option}</option>{/each}
    </select>
  </label>
  <div class="pk-pager__pages">
    <button type="button" class="pk-btn pk-btn--icon" aria-label="Previous page" disabled={page === 0} onclick={() => onpage(page - 1)}>
      <Icon name="chevron-left" />
    </button>
    {#each visible as index, position (index ?? `gap-${position}`)}
      {#if index == null}
        <span class="pk-page">…</span>
      {:else}
        <button
          type="button"
          class="pk-page"
          class:is-current={index === page}
          aria-current={index === page ? 'page' : undefined}
          onclick={() => onpage(index)}>{index + 1}</button
        >
      {/if}
    {/each}
    <button type="button" class="pk-btn pk-btn--icon" aria-label="Next page" disabled={page >= pages - 1} onclick={() => onpage(page + 1)}>
      <Icon name="chevron-right" />
    </button>
  </div>
</div>

<style>
  button.pk-page {
    border: 0;
    background: none;
    font-family: inherit;
    font-size: 14px;
    cursor: pointer;
  }
  button.pk-page:hover:not(.is-current) {
    background: var(--surface-hover);
  }
</style>
