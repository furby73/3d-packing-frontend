<script>
  import { onMount } from 'svelte';

  let { title, onclose, width = 460, busy = false, children, actions, onsubmit = null } = $props();

  let dialog;
  const id = `modal-${Math.random().toString(36).slice(2)}`;

  onMount(() => {
    const previous = document.activeElement;
    const target = dialog.querySelector('[data-autofocus]') ?? dialog.querySelector('input, select, textarea, button');
    target?.focus();
    return () => previous?.focus?.();
  });

  function keydown(event) {
    if (event.key === 'Escape' && !busy) {
      event.stopPropagation();
      onclose?.();
    }
  }

  function submit(event) {
    event.preventDefault();
    onsubmit?.(event);
  }
</script>

<svelte:window onkeydown={keydown} />

<div class="pk-scrim modal-scrim" role="presentation" onmousedown={(event) => event.target === event.currentTarget && !busy && onclose?.()}>
  <div class="pk-modal" role="dialog" aria-modal="true" aria-labelledby={id} style:width="min({width}px, 100%)" bind:this={dialog}>
    <form class="modal-form" onsubmit={submit}>
      <h2 {id} class="pk-modal__title">{title}</h2>
      {@render children?.()}
      {#if actions}
        <div class="pk-modal__actions">{@render actions()}</div>
      {/if}
    </form>
  </div>
</div>

<style>
  .modal-form {
    display: contents;
  }
  .modal-scrim {
    z-index: 50;
    align-items: start;
    padding-top: min(18vh, 180px);
    overflow-y: auto;
  }
</style>
