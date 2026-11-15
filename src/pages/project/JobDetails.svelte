<script>
  import { onMount } from 'svelte';
  import Badge from '../../components/Badge.svelte';
  import Confirm from '../../components/Confirm.svelte';
  import Icon from '../../components/Icon.svelte';
  import Viewer from '../../components/LazyViewer.svelte';
  import { api } from '../../lib/api.js';
  import { save, stem } from '../../lib/files.js';
  import {
    dims,
    duration,
    elapsed,
    jobLabel,
    limit as limitLabel,
    midHash,
    modelColor,
    plural,
    size as bytes,
    when
  } from '../../lib/format.js';
  import { binStride, containerOf, describeValue, fieldsOf, parametersOf } from '../../lib/schema.js';
  import { copy, failed, toast } from '../../lib/toast.svelte.js';
  import { loadSchema, useProject } from './context.svelte.js';

  let { jobId } = $props();

  const { ctx, refreshCounts } = useProject();
  const triangleBudget = 3_000_000;
  const autoFullBytes = 30 * 1024 * 1024;

  let job = $state(null);
  let missing = $state(false);
  let loadError = $state('');
  let fields = $state([]);
  let fileSizes = $state({});
  let now = $state(Date.now());
  let cancelling = $state(false);
  let downloading = $state('');

  let source = $state(null);
  let shown = $state('');
  let viewLoading = $state('');
  let viewError = $state('');
  let stats = $state(null);
  let hidden = $state([]);
  let focus = $state(null);

  const active = $derived(job?.status === 'QUEUED' || job?.status === 'RUNNING');
  const items = $derived((job?.input?.items ?? []).map((item) => ({ name: item.fileName, copies: item.copies, fileId: item.fileId })));
  const totalParts = $derived(items.reduce((sum, item) => sum + (item.copies ?? 0), 0));
  const parameters = $derived(parametersOf(job?.input?.parameters));
  const box = $derived(containerOf(parameters));
  const bins = $derived(job?.resultBins ?? []);
  const binCount = $derived(Math.max(bins.length, 1));
  const containers = $derived(box ? { ...box, stride: binStride(parameters), count: binCount } : null);
  const models = $derived(job?.preview?.status === 'READY' ? (job.preview.models ?? []) : []);
  const previewPending = $derived(job?.status === 'SUCCEEDED' && job.preview?.status === 'PENDING');
  const run = $derived(job ? elapsed(job.startedAt, job.finishedAt, now) : null);
  const queued = $derived(job ? elapsed(job.createdAt, job.startedAt ?? job.finishedAt, now) : null);
  const runtimeLimit = $derived(job?.input?.maxRuntimeSeconds);
  const resultName = $derived(job?.resultFileName ?? `packing-job-${jobId}.obj`);

  onMount(() => {
    refresh(true);
    loadSchema()
      .then((schema) => (fields = fieldsOf(schema)))
      .catch(() => {});
  });

  $effect(() => {
    if (!active && !previewPending) return;
    const poll = setInterval(() => !document.hidden && refresh(), 3000);
    const tick = setInterval(() => (now = Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  });

  async function refresh(first = false) {
    try {
      const previous = job;
      const next = await api.job(ctx.id, jobId);
      job = next;
      loadError = '';
      if (first) loadFileSizes(next);
      const finishedNow = previous && (previous.status === 'QUEUED' || previous.status === 'RUNNING') && next.status !== previous.status && next.status !== 'RUNNING';
      if (finishedNow) refreshCounts();
      if (next.status === 'SUCCEEDED' && (first || finishedNow || (previous?.preview?.status === 'PENDING' && next.preview?.status !== 'PENDING' && !shown))) {
        openResult(next);
      }
    } catch (error) {
      if (error.status === 404 || error.status === 400) missing = true;
      else loadError = error.message;
    }
  }

  async function loadFileSizes(target) {
    const ids = new Set((target.input?.items ?? []).map((item) => item.fileId));
    if (!ids.size) return;
    try {
      const result = await api.files(ctx.id, { size: 100 });
      fileSizes = Object.fromEntries(result.content.filter((file) => ids.has(file.id)).map((file) => [file.id, file.sizeBytes]));
    } catch {
      fileSizes = {};
    }
  }

  function defaultQuality(list) {
    const fitting = list.filter((model) => model.triangles <= triangleBudget);
    return (fitting.at(-1) ?? list[0]).quality;
  }

  async function openResult(target) {
    const list = target.preview?.status === 'READY' ? (target.preview.models ?? []) : [];
    if (list.length > 0) {
      const wanted = defaultQuality(list);
      if (list[0].quality !== wanted && list[0].sizeBytes < (list.find((model) => model.quality === wanted)?.sizeBytes ?? 0) / 3) {
        await showPreview(list[0].quality);
      }
      await showPreview(wanted);
    } else if (target.preview?.status !== 'PENDING' && (target.resultSizeBytes ?? 0) <= autoFullBytes) {
      await showFull();
    }
  }

  async function showPreview(quality) {
    shown = quality;
    viewError = '';
    viewLoading = `Loading the ${quality.toLowerCase()} preview…`;
    try {
      const data = await api.previewBuffer(ctx.id, jobId, quality);
      if (shown !== quality) return;
      source = { kind: 'glb', data };
      viewLoading = 'Preparing the scene…';
    } catch (error) {
      if (shown === quality) {
        viewError = error.message;
        viewLoading = '';
      }
    }
  }

  async function showFull() {
    shown = 'FULL';
    viewError = '';
    viewLoading = `Loading the full result (${bytes(job.resultSizeBytes)})…`;
    try {
      const data = await api.resultBuffer(ctx.id, jobId);
      if (shown !== 'FULL') return;
      source = { kind: 'obj', data };
      viewLoading = 'Preparing the scene…';
    } catch (error) {
      if (shown === 'FULL') {
        viewError = error.message;
        viewLoading = '';
      }
    }
  }

  async function download(kind, extra) {
    downloading = kind + (extra ?? '');
    try {
      if (kind === 'result') save(await api.resultBlob(ctx.id, jobId), resultName);
      if (kind === 'bin') save(await api.binBlob(ctx.id, jobId, extra), `${stem(resultName)}-container-${String(extra).padStart(3, '0')}.obj`);
      if (kind === 'glb') {
        const data = await api.previewBuffer(ctx.id, jobId, extra);
        save(new Blob([data], { type: 'model/gltf-binary' }), `${stem(resultName)}-preview-${extra.toLowerCase()}.glb`);
      }
      if (kind === 'binglb') {
        const model = binPreview(bins.find((bin) => bin.number === extra));
        const data = await api.binPreviewBuffer(ctx.id, jobId, extra, model.quality);
        save(
          new Blob([data], { type: 'model/gltf-binary' }),
          `${stem(resultName)}-container-${String(extra).padStart(3, '0')}-${model.quality.toLowerCase()}.glb`
        );
      }
    } catch (error) {
      failed(error);
    } finally {
      downloading = '';
    }
  }

  function binPreview(bin) {
    const list = bin?.previews ?? [];
    if (!list.length) return null;
    return list.find((model) => model.quality === shown) ?? list.find((model) => model.quality === defaultQuality(list));
  }

  function toggleItem(index) {
    hidden = hidden.includes(index) ? hidden.filter((entry) => entry !== index) : [...hidden, index];
  }

  const triangles = (count) => (count >= 1_000_000 ? `${(count / 1_000_000).toFixed(1)}M` : `${Math.max(1, Math.round(count / 1000))}k`);

  const sentence = $derived.by(() => {
    if (!job) return '';
    const engine = job.engineVersion ? ` on engine ${job.engineVersion}` : '';
    const ofLimit = runtimeLimit ? ` of its ${duration(runtimeLimit)} limit` : '';
    const finished = job.finishedAt
      ? ` · finished ${when(job.finishedAt, { timeAlways: true }).replace(/^(Today|Yesterday)?(.*), (\d\d:\d\d)$/, (_, word, rest, clock) => `${word ? word.toLowerCase() : rest.trim()} at ${clock}`)}`
      : '';
    if (job.status === 'SUCCEEDED') return `Ran ${duration(run)}${ofLimit}${engine}${finished}`;
    if (job.status === 'RUNNING') return `Running for ${duration(run)}${ofLimit}${engine}`;
    if (job.status === 'QUEUED') return `Waiting for the engine for ${duration(queued)}${runtimeLimit ? ` · time limit ${duration(runtimeLimit)}` : ''}`;
    if (job.status === 'FAILED') return `Failed${run != null ? ` after ${duration(run)}` : ''}${engine}${finished}`;
    return `Cancelled${finished}`;
  });

  function parameterRows() {
    const rows = [];
    const seen = new Set();
    for (const field of fields) {
      seen.add(field.key);
      if (parameters[field.key] !== undefined) rows.push({ label: field.title, value: describeValue(field, parameters[field.key]) });
    }
    for (const [key, value] of Object.entries(parameters)) {
      if (!seen.has(key)) rows.push({ label: key, value: describeValue(null, value) });
    }
    return rows;
  }
</script>

{#if missing}
  <div class="pk-empty">
    <h1 class="pk-empty__title">Job not found</h1>
    <p class="pk-empty__body">It may belong to another project, or the link is wrong.</p>
    <a href="/projects/{ctx.id}/jobs" class="pk-btn pk-btn--cta">Back to jobs</a>
  </div>
{:else if !job}
  {#if loadError}
    <div class="pk-banner pk-banner--danger" role="alert">
      <Icon name="alert" /><span class="pk-banner__text">{loadError}</span>
      <button type="button" class="pk-btn" onclick={() => refresh(true)}>Retry</button>
    </div>
  {:else}
    <div class="pk-row muted"><span class="pk-spinner"></span>Loading the job…</div>
  {/if}
{:else}
  <div class="pk-page-head head">
    <div class="head__text">
      <div class="pk-row title-row"><h1 class="pk-page-title">Job {jobLabel(job.id)}</h1><Badge kind="job" status={job.status} /></div>
      <p class="pk-page-sub">{sentence}</p>
    </div>
    <div class="pk-row">
      {#if active && ctx.canWrite}
        <button type="button" class="pk-btn" onclick={() => (cancelling = true)}><Icon name="stop" />Cancel job</button>
      {/if}
      {#if ctx.canWrite && job.input && !active}
        <a href="/projects/{ctx.id}/jobs/new?from={job.id}" class="pk-btn"><Icon name="refresh" />Run again</a>
      {/if}
      {#if job.status === 'SUCCEEDED'}
        <button type="button" class="pk-btn pk-btn--cta" disabled={downloading === 'result'} onclick={() => download('result')}>
          {#if downloading === 'result'}<span class="pk-spinner"></span>{:else}<Icon name="download" />{/if}Download result
        </button>
      {/if}
    </div>
  </div>

  <section class="pk-card timeline" aria-label="Timeline">
    {#each [['Created', job.createdAt], ['Started', job.startedAt], ['Finished', job.finishedAt]] as [label, at] (label)}
      <div class="step">
        <span class="pk-eyebrow">{label}</span>
        <span class="step__value" class:faint={!at}>{at ? when(at, { seconds: true }) : '—'}</span>
      </div>
    {/each}
  </section>

  {#if active}
    <section class="pk-card pk-card--raised live" aria-live="polite">
      <div class="pk-row live__row">
        <span class="pk-spinner"></span>
        {#if job.status === 'QUEUED'}
          <span><b>Waiting for the engine.</b> Queued for {duration(queued)}. The time limit starts when it begins packing.</span>
        {:else}
          <span><b>Packing.</b> {duration(run)} of {runtimeLimit ? duration(runtimeLimit) : 'its limit'} used — the engine keeps the best layout it finds.</span>
        {/if}
      </div>
      {#if job.status === 'RUNNING' && runtimeLimit}
        <div class="pk-progress progress"><span style:width="{Math.min(100, ((run ?? 0) / runtimeLimit) * 100)}%"></span></div>
      {/if}
      <p class="pk-muted small">This page updates by itself. You also get an email when the job succeeds or fails.</p>
    </section>
  {:else if job.status === 'FAILED'}
    <div class="pk-banner pk-banner--danger" role="alert" style="align-items: flex-start">
      <Icon name="alert" />
      <span class="pk-banner__text"><b>The job failed.</b> {job.failureReason ?? 'The engine did not report a reason.'}</span>
    </div>
  {:else if job.status === 'CANCELLED'}
    <div class="pk-banner pk-banner--info" role="status">
      <Icon name="info" /><span class="pk-banner__text">This job was cancelled. Nothing was produced.</span>
    </div>
  {/if}

  {#if job.status === 'SUCCEEDED'}
    <section class="pk-card pk-card--raised result" aria-labelledby="result-h">
      <div class="result__head">
        <h2 id="result-h" class="pk-card__title">Packed result</h2>
        <div class="pk-row quality">
          {#if models.length > 0}
            <span class="pk-hint">Preview quality</span>
            <div class="segmented" role="group" aria-label="Preview quality">
              {#each models as model (model.quality)}
                <button
                  type="button"
                  class:is-active={shown === model.quality}
                  aria-pressed={shown === model.quality}
                  title="{triangles(model.triangles)} triangles · {bytes(model.sizeBytes)}"
                  onclick={() => showPreview(model.quality)}>{model.quality.toLowerCase()} · {triangles(model.triangles)}</button
                >
              {/each}
              <button
                type="button"
                class:is-active={shown === 'FULL'}
                aria-pressed={shown === 'FULL'}
                title="The original OBJ · {bytes(job.resultSizeBytes)}"
                onclick={showFull}>full · {bytes(job.resultSizeBytes)}</button
              >
            </div>
          {/if}
        </div>
      </div>

      {#if binCount > 1}
        <div class="containers" role="group" aria-label="Containers">
          <span class="pk-eyebrow">{plural(binCount, 'container')} filled</span>
          <div class="segmented">
            <button type="button" class:is-active={focus === null} aria-pressed={focus === null} onclick={() => (focus = null)}>All side by side</button>
            {#each bins as bin, index (bin.number)}
              <button type="button" class:is-active={focus === index} aria-pressed={focus === index} onclick={() => (focus = index)}>
                Container {bin.number}{#if stats?.perContainer?.[index] != null}<span class="seg-count">{stats.perContainer[index]}</span>{/if}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <div class="result__body">
        <Viewer
          class="result-viewer"
          {source}
          subject={job.id}
          zUp
          {items}
          {containers}
          {hidden}
          {focus}
          boundsToggle
          loading={viewLoading}
          error={viewError}
          message={previewPending ? 'Preparing a lighter preview…' : 'The result is not loaded'}
          onstats={(next) => {
            stats = next;
            if (next) viewLoading = '';
          }}
          onerror={(error) => {
            viewError = `Could not show the result: ${error.message}`;
            viewLoading = '';
          }}
        >
          {#snippet chip()}
            {#if box}Container {dims(box.width, box.length, box.height)}{:else if stats}Bounding box {dims(stats.size.x, stats.size.y, stats.size.z)}{/if}
          {/snippet}
        </Viewer>

        <div class="side">
          {#if !source && !viewLoading}
            <div class="load-full">
              {#if previewPending}
                <p class="pk-muted small">A lighter preview is being prepared. It appears here on its own.</p>
              {/if}
              <button type="button" class="pk-btn" onclick={showFull}><Icon name="eye" />Load the full result ({bytes(job.resultSizeBytes)})</button>
            </div>
          {/if}
          {#if items.length > 0}
            <div>
              <h3 class="pk-eyebrow legend-title">{focus === null ? 'Models · click to hide' : `Models in container ${bins[focus]?.number ?? focus + 1}`}</h3>
              <div class="pk-legend">
                {#each items as item, index (index)}
                  {@const inFocus = focus === null ? item.copies : (stats?.byContainer?.[focus]?.[index] ?? 0)}
                  <button
                    type="button"
                    class="pk-legend__row legend-row"
                    class:is-hidden={hidden.includes(index) || inFocus === 0}
                    aria-pressed={!hidden.includes(index)}
                    onclick={() => toggleItem(index)}
                  >
                    <span class="pk-swatch" style:background={modelColor(index)}></span>
                    <span class="legend-name">{item.name ?? 'Model'}</span>
                    <span class="pk-legend__count">× {inFocus}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}
          <dl class="pk-dl facts">
            <dt>Parts</dt>
            <dd>{totalParts || stats?.objects || '—'}</dd>
            <dt>Containers</dt>
            <dd>{bins.length ? binCount : '1'}</dd>
            {#if box}
              <dt>Container size</dt>
              <dd>{dims(box.width, box.length, box.height)}</dd>
            {/if}
            {#if focus !== null && stats?.perContainer?.[focus] != null}
              <dt>In container {bins[focus]?.number ?? focus + 1}</dt>
              <dd>{plural(stats.perContainer[focus], 'part')}</dd>
            {:else if stats}
              <dt>Bounding box</dt>
              <dd>{dims(stats.size.x, stats.size.y, stats.size.z)}</dd>
            {/if}
          </dl>
          <p class="pk-muted tiny">Sizes are in the models' own units, measured by the viewer from the result file.</p>
        </div>
      </div>

      <div class="downloads">
        <div class="file-row">
          <div class="file-row__info">
            <span class="file-icon"><Icon name="box" size={20} /></span>
            <div class="file-row__text">
              <span class="file-name">{resultName}</span>
              <span class="pk-muted small">
                {binCount > 1 ? `All ${binCount} containers side by side` : 'Combined result'} · OBJ · {bytes(job.resultSizeBytes)}
                {#if job.resultChecksum}· SHA-256 <span class="pk-mono">{midHash(job.resultChecksum)}</span>{/if}
              </span>
            </div>
          </div>
          <div class="pk-row">
            {#if job.resultChecksum}
              <button type="button" class="pk-btn pk-btn--ghost" onclick={() => copy(job.resultChecksum, 'Checksum copied')}><Icon name="copy" />Copy checksum</button>
            {/if}
            <button type="button" class="pk-btn" disabled={downloading === 'result'} onclick={() => download('result')}>
              {#if downloading === 'result'}<span class="pk-spinner"></span>{:else}<Icon name="download" />{/if}OBJ
            </button>
            {#if shown && shown !== 'FULL'}
              <button type="button" class="pk-btn" disabled={downloading === `glb${shown}`} onclick={() => download('glb', shown)} title="The preview you are looking at">
                {#if downloading === `glb${shown}`}<span class="pk-spinner"></span>{:else}<Icon name="download" />{/if}{shown.toLowerCase()} GLB
              </button>
            {/if}
          </div>
        </div>
        {#if bins.length > 1}
          <div class="bins">
            <span class="pk-eyebrow">One file per container · each in its own coordinates</span>
            {#each bins as bin, index (bin.number)}
              {@const preview = binPreview(bin)}
              <div class="bin-row" class:is-focus={focus === index}>
                <span class="pk-swatch bin-swatch"><Icon name="containers" size={12} /></span>
                <button type="button" class="bin-name" onclick={() => (focus = index)}>Container {bin.number}</button>
                <span class="pk-muted small">
                  {#if stats?.perContainer?.[index] != null}{plural(stats.perContainer[index], 'part')} ·{/if}
                  {bytes(bin.sizeBytes)}
                </span>
                <span class="spacer"></span>
                {#if bin.checksum}
                  <button type="button" class="pk-btn pk-btn--icon" aria-label="Copy checksum of container {bin.number}" title="Copy checksum" onclick={() => copy(bin.checksum, 'Checksum copied')}>
                    <Icon name="copy" />
                  </button>
                {/if}
                <button type="button" class="pk-btn small-btn" disabled={downloading === `bin${bin.number}`} onclick={() => download('bin', bin.number)}>
                  {#if downloading === `bin${bin.number}`}<span class="pk-spinner"></span>{:else}<Icon name="download" />{/if}OBJ
                </button>
                {#if preview}
                  <button
                    type="button"
                    class="pk-btn small-btn"
                    disabled={downloading === `binglb${bin.number}`}
                    onclick={() => download('binglb', bin.number)}
                    title="Lighter preview of container {bin.number} · {triangles(preview.triangles)} triangles · {bytes(preview.sizeBytes)}"
                  >
                    {#if downloading === `binglb${bin.number}`}<span class="pk-spinner"></span>{:else}<Icon name="download" />{/if}{preview.quality.toLowerCase()} GLB
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </section>
  {/if}

  <div class="cards">
    <section class="pk-card inputs" aria-labelledby="inputs-h">
      <div class="inputs__head">
        <h2 id="inputs-h" class="pk-card__title">Input models <span class="sub">· {plural(items.length, 'model')}, {plural(totalParts, 'part')}</span></h2>
        <p class="pk-muted tiny">Names as they were when the job was submitted.</p>
      </div>
      {#if items.length}
        <table class="pk-table">
          <thead><tr><th>Model</th><th class="pk-num">Copies</th><th class="pk-num">Size</th></tr></thead>
          <tbody>
            {#each items as item, index (index)}
              <tr>
                <td class="pk-cell-main"><span class="pk-row swatch-row"><span class="pk-swatch" style:background={modelColor(index)}></span>{item.name ?? 'Model'}</span></td>
                <td class="pk-num">{item.copies}</td>
                <td class="pk-num" class:faint={fileSizes[item.fileId] == null} title={fileSizes[item.fileId] == null ? 'The file is no longer in the project' : undefined}>
                  {fileSizes[item.fileId] != null ? bytes(fileSizes[item.fileId]) : '—'}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="pk-muted inputs__empty">This job was created before inputs were recorded.</p>
      {/if}
    </section>
    <section class="pk-card" aria-labelledby="engine-h">
      <h2 id="engine-h" class="pk-card__title engine-title">Settings and engine</h2>
      <dl class="pk-dl">
        <dt>Time limit</dt>
        <dd>{limitLabel(runtimeLimit)}</dd>
        {#each parameterRows() as row (row.label)}
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        {:else}
          <dt>Engine options</dt>
          <dd>None</dd>
        {/each}
        <dt>Engine version</dt>
        <dd>{#if job.engineVersion}<span class="pk-mono">{job.engineVersion}</span>{:else}—{/if}</dd>
        <dt>Engine checksum</dt>
        <dd>
          {#if job.engineChecksum}
            <button type="button" class="hash" title="Copy" onclick={() => copy(job.engineChecksum, 'Checksum copied')}>
              <span class="pk-mono">{midHash(job.engineChecksum)}</span><Icon name="copy" size={14} />
            </button>
          {:else}—{/if}
        </dd>
        {#if job.input?.schemaVersion != null}
          <dt>Input schema</dt>
          <dd>v{job.input.schemaVersion}</dd>
        {/if}
      </dl>
    </section>
  </div>
{/if}

{#if cancelling}
  <Confirm
    title="Cancel job {jobLabel(job.id)}?"
    body="It shows as Cancelled right away; the engine stops within about a minute. No email is sent."
    confirmLabel="Cancel job"
    cancelLabel="Keep running"
    tone="danger"
    onclose={() => (cancelling = false)}
    onconfirm={async () => {
      try {
        job = await api.cancelJob(ctx.id, job.id);
        toast.success(`Job ${jobLabel(job.id)} cancelled`);
        refreshCounts();
      } catch (error) {
        if (error.status === 409) {
          toast.warning("Already finished — this job can't be cancelled");
          refresh();
        } else throw error;
      }
    }}
  />
{/if}

<style>
  .muted {
    color: var(--ink-muted);
    font-size: 14px;
  }
  .small {
    font-size: 14px;
  }
  .tiny {
    font-size: 13px;
  }
  .faint {
    color: var(--ink-faint);
  }
  .head {
    margin-bottom: 0;
  }
  .head__text {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .title-row {
    gap: 12px;
  }
  .timeline {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }
  .step {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-right: 16px;
    border-right: 1px solid var(--hairline);
  }
  .step:last-child {
    border-right: 0;
  }
  .step__value {
    font-size: 16px;
  }
  .live {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .live__row {
    gap: 10px;
    font-size: 15px;
    flex-wrap: nowrap;
  }
  .progress {
    height: 6px;
  }
  .result {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .result__head {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .result__head .pk-card__title {
    margin: 0;
  }
  .quality {
    gap: 10px;
  }
  .segmented {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 3px;
    border: 1px solid var(--hairline);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  .segmented button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--ink-secondary);
    font: 500 13px/1 var(--font-sans);
    cursor: pointer;
  }
  .segmented button:hover {
    background: var(--surface-hover);
  }
  .segmented button.is-active {
    background: var(--primary-soft);
    color: var(--link);
  }
  .seg-count {
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: var(--radius-full);
    background: var(--neutral-soft);
    color: var(--ink-muted);
    font-size: 11px;
    display: inline-grid;
    place-items: center;
  }
  .is-active .seg-count {
    background: var(--surface);
    color: var(--link);
  }
  .containers {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }
  .result__body {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    align-items: stretch;
  }
  .result__body :global(.result-viewer) {
    flex: 999 1 520px;
    height: 480px;
  }
  .side {
    flex: 1 1 260px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .load-full {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }
  .legend-title {
    margin: 0 0 8px;
  }
  .legend-row {
    border: 0;
    background: none;
    width: 100%;
    font-family: inherit;
    cursor: pointer;
    text-align: left;
  }
  .legend-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .facts {
    grid-template-columns: 120px 1fr;
    font-size: 14px;
    padding-top: 16px;
    border-top: 1px solid var(--hairline);
  }
  .facts + .tiny {
    margin-top: -8px;
  }
  .downloads {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 20px;
    border-top: 1px solid var(--hairline);
  }
  .file-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .file-row__info {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }
  .file-icon {
    width: 44px;
    height: 44px;
    border-radius: 8px;
    background: var(--success-soft);
    color: var(--success-ink);
    display: grid;
    place-items: center;
    flex: none;
  }
  .file-row__text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .file-name {
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .bins {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .bins .pk-eyebrow {
    margin-bottom: 6px;
  }
  .bin-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    padding: 0 8px;
    border-radius: var(--radius-sm);
  }
  .bin-row:hover,
  .bin-row.is-focus {
    background: var(--surface-hover);
  }
  .bin-swatch {
    width: 20px;
    height: 20px;
    display: grid;
    place-items: center;
    background: var(--neutral-soft);
    color: var(--ink-muted);
  }
  .bin-name {
    border: 0;
    background: none;
    padding: 0;
    font: 500 14px/1 var(--font-sans);
    color: var(--ink);
    cursor: pointer;
  }
  .bin-name:hover {
    color: var(--link);
  }
  .spacer {
    flex: 1;
  }
  .small-btn {
    height: 28px;
    padding: 0 10px;
    font-size: 13px;
  }
  .cards {
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    align-items: flex-start;
  }
  .cards > section {
    flex: 1 1 380px;
  }
  .inputs {
    padding: 0;
    overflow: hidden;
  }
  .inputs__head {
    padding: 20px 24px 12px;
  }
  .inputs__head .pk-card__title {
    margin: 0;
  }
  .inputs__head .tiny {
    margin-top: 4px;
  }
  .inputs__empty {
    padding: 0 24px 20px;
  }
  .sub {
    font-weight: 400;
    color: var(--ink-muted);
  }
  .swatch-row {
    gap: 10px;
    flex-wrap: nowrap;
  }
  .engine-title {
    margin-bottom: 16px;
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
  @media (max-width: 840px) {
    .timeline {
      grid-template-columns: 1fr;
    }
    .step {
      border-right: 0;
      padding-right: 0;
    }
    .result__body :global(.result-viewer) {
      height: 360px;
    }
  }
</style>
