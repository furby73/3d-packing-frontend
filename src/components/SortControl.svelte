<script>
  import Icon from './Icon.svelte';

  let { options, sort, direction, onchange } = $props();

  const id = `sort-${Math.random().toString(36).slice(2)}`;
</script>

<div class="pk-sortctl">
  <label for={id} class="sr-only">Sort by</label>
  <select {id} class="pk-select" value={sort} onchange={(event) => onchange(event.currentTarget.value, direction)}>
    {#each options as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
  </select>
  <button
    type="button"
    class="pk-btn pk-btn--icon"
    aria-label={direction === 'DESC' ? 'Descending — switch to ascending' : 'Ascending — switch to descending'}
    title={direction === 'DESC' ? 'Descending' : 'Ascending'}
    onclick={() => onchange(sort, direction === 'DESC' ? 'ASC' : 'DESC')}
  >
    <Icon name={direction === 'DESC' ? 'arrow-down' : 'arrow-up'} />
  </button>
</div>
