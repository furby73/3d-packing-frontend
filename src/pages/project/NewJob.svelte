<script>
  import { onMount } from 'svelte';
  import Icon from '../../components/Icon.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { api } from '../../lib/api.js';
  import { packingOf } from '../../lib/files.js';
  import { duration, formatLabel, jobLabel, limit as limitLabel, modelColor, plural, size as bytes } from '../../lib/format.js';
  import { navigate, queryParam } from '../../lib/router.svelte.js';
  import {
    defaultsOf,
    describeValue,
    fieldProblem,
    fieldsOf,
    limitsOf,
    mergeParameters,
    parametersOf,
    problemsOf,
    rangeHint
  } from '../../lib/schema.js';
  import { toast } from '../../lib/toast.svelte.js';
  import { loadSchema, resetSchema, useProject } from './context.svelte.js';

  const { ctx, refreshCounts } = useProject();
  const from = queryParam('from');

  let phase = $state('loading');
  let loadError = $state('');
  let limits = $state(null);
  let fields = $state([]);
  let files = $state([]);
  let hiddenFiles = $state({ reupload: [], unsupported: [] });
  let draft = $state(null);
  let renamed = $state([]);
  let picks = $state({});
  let order = $state([]);
  let runtime = $state(60);
  let parameters = $state({});
  let search = $state('');
  let submitting = $state(false);
  let submitError = $state('');
  let serverErrors = $state([]);
  let schemaChanged = $state(false);
  let touched = $state(false);

  const selected = $derived(order.filter((id) => id in picks).map((id) => files.find((file) => file.id === id)).filter(Boolean));
  const totalCopies = $derived(selected.reduce((sum, file) => sum + (Number(picks[file.id]) || 0), 0));
  const totalBytes = $derived(selected.reduce((sum, file) => sum + (file.sizeBytes ?? 0), 0));
  const visible = $derived(
    search.trim() ? files.filter((file) => file.filename.toLowerCase().includes(search.trim().toLowerCase())) : files
  );
  const parameterProblems = $derived(problemsOf(fields, parameters));
  const runtimeNumber = $derived(Number(runtime));
  const runtimeProblem = $derived(
    !limits
      ? ''
      : !Number.isInteger(runtimeNumber) || runtimeNumber < limits.minRuntime || runtimeNumber > limits.maxRuntime
        ? `Must be ${limits.minRuntime}–${limits.maxRuntime} seconds`
        : ''
  );
  const problems = $derived.by(() => {
    if (!limits) return [];
    const out = [];
    if (selected.length < limits.minItems) out.push('Pick at least one model');
    if (selected.length > limits.maxItems) out.push(`At most ${limits.maxItems} models per job`);
    const bad = selected.some((file) => {
      const copies = Number(picks[file.id]);
      return !Number.isInteger(copies) || copies < limits.minCopies || copies > limits.maxCopies;
    });
    if (bad) out.push(`Copies must be ${limits.minCopies}–${limits.maxCopies}`);
    if (totalCopies > limits.maxTotalCopies) out.push(`At most ${limits.maxTotalCopies} parts in total`);
    if (runtimeProblem) out.push(`Time limit: ${runtimeProblem.toLowerCase()}`);
    if (Object.keys(parameterProblems).length) out.push('Check the engine options');
    return out;
  });
  const allVisibleSelected = $derived(visible.length > 0 && visible.every((file) => file.id in picks));

  onMount(load);

  async function load() {
    phase = 'loading';
    loadError = '';
    schemaChanged = false;
    try {
      const schema = await loadSchema();
      limits = limitsOf(schema);
      fields = fieldsOf(schema);
      const [loadedDraft, loadedFiles] = await Promise.all([
        api.draft(ctx.id, from || undefined).catch((error) => {
          if (from && (error.status === 404 || error.status === 422 || error.status === 409)) {
            toast.warning(error.status === 404 ? 'That job no longer exists — starting from your last job' : error.message);
            return api.draft(ctx.id);
          }
          throw error;
        }),
        allFiles()
      ]);
      const state = (file) => packingOf(file, limits.acceptedFormats);
      files = loadedFiles.filter((file) => state(file) === 'packable');
      hiddenFiles = {
        reupload: loadedFiles.filter((file) => state(file) === 'reupload').map((file) => file.filename),
        unsupported: loadedFiles.filter((file) => !['packable', 'reupload'].includes(state(file))).map((file) => file.filename)
      };
      applyDraft(loadedDraft);
      phase = 'ready';
    } catch (error) {
      loadError = error.message;
      phase = 'error';
    }
  }

  async function allFiles() {
    const out = [];
    for (let page = 0; page < 10; page++) {
      const result = await api.files(ctx.id, { page, size: 100, sort: 'filename', direction: 'ASC' });
      out.push(...result.content);
      if (page >= result.totalPages - 1) break;
    }
    return out;
  }

  function applyDraft(next) {
    draft = next;
    const input = next?.input ?? {};
    const nextPicks = {};
    const nextOrder = [];
    for (const item of input.items ?? []) {
      if (!files.some((file) => file.id === item.fileId)) continue;
      nextPicks[item.fileId] = item.copies ?? limits.defaultCopies;
      nextOrder.push(item.fileId);
    }
    picks = nextPicks;
    order = [...nextOrder, ...files.map((file) => file.id).filter((id) => !nextOrder.includes(id))];
    runtime = input.maxRuntimeSeconds ?? limits.defaultRuntime;
    parameters = mergeParameters(fields, parametersOf(input.parameters));
    renamed = [];
    if (next?.sourceJobId && next.source !== 'DEFAULTS') findRenames(next);
  }

  async function findRenames(next) {
    try {
      const job = await api.job(ctx.id, next.sourceJobId);
      const before = new Map((job.input?.items ?? []).map((item) => [item.fileId, item.fileName]));
      renamed = (next.input?.items ?? [])
        .filter((item) => before.has(item.fileId) && before.get(item.fileId) && before.get(item.fileId) !== item.fileName)
        .map((item) => ({ from: before.get(item.fileId), to: item.fileName, fileId: item.fileId }));
    } catch {
      renamed = [];
    }
  }

  function startFromDefaults() {
    applyDraft({ source: 'DEFAULTS', input: { maxRuntimeSeconds: limits.defaultRuntime, parameters: defaultsOf(fields), items: [] } });
    serverErrors = [];
    submitError = '';
  }

  function toggle(file) {
    if (file.id in picks) delete picks[file.id];
    else picks[file.id] = limits.defaultCopies;
  }

  function toggleAll() {
    if (allVisibleSelected) visible.forEach((file) => delete picks[file.id]);
    else visible.forEach((file) => (picks[file.id] ??= limits.defaultCopies));
  }

  function setParameter(path, value) {
    let target = parameters;
    for (const key of path.slice(0, -1)) {
      target[key] ??= {};
      target = target[key];
    }
    target[path.at(-1)] = value;
  }

  function getParameter(path) {
    return path.reduce((value, key) => value?.[key], parameters);
  }

  function describeError(pointer, message, items) {
    const parts = pointer.split('/').filter(Boolean);
    if (parts[0] === 'items' && parts[1] != null) {
      const item = items[Number(parts[1])];
      const name = files.find((file) => file.id === item?.fileId)?.filename ?? 'model';
      return { label: `Item ${Number(parts[1]) + 1} · ${name}`, message };
    }
    if (parts[0] === 'maxRuntimeSeconds') return { label: limits.runtimeTitle, message };
    if (parts[0] === 'parameters') {
      let list = fields;
      const labels = [];
      for (const key of parts.slice(1)) {
        const field = list.find((entry) => entry.key === key);
        if (!field) break;
        labels.push(field.title);
        list = field.children ?? [];
      }
      return { label: labels.join(' · ') || 'Engine options', message };
    }
    return { label: pointer || 'Input', message };
  }

  async function submit() {
    touched = true;
    if (problems.length || submitting) return;
    submitting = true;
    submitError = '';
    serverErrors = [];
    const items = selected.map((file) => ({ fileId: file.id, copies: Number(picks[file.id]) }));
    const body = { maxRuntimeSeconds: runtimeNumber, parameters: $state.snapshot(parameters), items };
    if (draft?.input?.schemaVersion != null) body.schemaVersion = draft.input.schemaVersion;
    try {
      const job = await api.createJob(ctx.id, body);
      refreshCounts();
      toast.success(`Job ${jobLabel(job.id)} submitted — it is queued`, { label: 'View job', href: `/projects/${ctx.id}/jobs/${job.id}` });
      navigate(`/projects/${ctx.id}/jobs`);
    } catch (error) {
      if (error.status === 409 && /schema/i.test(error.message)) schemaChanged = true;
      else {
        submitError = error.status === 400 || error.status === 422 ? (error.problem?.detail ?? 'The job was not accepted') : error.message;
        serverErrors = Object.entries(error.fieldErrors ?? {}).map(([pointer, message]) => describeError(pointer, message, items));
      }
    } finally {
      submitting = false;
    }
  }

  function reloadForm() {
    resetSchema();
    load();
  }

  const sourceLabel = $derived.by(() => {
    if (!draft || draft.source === 'DEFAULTS' || !draft.sourceJobId) return '';
    const label = jobLabel(draft.sourceJobId);
    if (draft.source === 'SELECTED_JOB') return `job ${label} (Run again)`;
    if (draft.source === 'LAST_OWN_JOB') return `your last job, ${label}`;
    return `the project's last job, ${label}`;
  });

  function flatSummary(list, values, prefix = []) {
    return list.flatMap((field) =>
      field.kind === 'group' && !(field.children.length === 3 && field.children.every((child) => child.kind === 'number'))
        ? flatSummary(field.children, values?.[field.key], [...prefix, field.title])
        : [{ label: [...prefix, field.title].join(' · '), value: describeValue(field, values?.[field.key]) }]
    );
  }
</script>

<div>
  <h1 class="pk-page-title">New packing job</h1>
  <p class="pk-page-sub">{ctx.project.name}</p>
</div>

{#if !ctx.canWrite}
  <div class="pk-banner" role="status">
    <Icon name="lock" />
    <span class="pk-banner__text">
      {ctx.active ? 'You need Can edit permission to start jobs in this project.' : 'This project is archived — jobs cannot be started.'}
    </span>
    <a href="/projects/{ctx.id}/jobs" class="pk-btn">Back to jobs</a>
  </div>
{:else if phase === 'loading'}
  <div class="pk-card pk-row muted"><span class="pk-spinner"></span>Preparing the form…</div>
{:else if phase === 'error'}
  <div class="pk-banner pk-banner--danger" role="alert">
    <Icon name="alert" /><span class="pk-banner__text">{loadError}</span><button type="button" class="pk-btn" onclick={load}>Retry</button>
  </div>
{:else}
  {#if sourceLabel}
    <div class="pk-banner pk-banner--info prefill" role="status">
      <Icon name="info" />
      <div class="pk-banner__text prefill__text">
        <span>Prefilled from <b>{sourceLabel}</b>.{#if draft.omittedItems?.length || renamed.length || draft.resetFields?.length}&nbsp;Some things changed since then:{/if}</span>
        {#if draft.omittedItems?.length || renamed.length || draft.resetFields?.length}
          <ul>
            {#if draft.omittedItems?.length}
              <li>
                <b>{plural(draft.omittedItems.length, 'file')} omitted:</b>
                {draft.omittedItems.map((item) => item.fileName ?? 'unknown file').join(', ')} — deleted or no longer packable
              </li>
            {/if}
            {#if renamed.length}
              <li>
                <b>{plural(renamed.length, 'file')} renamed:</b>
                {renamed.map((entry) => `${entry.from} is now ${entry.to}`).join(', ')}
              </li>
            {/if}
            {#if draft.resetFields?.length}
              <li><b>Reset to defaults:</b> {draft.resetFields.join(', ')} — the engine no longer accepts the old values</li>
            {/if}
          </ul>
        {/if}
      </div>
      <button type="button" class="pk-btn pk-btn--ghost link-button" onclick={startFromDefaults}>Start from defaults</button>
    </div>
  {/if}

  {#if schemaChanged}
    <div class="pk-banner pk-banner--danger" role="alert">
      <Icon name="alert" />
      <span class="pk-banner__text"><b>Input schema changed.</b> Reload the form to see the current fields. Your picks are re-checked.</span>
      <button type="button" class="pk-btn" onclick={reloadForm}>Reload</button>
    </div>
  {/if}

  <div class="layout">
    <div class="main">
      <section class="pk-card models" aria-labelledby="models-h">
        <div class="models__head">
          <div>
            <h2 id="models-h" class="pk-card__title">Models</h2>
            <p class="pk-muted small">
              {limits.minItems}–{limits.maxItems} models · {limits.minCopies}–{limits.maxCopies}
              copies each, {limits.maxTotalCopies} in total
            </p>
          </div>
          <div class="meter">
            <span class="meter__text"><b>{totalCopies}</b> of {limits.maxTotalCopies} parts · {plural(selected.length, 'model')}</span>
            <span class="meter__bar" class:over={totalCopies > limits.maxTotalCopies}>
              <span style:width="{Math.min(100, (totalCopies / limits.maxTotalCopies) * 100)}%"></span>
            </span>
          </div>
        </div>
        {#if files.length > 0}
          <div class="models__search">
            <div class="pk-search">
              <Icon name="search" />
              <label for="model-search" class="sr-only">Search models</label>
              <input id="model-search" class="pk-input" type="search" placeholder="Search models by name" bind:value={search} />
            </div>
          </div>
          <div style="overflow-x: auto">
            <table class="pk-table" style="min-width: 600px">
              <thead>
                <tr>
                  <th style="width: 44px"><input type="checkbox" aria-label="Select all models" checked={allVisibleSelected} onchange={toggleAll} /></th>
                  <th>Model</th>
                  <th class="pk-num">Size</th>
                  <th>Copies</th>
                  <th><span class="sr-only">Preview</span></th>
                </tr>
              </thead>
              <tbody>
                {#each visible as file (file.id)}
                  {@const index = selected.findIndex((entry) => entry.id === file.id)}
                  {@const wasRenamed = renamed.some((entry) => entry.fileId === file.id)}
                  <tr class:is-selected={file.id in picks}>
                    <td><input type="checkbox" aria-label={file.filename} checked={file.id in picks} onchange={() => toggle(file)} /></td>
                    <td class="pk-cell-main">
                      <label class="model" for="copies-{file.id}">
                        <span class="pk-model-thumb">
                          <svg width="28" height="28" viewBox="8 0 24 28" aria-hidden="true">
                            {#each [['20,2.5 30,8.2 20,14 10,8.2', 0], ['30,19.8 20,25.5 20,14 30,8.2', 0.16], ['10,19.8 20,25.5 20,14 10,8.2', 0.3]] as [points, shade] (points)}
                              <polygon {points} fill={index >= 0 ? modelColor(index) : 'var(--neutral-soft)'} />
                              {#if shade}<polygon {points} fill="rgba(0,0,0,{shade})" />{/if}
                            {/each}
                          </svg>
                        </span>
                        <span class="model__text">
                          {file.filename}
                          {#if file.format !== 'OBJ' || wasRenamed}
                            <span class="model__meta">
                              {#if file.format !== 'OBJ'}{formatLabel(file.format)} · converted to OBJ{/if}{#if file.format !== 'OBJ' && wasRenamed}&nbsp;·&nbsp;{/if}{#if wasRenamed}<span class="renamed">renamed since {jobLabel(draft.sourceJobId)}</span>{/if}
                            </span>
                          {/if}
                        </span>
                      </label>
                    </td>
                    <td class="pk-num">{bytes(file.sizeBytes)}</td>
                    <td>
                      {#if file.id in picks}
                        <Stepper bind:value={picks[file.id]} min={limits.minCopies} max={limits.maxCopies} label="copies of {file.filename}" />
                      {:else}
                        <button type="button" class="pk-btn pk-btn--ghost add" onclick={() => toggle(file)}>Add</button>
                      {/if}
                    </td>
                    <td class="pk-cell-actions">
                      <a href="/projects/{ctx.id}/files?file={file.id}" class="pk-btn pk-btn--ghost" target="_blank" rel="noopener">Preview</a>
                    </td>
                  </tr>
                {:else}
                  <tr><td colspan="5" class="pk-table-empty">No models match “{search.trim()}”.</td></tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <div class="no-models">
            <p>
              This project has no packable models yet.
              <a href="/projects/{ctx.id}/files">Upload models or add a sample</a> first.
            </p>
          </div>
        {/if}
        {#if hiddenFiles.reupload.length > 0}
          {@render footnote(
            hiddenFiles.reupload,
            'it was uploaded before models were converted to OBJ. Upload it again to pack it.',
            'they were uploaded before models were converted to OBJ. Upload them again to pack them.'
          )}
        {/if}
        {#if hiddenFiles.unsupported.length > 0}
          {@render footnote(
            hiddenFiles.unsupported,
            'it can’t be packed. Export STEP models as STL or 3MF and upload those.',
            'they can’t be packed. Export STEP models as STL or 3MF and upload those.'
          )}
        {/if}
      </section>

      <section class="pk-card settings" aria-labelledby="settings-h">
        <h2 id="settings-h" class="pk-card__title">Settings</h2>
        <div class="pk-field narrow">
          <label class="pk-label" for="runtime">{limits.runtimeTitle}</label>
          <div class="suffixed">
            <input id="runtime" class="pk-input" class:pk-input--error={touched && runtimeProblem} inputmode="numeric" bind:value={runtime} />
            <span class="suffix">seconds</span>
          </div>
          {#if touched && runtimeProblem}<span class="pk-error"><Icon name="alert" size={14} />{runtimeProblem}</span>{/if}
          <span class="pk-hint">
            {limits.runtimeDescription || 'How long the solver searches'} · {limits.minRuntime}–{limits.maxRuntime} s{#if !runtimeProblem && runtimeNumber >= 60}&nbsp;· {runtimeNumber} s is {duration(runtimeNumber)}{/if}
          </span>
        </div>
        <div class="engine">
          <div class="pk-eyebrow">Engine options</div>
          {#if fields.length === 0}
            <p class="pk-muted small">The current engine has no options. New ones will appear here automatically.</p>
          {:else}
            <div class="engine__fields">
              {#each fields as field (field.key)}
                {@render fieldInput(field)}
              {/each}
            </div>
          {/if}
        </div>
      </section>
    </div>

    <aside class="pk-card pk-card--raised summary">
      <h2 class="pk-card__title">Summary</h2>
      <dl class="pk-dl summary__list">
        <dt>Models</dt>
        <dd>{selected.length ? `${plural(selected.length, 'file')} · ${bytes(totalBytes)}` : 'None picked'}</dd>
        <dt>Parts</dt>
        <dd>{totalCopies} of {limits.maxTotalCopies}</dd>
        <dt>Time limit</dt>
        <dd>{runtimeProblem ? '—' : limitLabel(runtimeNumber)}</dd>
        {#each flatSummary(fields, parameters) as row (row.label)}
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        {/each}
      </dl>
      <p class="pk-muted small">The job starts as Queued. The engine uses as few containers as it can; you get an email when it succeeds or fails.</p>
      {#if touched && problems.length}
        <ul class="problems">
          {#each problems as problem (problem)}<li class="pk-error"><Icon name="alert" size={14} />{problem}</li>{/each}
        </ul>
      {/if}
      {#if submitError}
        <div class="submit-error" role="alert">
          <div class="pk-banner pk-banner--danger"><Icon name="alert" /><span class="pk-banner__text">{submitError}</span></div>
          {#each serverErrors as entry (entry.label + entry.message)}
            <div class="server-error">
              <span>{entry.label}</span>
              <span class="pk-error"><Icon name="alert" size={14} />{entry.message}</span>
            </div>
          {/each}
        </div>
      {/if}
      <div class="summary__actions">
        <button type="button" class="pk-btn pk-btn--cta grow" disabled={submitting || (touched && problems.length > 0) || schemaChanged} onclick={submit}>
          {#if submitting}<span class="pk-spinner"></span>{:else}<Icon name="play" />{/if}Start job
        </button>
        <a href="/projects/{ctx.id}/jobs" class="pk-btn pk-btn--ghost">Cancel</a>
      </div>
    </aside>
  </div>
{/if}

{#snippet footnote(names, one, many)}
  <div class="footnote">
    <Icon name="info" />
    <span>
      {names.length === 1 ? '1 file isn’t listed' : `${names.length} files aren’t listed`}:
      <b>{names.slice(0, 5).join(', ')}{names.length > 5 ? '…' : ''}</b> — {names.length === 1 ? one : many}
    </span>
  </div>
{/snippet}

{#snippet fieldInput(field)}
  {#if field.kind === 'group'}
    <fieldset class="group">
      <legend class="pk-label">{field.title}</legend>
      <div class="group__fields" class:triple={field.children.length === 3 && field.children.every((child) => child.kind === 'number')}>
        {#each field.children as child (child.key)}
          {@render fieldInput(child)}
        {/each}
      </div>
      {#if field.description}<span class="pk-hint">{field.description}</span>{/if}
    </fieldset>
  {:else}
    {@const id = `param-${field.path.join('-')}`}
    {@const value = getParameter(field.path)}
    {@const problem = fieldProblem(field, value)}
    <div class="pk-field">
      {#if field.kind === 'boolean'}
        <label class="pk-check">
          <input type="checkbox" checked={!!value} onchange={(event) => setParameter(field.path, event.currentTarget.checked)} />{field.title}
        </label>
      {:else}
        <label class="pk-label" for={id}>{field.title}</label>
        {#if field.kind === 'enum'}
          <select {id} class="pk-select" value={value} onchange={(event) => setParameter(field.path, event.currentTarget.value)}>
            {#each field.options as option (option)}<option value={option}>{option}</option>{/each}
          </select>
        {:else if field.kind === 'number'}
          <input
            {id}
            class="pk-input"
            class:pk-input--error={problem}
            inputmode={field.integer ? 'numeric' : 'decimal'}
            value={value ?? ''}
            oninput={(event) => {
              const raw = event.currentTarget.value.trim();
              setParameter(field.path, raw === '' ? '' : Number.isFinite(Number(raw)) ? Number(raw) : raw);
            }}
          />
        {:else}
          <input {id} class="pk-input" value={value ?? ''} oninput={(event) => setParameter(field.path, event.currentTarget.value)} />
        {/if}
      {/if}
      {#if problem}
        <span class="pk-error"><Icon name="alert" size={14} />{problem}</span>
      {:else if field.kind === 'number' && field.path.length === 1}
        <span class="pk-hint">{[field.description, rangeHint(field)].filter(Boolean).join(' · ')}</span>
      {:else if field.kind !== 'number' && field.description}
        <span class="pk-hint">{field.description}</span>
      {/if}
    </div>
  {/if}
{/snippet}

<style>
  .muted {
    color: var(--ink-muted);
    font-size: 14px;
  }
  .small {
    font-size: 14px;
    line-height: 1.43;
  }
  .prefill {
    align-items: flex-start;
  }
  .prefill__text {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .prefill ul {
    margin: 0;
    padding-left: 18px;
    color: var(--ink-secondary);
  }
  .prefill b {
    color: var(--ink);
  }
  .link-button {
    color: var(--link);
  }
  .layout {
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    align-items: flex-start;
  }
  .main {
    flex: 999 1 520px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .models {
    padding: 0;
    overflow: hidden;
  }
  .models__head {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    padding: 20px 24px 16px;
  }
  .meter {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
  }
  .meter__text {
    font-size: 14px;
    color: var(--ink-secondary);
  }
  .meter__text b {
    color: var(--ink);
    font-weight: 600;
  }
  .meter__bar {
    width: 160px;
    height: 4px;
    border-radius: 9999px;
    background: var(--neutral-soft);
    overflow: hidden;
  }
  .meter__bar span {
    display: block;
    height: 100%;
    background: var(--primary);
  }
  .meter__bar.over span {
    background: var(--danger);
  }
  .models__search {
    padding: 0 24px 16px;
  }
  .models__search .pk-search {
    width: 320px;
    max-width: 100%;
  }
  .models__search .pk-input {
    height: 32px;
  }
  input[type='checkbox'] {
    width: 16px;
    height: 16px;
    accent-color: var(--primary);
    margin: 0;
  }
  .model {
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
  }
  .model__text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    overflow-wrap: anywhere;
  }
  .model__meta {
    font-weight: 400;
    font-size: 13px;
    color: var(--ink-muted);
  }
  .renamed {
    color: var(--link);
  }
  .add {
    height: 32px;
  }
  .no-models {
    padding: 0 24px 24px;
    font-size: 15px;
    color: var(--ink-muted);
  }
  .footnote {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 24px;
    border-top: 1px solid var(--hairline);
    background: var(--surface-sunken);
    font-size: 14px;
    color: var(--ink-muted);
  }
  .footnote b {
    color: var(--ink-secondary);
    font-weight: 500;
  }
  .settings {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .settings .pk-card__title {
    margin: 0;
  }
  .narrow {
    max-width: 320px;
  }
  .suffixed {
    position: relative;
  }
  .suffixed .pk-input {
    padding-right: 72px;
  }
  .suffix {
    position: absolute;
    right: 12px;
    top: 9px;
    font-size: 14px;
    color: var(--ink-muted);
  }
  .engine {
    padding-top: 16px;
    border-top: 1px solid var(--hairline);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .engine__fields {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 16px 20px;
  }
  .group {
    grid-column: 1 / -1;
    margin: 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .group legend {
    padding: 0;
    margin-bottom: 8px;
  }
  .group__fields {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 12px;
  }
  .group__fields.triple {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .group__fields .pk-label {
    font-weight: 400;
    color: var(--ink-muted);
  }
  .summary {
    flex: 1 1 280px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    position: sticky;
    top: 16px;
  }
  .summary .pk-card__title {
    margin: 0;
  }
  .summary__list {
    grid-template-columns: auto 1fr;
    column-gap: 16px;
    font-size: 14px;
  }
  .summary__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .grow {
    flex: 1 1 auto;
  }
  .problems {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .submit-error {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .server-error {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 14px;
  }
  @media (max-width: 560px) {
    .group__fields.triple {
      grid-template-columns: 1fr;
    }
  }
</style>
