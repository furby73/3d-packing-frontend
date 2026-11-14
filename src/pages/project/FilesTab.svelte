<script>
  import Confirm from '../../components/Confirm.svelte';
  import Filter from '../../components/Filter.svelte';
  import Icon from '../../components/Icon.svelte';
  import Menu from '../../components/Menu.svelte';
  import Modal from '../../components/Modal.svelte';
  import Pager from '../../components/Pager.svelte';
  import SortHeader from '../../components/SortHeader.svelte';
  import SortControl from '../../components/SortControl.svelte';
  import { api } from '../../lib/api.js';
  import { acceptAttribute, formatsLine, renameProblem, save, uploadProblem } from '../../lib/files.js';
  import { dayAfter, formatLabel, shortHash, size as bytes, startOfDay, when } from '../../lib/format.js';
  import { queryParam, route, setQuery } from '../../lib/router.svelte.js';
  import { copy, failed, toast } from '../../lib/toast.svelte.js';
  import { useProject } from './context.svelte.js';
  import FilePreview from './FilePreview.svelte';
  import SamplesModal from './SamplesModal.svelte';

  const { ctx, refreshCounts } = useProject();

  const formats = ['OBJ', 'STL', 'STEP', 'THREE_MF', 'PLY', 'GLTF', 'GLB'].map((value) => ({ value, label: formatLabel(value) }));
  const sorts = [
    { value: 'createdAt', label: 'Uploaded' },
    { value: 'filename', label: 'Filename' },
    { value: 'format', label: 'Format' },
    { value: 'sizeBytes', label: 'Size' }
  ];

  let search = $state('');
  let debounced = $state('');
  let format = $state([]);
  let uploaded = $state({ from: '', to: '' });
  let sort = $state('createdAt');
  let direction = $state('DESC');
  let page = $state(0);
  let size = $state(20);
  let result = $state(null);
  let loading = $state(true);
  let loadError = $state('');
  let uploads = $state([]);
  let over = $state(false);
  let samplesOpen = $state(false);
  let renaming = $state(null);
  let newName = $state('');
  let renameError = $state('');
  let renameBusy = $state(false);
  let deleting = $state(null);
  let downloading = $state('');
  let input = $state();

  const previewId = $derived((route.search, queryParam('file')));
  const packable = (file) => ctx.acceptedFormats.includes(file.format);
  const filtered = $derived(debounced.length >= 3 || format.length > 0 || !!(uploaded.from || uploaded.to));

  let timer;
  $effect(() => {
    const value = search.trim();
    clearTimeout(timer);
    timer = setTimeout(() => {
      const next = value.length >= 3 ? value : '';
      if (next !== debounced) {
        debounced = next;
        page = 0;
      }
    }, 250);
    return () => clearTimeout(timer);
  });

  const params = $derived({
    page,
    size,
    search: debounced || undefined,
    format,
    createdFrom: startOfDay(uploaded.from),
    createdBefore: dayAfter(uploaded.to),
    sort,
    direction
  });

  let generation = 0;
  $effect(() => {
    load(params);
  });

  async function load(query) {
    const current = ++generation;
    loading = true;
    try {
      const next = await api.files(ctx.id, query);
      if (current !== generation) return;
      result = next;
      loadError = '';
    } catch (error) {
      if (current === generation) loadError = error.message;
    } finally {
      if (current === generation) loading = false;
    }
  }

  const reload = () => load(params);

  function resort(nextSort, nextDirection) {
    sort = nextSort;
    direction = nextDirection;
    page = 0;
  }

  function clearFilters() {
    search = '';
    debounced = '';
    format = [];
    uploaded = { from: '', to: '' };
    page = 0;
  }

  function enqueue(list) {
    const added = [...list].map((file) => {
      const problem = uploadProblem(file);
      return {
        key: crypto.randomUUID(),
        file,
        name: file.name,
        size: file.size,
        progress: 0,
        status: problem ? 'error' : 'queued',
        error: problem,
        controller: null
      };
    });
    uploads.push(...added);
    pump();
  }

  let pumping = false;
  async function pump() {
    if (pumping) return;
    pumping = true;
    while (true) {
      const next = uploads.find((entry) => entry.status === 'queued');
      if (!next) break;
      next.status = 'uploading';
      next.controller = new AbortController();
      try {
        await api.upload(ctx.id, next.file, {
          signal: next.controller.signal,
          onProgress: (value) => (next.progress = value)
        });
        next.status = 'done';
        next.progress = 1;
        reload();
        refreshCounts();
      } catch (error) {
        if (error.name === 'AbortError') next.status = 'cancelled';
        else {
          next.status = 'error';
          next.error = error.message;
        }
      }
      next.controller = null;
    }
    pumping = false;
    const finished = uploads.filter((entry) => entry.status === 'done').length;
    if (finished > 0 && uploads.every((entry) => entry.status === 'done')) {
      setTimeout(() => (uploads = uploads.filter((entry) => entry.status !== 'done')), 2500);
    }
  }

  function cancelUpload(entry) {
    if (entry.status === 'uploading') entry.controller?.abort();
    else entry.status = 'cancelled';
  }

  function pick(event) {
    enqueue(event.currentTarget.files);
    event.currentTarget.value = '';
  }

  function drop(event) {
    event.preventDefault();
    event.stopPropagation();
    over = false;
    if (!ctx.canWrite) return;
    if (event.dataTransfer?.files?.length) enqueue(event.dataTransfer.files);
  }

  async function download(file) {
    downloading = file.id;
    try {
      save(await api.fileBlob(ctx.id, file.id), file.filename);
    } catch (error) {
      failed(error);
    } finally {
      downloading = '';
    }
  }

  function openRename(file) {
    renaming = file;
    newName = file.filename;
    renameError = '';
  }

  const renameLocal = $derived(renaming ? renameProblem(newName, renaming.format) : '');

  async function rename() {
    if (renameLocal || renameBusy) return;
    renameBusy = true;
    try {
      await api.renameFile(ctx.id, renaming.id, newName.trim());
      toast.success('File renamed');
      renaming = null;
      reload();
    } catch (error) {
      renameError = error.fieldErrors?.name ?? error.message;
    } finally {
      renameBusy = false;
    }
  }

  function itemsFor(file) {
    const writable = ctx.canWrite;
    const why = ctx.active ? 'You need Can edit permission' : 'Project is archived';
    return [
      { label: 'Preview in 3D', icon: 'box', onselect: () => setQuery({ file: file.id }) },
      { label: 'Download', icon: 'download', onselect: () => download(file) },
      { label: 'Rename', icon: 'pencil', disabled: !writable, title: writable ? undefined : why, onselect: () => openRename(file) },
      { label: 'Copy SHA-256', icon: 'copy', onselect: () => copy(file.checksumSha256, 'SHA-256 copied') },
      { separator: true },
      {
        label: 'Delete file',
        icon: 'trash',
        danger: writable,
        disabled: !writable,
        title: writable ? undefined : why,
        onselect: () => (deleting = file)
      }
    ];
  }

  function changed() {
    reload();
    refreshCounts();
  }
</script>

<svelte:window
  ondragover={(event) => {
    if (ctx.canWrite && event.dataTransfer?.types?.includes('Files')) event.preventDefault();
  }}
  ondrop={(event) => {
    if (ctx.canWrite && event.dataTransfer?.files?.length) drop(event);
  }}
/>

{#if ctx.canWrite}
  <div
    class="pk-dropzone dropzone"
    class:is-over={over}
    role="region"
    aria-label="Upload files"
    ondragenter={(event) => {
      event.preventDefault();
      over = true;
    }}
    ondragover={(event) => event.preventDefault()}
    ondragleave={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) over = false;
    }}
    ondrop={drop}
  >
    <span class="dropzone__line">
      <Icon name="upload" />
      <span><button type="button" class="pk-link linkish" onclick={() => input.click()}>Choose files</button> or drag them here — they upload one at a time</span>
    </span>
    <span class="pk-dropzone__formats">
      {formatsLine} · only {ctx.acceptedFormats.map(formatLabel).join(', ')} can be packed ·
      <button type="button" class="pk-link linkish" onclick={() => (samplesOpen = true)}>add a sample model</button>
    </span>
    <input bind:this={input} type="file" accept={acceptAttribute} multiple hidden onchange={pick} />
  </div>
{/if}

{#if uploads.length > 0}
  <section class="pk-card uploads" aria-label="Uploads">
    <div class="uploads__head">
      <span class="pk-eyebrow">Uploads</span>
      {#if uploads.some((entry) => ['done', 'error', 'cancelled'].includes(entry.status))}
        <button
          type="button"
          class="pk-btn pk-btn--ghost small"
          onclick={() => (uploads = uploads.filter((entry) => entry.status === 'queued' || entry.status === 'uploading'))}>Clear finished</button
        >
      {/if}
    </div>
    {#each uploads as entry (entry.key)}
      <div class="pk-upload">
        <span class="state" class:ok={entry.status === 'done'} class:bad={entry.status === 'error'}>
          {#if entry.status === 'uploading'}<span class="pk-spinner"></span>
          {:else if entry.status === 'done'}<Icon name="check" />
          {:else if entry.status === 'error'}<Icon name="alert" />
          {:else}<Icon name="upload" />{/if}
        </span>
        <span class="upload-name">
          <span class="ellipsis">{entry.name}</span>
          <span class="upload-meta">
            {bytes(entry.size)} ·
            {#if entry.status === 'uploading'}{Math.round(entry.progress * 100)}%
            {:else if entry.status === 'queued'}Waiting
            {:else if entry.status === 'done'}Uploaded
            {:else if entry.status === 'cancelled'}Cancelled
            {:else}<span class="bad-text">{entry.error}</span>{/if}
          </span>
        </span>
        {#if entry.status === 'uploading' || entry.status === 'queued'}
          <button type="button" class="pk-btn pk-btn--ghost small" onclick={() => cancelUpload(entry)}>Cancel</button>
        {:else}
          <span></span>
        {/if}
        {#if entry.status === 'uploading'}
          <div class="pk-progress"><span style:width="{entry.progress * 100}%"></span></div>
        {/if}
      </div>
    {/each}
  </section>
{/if}

<section class="files">
  <div class="pk-filterbar">
    <div class="pk-search">
      <Icon name="search" />
      <label for="file-search" class="sr-only">Search</label>
      <input id="file-search" class="pk-input" type="search" placeholder="Search by filename" bind:value={search} />
    </div>
    <Filter label="Format" options={formats} value={format} onchange={(next) => ((format = next), (page = 0))} />
    <Filter label="Uploaded" kind="dates" value={uploaded} onchange={(next) => ((uploaded = next), (page = 0))} />
    <span class="pk-filterbar__spacer"></span>
    {#if !ctx.canWrite}
      <button
        type="button"
        class="pk-btn"
        aria-disabled="true"
        title={ctx.active ? 'You need Can edit permission to upload' : 'Project is archived and cannot be modified'}><Icon name="upload" />Upload files</button
      >
    {:else if ctx.counts.files != null}
      <span class="count">{ctx.counts.files} {ctx.counts.files === 1 ? 'file' : 'files'} · {ctx.counts.packable ?? 0} packable</span>
    {/if}
    <SortControl options={sorts} {sort} {direction} onchange={(nextSort, nextDirection) => ((sort = nextSort), (direction = nextDirection), (page = 0))} />
  </div>
  {#if search.trim().length > 0 && search.trim().length < 3}<p class="pk-hint">Type at least 3 characters to search.</p>{/if}

  {#if loadError && !result}
    <div class="pk-banner pk-banner--danger" role="alert">
      <Icon name="alert" /><span class="pk-banner__text">{loadError}</span><button type="button" class="pk-btn" onclick={reload}>Retry</button>
    </div>
  {:else}
    <div class="pk-table-wrap" class:loading={loading && result}>
      <div style="overflow-x: auto">
        <table class="pk-table" style="min-width: 760px">
          <thead>
            <tr>
              <SortHeader label="Filename" field="filename" {sort} {direction} onsort={resort} />
              <SortHeader label="Format" field="format" {sort} {direction} onsort={resort} />
              <SortHeader label="Size" field="sizeBytes" {sort} {direction} onsort={resort} num />
              <th>SHA-256</th>
              <SortHeader label="Uploaded" field="createdAt" {sort} {direction} onsort={resort} />
              <th><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {#if !result}
              {#each [1, 2, 3] as row (row)}
                <tr>{#each [1, 2, 3, 4, 5, 6] as cell (cell)}<td><span class="pk-skeleton"></span></td>{/each}</tr>
              {/each}
            {:else if result.content.length === 0}
              <tr>
                <td colspan="6" class="pk-table-empty">
                  {#if filtered}
                    No files match these filters. <button type="button" class="pk-link linkish" onclick={clearFilters}>Clear filters</button>
                  {:else if ctx.canWrite}
                    No files yet. Upload your models above, or <button type="button" class="pk-link linkish" onclick={() => (samplesOpen = true)}
                      >start from a sample</button
                    >.
                  {:else}
                    No files in this project yet.
                  {/if}
                </td>
              </tr>
            {:else}
              {#each result.content as file (file.id)}
                <tr class:is-selected={previewId === file.id}>
                  <td class="pk-cell-main">
                    <button type="button" class="file-link" onclick={() => setQuery({ file: file.id })}>{file.filename}</button>
                    {#if packable(file)}<span class="pk-packable packable"><Icon name="check" size={12} strokeWidth="2.5" />Packable</span>{/if}
                  </td>
                  <td><span class="pk-chip">{formatLabel(file.format)}</span></td>
                  <td class="pk-num">{bytes(file.sizeBytes)}</td>
                  <td>
                    <button type="button" class="hash" title="Copy {file.checksumSha256}" onclick={() => copy(file.checksumSha256, 'SHA-256 copied')}>
                      <span class="pk-mono">{shortHash(file.checksumSha256)}</span>
                    </button>
                  </td>
                  <td class="date">{when(file.createdAt)}</td>
                  <td class="pk-cell-actions">
                    <button
                      type="button"
                      class="pk-btn pk-btn--icon"
                      aria-label="Download {file.filename}"
                      title="Download"
                      disabled={downloading === file.id}
                      onclick={() => download(file)}
                    >
                      {#if downloading === file.id}<span class="pk-spinner"></span>{:else}<Icon name="download" />{/if}
                    </button>
                    <Menu
                      label="More actions for {file.filename}"
                      items={itemsFor(file)}
                      footnote={ctx.active ? '' : 'Read-only while archived'}
                      width={ctx.active ? 220 : 240}
                    />
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
      {#if result && result.totalElements > 0}
        <Pager {page} {size} total={result.totalElements} noun="files" onpage={(next) => (page = next)} onsize={(next) => ((size = next), (page = 0))} />
      {/if}
    </div>
  {/if}
</section>

{#if previewId}
  {#key previewId}
    <FilePreview
      fileId={previewId}
      onclose={() => setQuery({ file: null })}
      onrename={openRename}
      ondelete={(file) => (deleting = file)}
    />
  {/key}
{/if}

{#if samplesOpen}
  <SamplesModal onclose={() => (samplesOpen = false)} onadded={changed} />
{/if}

{#if renaming}
  <Modal title="Rename file" onclose={() => (renaming = null)} busy={renameBusy} onsubmit={rename}>
    <div class="pk-field">
      <label class="pk-label" for="rename-file">Filename</label>
      <input
        id="rename-file"
        class="pk-input"
        class:pk-input--error={renameLocal || renameError}
        autocomplete="off"
        bind:value={newName}
        oninput={() => (renameError = '')}
        data-autofocus
      />
      {#if renameLocal || renameError}<span class="pk-error"><Icon name="alert" size={14} />{renameLocal || renameError}</span>{/if}
    </div>
    {#snippet actions()}
      <button type="button" class="pk-btn" onclick={() => (renaming = null)} disabled={renameBusy}>Cancel</button>
      <button type="submit" class="pk-btn pk-btn--solid" disabled={!!renameLocal || renameBusy || newName.trim() === renaming.filename}>
        {#if renameBusy}<span class="pk-spinner"></span>{/if}Rename
      </button>
    {/snippet}
  </Modal>
{/if}

{#if deleting}
  <Confirm
    title="Delete {deleting.filename}?"
    body="The file is removed for every member and cannot be restored. Past jobs that used it keep their record."
    confirmLabel="Delete file"
    tone="danger"
    onclose={() => (deleting = null)}
    onconfirm={async () => {
      const target = deleting;
      await api.deleteFile(ctx.id, target.id);
      toast.success(`${target.filename} was deleted`);
      if (previewId === target.id) setQuery({ file: null });
      changed();
    }}
  />
{/if}

<style>
  .dropzone {
    gap: 6px;
    padding: 20px 24px;
  }
  .dropzone__line {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }
  .linkish {
    border: 0;
    background: none;
    cursor: pointer;
    font-size: inherit;
    padding: 0;
  }
  .uploads {
    padding: 12px 20px 4px;
  }
  .uploads__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 6px;
  }
  .small {
    height: 28px;
    padding: 0 10px;
    font-size: 13px;
  }
  .state {
    display: inline-grid;
    place-items: center;
    width: 20px;
    color: var(--ink-muted);
  }
  .state.ok {
    color: var(--success);
  }
  .state.bad,
  .bad-text {
    color: var(--danger-ink);
  }
  .upload-name {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .upload-meta {
    font-size: 13px;
    color: var(--ink-muted);
  }
  .ellipsis {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .files {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .count {
    font-size: 14px;
    color: var(--ink-muted);
  }
  .file-link {
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    color: var(--ink);
    cursor: pointer;
    text-align: left;
    overflow-wrap: anywhere;
  }
  .file-link:hover {
    color: var(--link);
  }
  .packable {
    margin-left: 10px;
  }
  .hash {
    border: 0;
    background: none;
    padding: 0;
    cursor: pointer;
  }
  .hash:hover .pk-mono {
    color: var(--ink);
  }
</style>
