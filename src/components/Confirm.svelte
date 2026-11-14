<script>
  import Modal from './Modal.svelte';

  let {
    title,
    body = '',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    tone = 'solid',
    typeToConfirm = '',
    typeLabel = '',
    onconfirm,
    onclose,
    children
  } = $props();

  let typed = $state('');
  let busy = $state(false);
  let error = $state('');

  const ready = $derived(!typeToConfirm || typed.trim() === typeToConfirm.trim());

  async function confirm() {
    if (!ready || busy) return;
    busy = true;
    error = '';
    try {
      await onconfirm();
      onclose();
    } catch (failure) {
      error = failure?.message ?? String(failure);
    } finally {
      busy = false;
    }
  }
</script>

<Modal {title} {onclose} {busy} onsubmit={confirm}>
  {#if body}<p class="pk-modal__body">{body}</p>{/if}
  {@render children?.()}
  {#if typeToConfirm}
    <div class="pk-field">
      <label class="pk-label" for="confirm-text">{typeLabel}</label>
      <input id="confirm-text" class="pk-input" placeholder={typeToConfirm} autocomplete="off" bind:value={typed} data-autofocus />
    </div>
  {/if}
  {#if error}
    <div class="pk-banner pk-banner--danger" role="alert"><span class="pk-banner__text">{error}</span></div>
  {/if}
  {#snippet actions()}
    <button type="button" class="pk-btn" onclick={onclose} disabled={busy}>{cancelLabel}</button>
    <button type="submit" class="pk-btn pk-btn--{tone}" disabled={!ready || busy}>
      {#if busy}<span class="pk-spinner"></span>{/if}{confirmLabel}
    </button>
  {/snippet}
</Modal>
