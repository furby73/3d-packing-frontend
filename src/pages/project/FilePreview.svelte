<script>
  import { onMount } from 'svelte';
  import Icon from '../../components/Icon.svelte';
  import Viewer from '../../components/LazyViewer.svelte';
  import { api } from '../../lib/api.js';
  import { packingOf, previewable, save, viewerKind } from '../../lib/files.js';
  import { dims, formatLabel, midHash, size as bytes, when } from '../../lib/format.js';
  import { copy, failed } from '../../lib/toast.svelte.js';
  import { useProject } from './context.svelte.js';

  let { fileId, onclose, onrename, ondelete } = $props();

  const { ctx } = useProject();
  const autoLoadLimit = 40 * 1024 * 1024;

  let file = $state(null);
  let missing = $state(false);
  let source = $state(null);
  let loading = $state('');
  let error = $state('');
  let stats = $state(null);
  let downloading = $state(false);

  const canPreview = $derived(file && previewable.has(file.format));
  const packing = $derived(file ? packingOf(file, ctx.acceptedFormats) : null);
  const packable = $derived(packing === 'packable');
  const zUp = $derived(file && (file.format === 'STL' || file.format === 'THREE_MF'));

  const packingNote = $derived.by(() => {
    if (packing === 'packable') return file.format === 'OBJ' ? 'can be used in packing jobs' : 'converted to OBJ in millimetres for packing jobs';
    if (packing === 'reupload') return 'uploaded before models were converted to OBJ; upload it again to pack it';
    if (packing === 'unsupported') return 'cannot be packed; export it as STL or 3MF and upload that';
    return 'cannot be packed yet';
  });

  onMount(() => find(fileId));

  async function find(id) {
    try {
      for (let page = 0; page < 20; page++) {
        const result = await api.files(ctx.id, { page, size: 100 });
        const hit = result.content.find((entry) => entry.id === id);
        if (hit) {
          file = hit;
          if (previewable.has(hit.format) && hit.sizeBytes <= autoLoadLimit) loadModel();
          return;
        }
        if (page >= result.totalPages - 1) break;
      }
      missing = true;
    } catch (failure) {
      error = failure.message;
    }
  }

  async function loadModel() {
    loading = `Loading ${bytes(file.sizeBytes)}…`;
    error = '';
    try {
      const data = await api.fileBuffer(ctx.id, file.id);
      source = { kind: viewerKind(file.format), data };
      loading = 'Preparing the preview…';
    } catch (failure) {
      error = failure.message;
      loading = '';
    }
  }

  async function download() {
    downloading = true;
    try {
      save(await api.fileBlob(ctx.id, file.id), file.filename);
    } catch (failure) {
      failed(failure);
    } finally {
      downloading = false;
    }
  }
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && !document.querySelector('.pk-scrim') && onclose()} />

<div class="backdrop" role="presentation" onmousedown={onclose}></div>
<aside class="pk-drawer drawer" aria-labelledby="preview-title">
  <div class="pk-drawer__head">
    <div class="head-text">
      <h2 id="preview-title" class="title">{file?.filename ?? (missing ? 'File not found' : 'Loading…')}</h2>
      {#if file}
        <div class="pk-row">
          <span class="pk-chip">{formatLabel(file.format)}</span>
          {#if packable}<span class="pk-packable"><Icon name="check" size={12} strokeWidth="2.5" />Packable</span>{/if}
          <span class="meta">{bytes(file.sizeBytes)} · uploaded {when(file.createdAt).replace(/^(Today|Yesterday)/, (word) => word.toLowerCase())}</span>
        </div>
      {/if}
    </div>
    <button type="button" class="pk-btn pk-btn--icon" aria-label="Close preview" onclick={onclose}><Icon name="close" /></button>
  </div>

  <div class="pk-drawer__body">
    {#if missing}
      <p class="pk-muted">This file is no longer in the project. It may have been deleted.</p>
    {:else if file}
      {#if canPreview}
        {#if source || loading || error}
          <Viewer
            class="viewer"
            {source}
            subject={file.id}
            {zUp}
            boundsToggle
            loading={loading}
            {error}
            onstats={(next) => {
              stats = next;
              if (next) loading = '';
            }}
            onerror={(failure) => {
              error = `Could not read this file: ${failure.message}`;
              loading = '';
            }}
          />
        {:else}
          <div class="pk-viewer viewer placeholder">
            <div class="placeholder__body">
              <Icon name="box" size={28} />
              <p>This file is {bytes(file.sizeBytes)}. Previewing downloads all of it into your browser.</p>
              <button type="button" class="pk-btn pk-btn--solid" onclick={loadModel}><Icon name="eye" />Load preview</button>
            </div>
          </div>
        {/if}
      {:else}
        <div class="pk-viewer viewer placeholder">
          <div class="placeholder__body">
            <Icon name="box" size={28} />
            <p>{formatLabel(file.format)} files can't be previewed in the browser. Download it to open it in a CAD tool.</p>
          </div>
        </div>
      {/if}

      <dl class="pk-dl details">
        <dt>Format</dt>
        <dd>{formatLabel(file.format)} — {packingNote}</dd>
        <dt>Size</dt>
        <dd>{bytes(file.sizeBytes)}</dd>
        <dt>SHA-256</dt>
        <dd>
          <button type="button" class="hash" title="Copy" onclick={() => copy(file.checksumSha256, 'SHA-256 copied')}>
            <span class="pk-mono">{midHash(file.checksumSha256)}</span><Icon name="copy" size={14} />
          </button>
        </dd>
        <dt>Uploaded</dt>
        <dd>{when(file.createdAt, { timeAlways: true })}</dd>
        {#if stats}
          <dt>Dimensions</dt>
          <dd>{dims(stats.size.x, stats.size.y, stats.size.z)} <span class="pk-muted">· model units, measured by the viewer</span></dd>
          {#if stats.objects > 1}
            <dt>Objects</dt>
            <dd>{stats.objects}</dd>
          {/if}
        {/if}
      </dl>

      <div class="pk-row">
        <button type="button" class="pk-btn" disabled={downloading} onclick={download}>
          {#if downloading}<span class="pk-spinner"></span>{:else}<Icon name="download" />{/if}Download
        </button>
        {#if ctx.canWrite}
          <button type="button" class="pk-btn" onclick={() => onrename(file)}><Icon name="pencil" />Rename</button>
          <button type="button" class="pk-btn pk-btn--danger-ghost push" onclick={() => ondelete(file)}>Delete</button>
        {/if}
      </div>
    {:else if error}
      <div class="pk-banner pk-banner--danger" role="alert"><Icon name="alert" /><span class="pk-banner__text">{error}</span></div>
    {:else}
      <div class="pk-viewer viewer"></div>
    {/if}
  </div>
</aside>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: transparent;
  }
  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 31;
    width: min(520px, 100%);
    overflow-y: auto;
    animation: slide 0.18s ease-out;
  }
  .head-text {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .title {
    font: 600 20px/1.4 var(--font-sans);
    letter-spacing: -0.125px;
    overflow-wrap: anywhere;
  }
  .meta {
    font-size: 14px;
    color: var(--ink-muted);
  }
  .drawer :global(.viewer) {
    height: 340px;
    flex: none;
  }
  .placeholder {
    display: grid;
    place-items: center;
  }
  .placeholder__body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    max-width: 320px;
    padding: 24px;
    text-align: center;
    color: var(--ink-muted);
    font-size: 14px;
  }
  .details {
    grid-template-columns: 130px 1fr;
    font-size: 14px;
  }
  .hash {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    background: none;
    padding: 0;
    cursor: pointer;
    color: var(--ink-muted);
  }
  .hash:hover {
    color: var(--ink);
  }
  .push {
    margin-left: auto;
  }
  @keyframes slide {
    from {
      transform: translateX(24px);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .drawer {
      animation: none;
    }
  }
</style>
