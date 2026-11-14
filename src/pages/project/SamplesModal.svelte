<script>
  import { onMount } from 'svelte';
  import Icon from '../../components/Icon.svelte';
  import Modal from '../../components/Modal.svelte';
  import Viewer from '../../components/LazyViewer.svelte';
  import { api } from '../../lib/api.js';
  import { viewerKind } from '../../lib/files.js';
  import { formatLabel, size as bytes } from '../../lib/format.js';
  import { failed, toast } from '../../lib/toast.svelte.js';
  import { useProject } from './context.svelte.js';

  let { onclose, onadded } = $props();

  const { ctx } = useProject();

  let samples = $state(null);
  let error = $state('');
  let selected = $state(null);
  let source = $state(null);
  let loading = $state('');
  let viewError = $state('');
  let adding = $state('');
  let added = $state({});

  onMount(() => {
    api
      .samples()
      .then((list) => {
        samples = list;
        if (list.length > 0) show(list[0]);
      })
      .catch((failure) => (error = failure.message));
  });

  async function show(sample) {
    selected = sample;
    source = null;
    viewError = '';
    loading = 'Loading the sample…';
    try {
      const data = await api.sampleBuffer(sample.id);
      if (selected?.id !== sample.id) return;
      source = { kind: viewerKind(sample.format) ?? 'obj', data };
    } catch (failure) {
      if (selected?.id === sample.id) {
        viewError = failure.message;
        loading = '';
      }
    }
  }

  async function add(sample) {
    adding = sample.id;
    try {
      const file = await api.addSample(ctx.id, sample.id);
      added[sample.id] = true;
      toast.success(`${file.filename} added to the project`);
      onadded();
    } catch (failure) {
      failed(failure);
    } finally {
      adding = '';
    }
  }
</script>

<Modal title="Add a sample model" {onclose} width={820}>
  <p class="pk-modal__body intro">Ready-made models you can pack straight away. Adding one copies it into this project.</p>
  {#if error}
    <div class="pk-banner pk-banner--danger" role="alert"><Icon name="alert" /><span class="pk-banner__text">{error}</span></div>
  {:else if !samples}
    <div class="pk-row muted"><span class="pk-spinner"></span>Loading samples…</div>
  {:else if samples.length === 0}
    <p class="muted">There are no sample models on this server.</p>
  {:else}
    <div class="layout">
      <ul class="list">
        {#each samples as sample (sample.id)}
          <li class:current={selected?.id === sample.id}>
            <button type="button" class="sample" onclick={() => show(sample)}>
              <span class="row">
                <span class="name">{sample.name}</span>
                <span class="size">{formatLabel(sample.format)} · {bytes(sample.sizeBytes)}</span>
              </span>
              {#if sample.description}<span class="description">{sample.description}</span>{/if}
            </button>
            <button type="button" class="pk-btn add" disabled={!!adding} onclick={() => add(sample)}>
              {#if adding === sample.id}<span class="pk-spinner"></span>{:else if added[sample.id]}<Icon name="check" />{:else}<Icon name="plus" />{/if}
              {added[sample.id] ? 'Add again' : 'Add'}
            </button>
          </li>
        {/each}
      </ul>
      <Viewer
        class="sample-viewer"
        {source}
        subject={selected?.id}
        loading={loading}
        error={viewError}
        onstats={(stats) => stats && (loading = '')}
        onerror={(failure) => ((viewError = failure.message), (loading = ''))}
      />
    </div>
  {/if}
  {#snippet actions()}
    <button type="button" class="pk-btn" onclick={onclose}>Done</button>
  {/snippet}
</Modal>

<style>
  .intro {
    font-size: 15px;
  }
  .muted {
    color: var(--ink-muted);
    font-size: 14px;
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
    gap: 16px;
    min-height: 320px;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 420px;
    overflow-y: auto;
  }
  li {
    display: flex;
    align-items: stretch;
    gap: 6px;
  }
  .sample {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    border: 1px solid var(--hairline);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .sample:hover {
    background: var(--surface-hover);
  }
  li.current .sample {
    border-color: var(--primary);
    background: var(--primary-soft);
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .name {
    font-weight: 500;
  }
  .size,
  .description {
    font-size: 13px;
    color: var(--ink-muted);
  }
  .add {
    height: auto;
  }
  .layout :global(.sample-viewer) {
    min-height: 320px;
  }
  @media (max-width: 720px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
</style>
