<script>
  import { navigate } from '../lib/router.svelte.js';
  import { dismiss, toasts } from '../lib/toast.svelte.js';
  import Icon from './Icon.svelte';

  const icon = { success: 'check', info: 'info', warning: 'alert', error: 'alert' };
  const color = { success: 'var(--success)', info: 'var(--link)', warning: 'var(--warning-ink)', error: 'var(--danger-ink)' };

  function act(entry) {
    dismiss(entry.id);
    if (entry.action.href) navigate(entry.action.href);
    else entry.action.onclick?.();
  }
</script>

<div class="toasts" aria-live="polite">
  {#each toasts as entry (entry.id)}
    <div class="pk-toast" role={entry.tone === 'error' || entry.tone === 'warning' ? 'alert' : 'status'}>
      <span style:color={color[entry.tone]}><Icon name={icon[entry.tone]} /></span>
      <span class="message">{entry.message}</span>
      {#if entry.action}
        <button type="button" class="pk-toast__action action" onclick={() => act(entry)}>{entry.action.label}</button>
      {/if}
      <button type="button" class="pk-btn pk-btn--icon close" aria-label="Dismiss" onclick={() => dismiss(entry.id)}>
        <Icon name="close" size={14} />
      </button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    z-index: 60;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: max-content;
    max-width: calc(100vw - 32px);
    pointer-events: none;
  }
  .pk-toast {
    pointer-events: auto;
    animation: rise 0.18s ease-out;
  }
  .message {
    overflow-wrap: anywhere;
  }
  .action {
    border: 0;
    background: none;
    font: inherit;
    font-weight: 500;
    cursor: pointer;
    padding: 0;
  }
  .close {
    width: 24px;
    height: 24px;
    margin-right: -6px;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .pk-toast {
      animation: none;
    }
  }
</style>
