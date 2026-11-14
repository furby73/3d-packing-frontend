<script>
  let { value = $bindable(1), min = 1, max = 100, label = 'Copies', disabled = false } = $props();

  const number = $derived(Number(value));

  function clamp(next) {
    value = Math.min(max, Math.max(min, Math.round(next)));
  }

  function commit(event) {
    const parsed = Number(event.currentTarget.value);
    if (Number.isFinite(parsed)) clamp(parsed);
    else event.currentTarget.value = String(value);
  }
</script>

<div class="pk-stepper" class:invalid={!Number.isInteger(number) || number < min || number > max}>
  <button type="button" aria-label="Fewer {label}" disabled={disabled || number <= min} onclick={() => clamp(number - 1)}>−</button>
  <input
    value={value}
    inputmode="numeric"
    aria-label={label}
    {disabled}
    onchange={commit}
    onkeydown={(event) => {
      if (event.key === 'ArrowUp') clamp(number + 1);
      if (event.key === 'ArrowDown') clamp(number - 1);
    }}
  />
  <button type="button" aria-label="More {label}" disabled={disabled || number >= max} onclick={() => clamp(number + 1)}>+</button>
</div>

<style>
  .invalid {
    border-color: var(--danger-ink);
  }
</style>
