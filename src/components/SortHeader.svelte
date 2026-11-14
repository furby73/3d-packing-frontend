<script>
  let { label, field, sort, direction, onsort, num = false } = $props();

  const active = $derived(sort === field);

  function click() {
    if (active) onsort(field, direction === 'DESC' ? 'ASC' : 'DESC');
    else onsort(field, /At$|Bytes$|Seconds$|Count$/.test(field) ? 'DESC' : 'ASC');
  }
</script>

<th class="sortable" class:is-sorted={active} class:pk-num={num} aria-sort={active ? (direction === 'DESC' ? 'descending' : 'ascending') : undefined}>
  <button type="button" onclick={click}>
    {label}{#if active}<span class="pk-sort" aria-hidden="true">{direction === 'DESC' ? '↓' : '↑'}</span>{/if}
  </button>
</th>
