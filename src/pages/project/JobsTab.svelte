<script>
  import Badge from '../../components/Badge.svelte';
  import Confirm from '../../components/Confirm.svelte';
  import Filter from '../../components/Filter.svelte';
  import Icon from '../../components/Icon.svelte';
  import Pager from '../../components/Pager.svelte';
  import SortHeader from '../../components/SortHeader.svelte';
  import SortControl from '../../components/SortControl.svelte';
  import { api } from '../../lib/api.js';
  import { save } from '../../lib/files.js';
  import { dayAfter, duration, elapsed, jobLabel, plural, sameDay, size as bytes, startOfDay, when } from '../../lib/format.js';
  import { failed, toast } from '../../lib/toast.svelte.js';
  import { useProject } from './context.svelte.js';

  const { ctx, refreshCounts } = useProject();

  const statuses = [
    { value: 'QUEUED', label: 'Queued' },
    { value: 'RUNNING', label: 'Running' },
    { value: 'SUCCEEDED', label: 'Succeeded' },
    { value: 'FAILED', label: 'Failed' },
    { value: 'CANCELLED', label: 'Cancelled' }
  ];
  const sorts = [
    { value: 'createdAt', label: 'Created' },
    { value: 'startedAt', label: 'Started' },
    { value: 'finishedAt', label: 'Finished' },
    { value: 'status', label: 'Status' },
    { value: 'maxRuntimeSeconds', label: 'Time limit' },
    { value: 'engineVersion', label: 'Engine version' },
    { value: 'resultFileName', label: 'Result name' },
    { value: 'resultSizeBytes', label: 'Result size' }
  ];
  const pollMs = 5000;

  let search = $state('');
  let debounced = $state('');
  let status = $state([]);
  let created = $state({ from: '', to: '' });
  let started = $state({ from: '', to: '' });
  let finished = $state({ from: '', to: '' });
  let sort = $state('createdAt');
  let direction = $state('DESC');
  let page = $state(0);
  let size = $state(20);
  let result = $state(null);
  let loading = $state(true);
  let loadError = $state('');
  let cancelling = $state(null);
  let downloading = $state('');
  let now = $state(Date.now());

  const activeJobs = $derived(result?.content.filter((job) => job.status === 'QUEUED' || job.status === 'RUNNING') ?? []);
  const filtered = $derived(
    debounced.length >= 3 || status.length > 0 || !!(created.from || created.to || started.from || started.to || finished.from || finished.to)
  );

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
    status,
    createdFrom: startOfDay(created.from),
    createdBefore: dayAfter(created.to),
    startedFrom: startOfDay(started.from),
    startedBefore: dayAfter(started.to),
    finishedFrom: startOfDay(finished.from),
    finishedBefore: dayAfter(finished.to),
    sort,
    direction
  });

  let generation = 0;
  $effect(() => {
    load(params);
  });

  async function load(query, quiet = false) {
    const current = ++generation;
    if (!quiet) loading = true;
    try {
      const next = await api.jobs(ctx.id, query);
      if (current !== generation) return;
      const wasActive = new Set(activeJobs.map((job) => job.id));
      result = next;
      loadError = '';
      if (next.content.some((job) => wasActive.has(job.id) && job.status !== 'QUEUED' && job.status !== 'RUNNING')) refreshCounts();
    } catch (error) {
      if (current === generation) loadError = error.message;
    } finally {
      if (current === generation) loading = false;
    }
  }

  $effect(() => {
    if (activeJobs.length === 0) return;
    const query = params;
    const poll = setInterval(() => {
      if (!document.hidden) load(query, true);
    }, pollMs);
    const tick = setInterval(() => (now = Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  });

  function resort(nextSort, nextDirection) {
    sort = nextSort;
    direction = nextDirection;
    page = 0;
  }

  function clearFilters() {
    search = '';
    debounced = '';
    status = [];
    created = { from: '', to: '' };
    started = { from: '', to: '' };
    finished = { from: '', to: '' };
    page = 0;
  }

  async function download(job) {
    downloading = job.id;
    try {
      save(await api.resultBlob(ctx.id, job.id), job.resultFileName ?? `packing-job-${job.id}.obj`);
    } catch (error) {
      failed(error);
    } finally {
      downloading = '';
    }
  }

  const containersOf = (job) => job.resultBins?.length ?? 0;
</script>

<section class="jobs">
  <div class="pk-filterbar">
    <div class="pk-search">
      <Icon name="search" />
      <label for="job-search" class="sr-only">Search</label>
      <input id="job-search" class="pk-input" type="search" placeholder="Engine version, result or failure reason" bind:value={search} />
    </div>
    <Filter label="Status" options={statuses} value={status} onchange={(next) => ((status = next), (page = 0))} />
    <Filter label="Created" kind="dates" value={created} onchange={(next) => ((created = next), (page = 0))} />
    <Filter label="Started" kind="dates" value={started} onchange={(next) => ((started = next), (page = 0))} />
    <Filter label="Finished" kind="dates" value={finished} onchange={(next) => ((finished = next), (page = 0))} />
    <span class="pk-filterbar__spacer"></span>
    <SortControl options={sorts} {sort} {direction} onchange={(nextSort, nextDirection) => ((sort = nextSort), (direction = nextDirection), (page = 0))} />
  </div>
  {#if search.trim().length > 0 && search.trim().length < 3}<p class="pk-hint">Type at least 3 characters to search.</p>{/if}
  {#if activeJobs.length > 0}
    <span class="pk-row live" role="status"><span class="pk-spinner"></span>{plural(activeJobs.length, 'job')} in progress · this list refreshes every 5 s</span>
  {/if}

  {#if loadError && !result}
    <div class="pk-banner pk-banner--danger" role="alert">
      <Icon name="alert" /><span class="pk-banner__text">{loadError}</span><button type="button" class="pk-btn" onclick={() => load(params)}>Retry</button>
    </div>
  {:else}
    <div class="pk-table-wrap" class:loading={loading && result}>
      <div style="overflow-x: auto">
        <table class="pk-table" style="min-width: 980px">
          <thead>
            <tr>
              <SortHeader label="Status" field="status" {sort} {direction} onsort={resort} />
              <th>Job</th>
              <SortHeader label="Created" field="createdAt" {sort} {direction} onsort={resort} />
              <SortHeader label="Started" field="startedAt" {sort} {direction} onsort={resort} />
              <SortHeader label="Finished" field="finishedAt" {sort} {direction} onsort={resort} />
              <SortHeader label="Time limit" field="maxRuntimeSeconds" {sort} {direction} onsort={resort} num />
              <SortHeader label="Engine" field="engineVersion" {sort} {direction} onsort={resort} />
              <SortHeader label="Result" field="resultFileName" {sort} {direction} onsort={resort} />
              <th><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {#if !result}
              {#each [1, 2, 3] as row (row)}
                <tr>{#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as cell (cell)}<td><span class="pk-skeleton"></span></td>{/each}</tr>
              {/each}
            {:else if result.content.length === 0}
              <tr>
                <td colspan="9" class="pk-table-empty">
                  {#if filtered}
                    No jobs match these filters. <button type="button" class="pk-link linkish" onclick={clearFilters}>Clear filters</button>
                  {:else if ctx.canWrite}
                    No packing jobs yet. <a href="/projects/{ctx.id}/jobs/new">Start the first one</a>.
                  {:else}
                    No packing jobs in this project yet.
                  {/if}
                </td>
              </tr>
            {:else}
              {#each result.content as job (job.id)}
                {@const run = elapsed(job.startedAt, job.finishedAt, now)}
                <tr>
                  <td><Badge kind="job" status={job.status} /></td>
                  <td class="pk-cell-main"><a href="/projects/{ctx.id}/jobs/{job.id}" class="cell-link">{jobLabel(job.id)}</a></td>
                  <td class="date">{when(job.createdAt, { timeAlways: true })}</td>
                  <td class="date" class:faint={!job.startedAt} title={job.startedAt ? when(job.startedAt, { seconds: true }) : undefined}>{sameDay(job.startedAt, job.createdAt)}</td>
                  <td class="date" class:faint={!job.finishedAt} title={job.finishedAt ? when(job.finishedAt, { seconds: true }) : undefined}>{sameDay(job.finishedAt, job.createdAt)}</td>
                  <td class="pk-num">{job.input?.maxRuntimeSeconds != null ? `${job.input.maxRuntimeSeconds} s` : '—'}</td>
                  <td class:faint={!job.engineVersion}>{#if job.engineVersion}<span class="pk-mono">{job.engineVersion}</span>{:else}—{/if}</td>
                  <td class="result">
                    {#if job.status === 'SUCCEEDED'}
                      <span class="strong">{job.resultFileName ?? 'Result'}</span>
                      <span class="muted nowrap">· {bytes(job.resultSizeBytes)}</span>
                      {#if containersOf(job) > 1}<span class="muted nowrap">· {plural(containersOf(job), 'container')}</span>{/if}
                    {:else if job.status === 'RUNNING'}
                      <span class="muted nowrap">Packing… {duration(run)} elapsed</span>
                    {:else if job.status === 'QUEUED'}
                      <span class="muted">Waiting for the engine</span>
                    {:else if job.status === 'FAILED'}
                      <span class="danger" title={job.failureReason}>{job.failureReason ?? 'Failed'}</span>
                    {:else}
                      <span class="faint-text">—</span>
                    {/if}
                  </td>
                  <td class="pk-cell-actions">
                    {#if (job.status === 'QUEUED' || job.status === 'RUNNING') && ctx.canWrite}
                      <button type="button" class="pk-btn" onclick={() => (cancelling = job)}>Cancel</button>
                    {:else if job.status === 'SUCCEEDED'}
                      <button type="button" class="pk-btn" disabled={downloading === job.id} onclick={() => download(job)}>
                        {#if downloading === job.id}<span class="pk-spinner"></span>{:else}<Icon name="download" />{/if}Result
                      </button>
                    {:else if ctx.canWrite && job.input}
                      <a href="/projects/{ctx.id}/jobs/new?from={job.id}" class="pk-btn"><Icon name="refresh" />Run again</a>
                    {/if}
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
      {#if result && result.totalElements > 0}
        <Pager {page} {size} total={result.totalElements} noun="jobs" onpage={(next) => (page = next)} onsize={(next) => ((size = next), (page = 0))} />
      {/if}
    </div>
  {/if}
</section>

{#if cancelling}
  <Confirm
    title="Cancel job {jobLabel(cancelling.id)}?"
    body="It shows as Cancelled right away; the engine stops within about a minute. No email is sent."
    confirmLabel="Cancel job"
    cancelLabel="Keep running"
    tone="danger"
    onclose={() => (cancelling = null)}
    onconfirm={async () => {
      try {
        await api.cancelJob(ctx.id, cancelling.id);
        toast.success(`Job ${jobLabel(cancelling.id)} cancelled`);
      } catch (error) {
        if (error.status === 409) toast.warning("Already finished — this job can't be cancelled");
        else throw error;
      }
      load(params, true);
    }}
  />
{/if}

<style>
  .jobs {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .live {
    font-size: 14px;
    color: var(--ink-muted);
  }
  .linkish {
    border: 0;
    background: none;
    cursor: pointer;
    font-size: inherit;
    padding: 0;
  }
  .jobs :global(.pk-table td),
  .jobs :global(.pk-table th:not(.sortable)),
  .jobs :global(.pk-table th.sortable > button) {
    padding-left: 12px;
    padding-right: 12px;
  }
  .result {
    max-width: 260px;
  }
  .strong {
    color: var(--ink);
  }
  .muted {
    color: var(--ink-muted);
  }
  .danger {
    color: var(--danger-ink);
    display: inline-block;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: bottom;
  }
  .faint-text {
    color: var(--ink-faint);
  }
</style>
