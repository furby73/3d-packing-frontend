<script>
  import { onMount } from 'svelte';
  import { api } from './lib/api.js';
  import { authConfigured } from './lib/auth.js';
  import Viewer from './lib/Viewer.svelte';

  const projectName = 'Packing test bench';
  const active = ['QUEUED', 'RUNNING'];

  let phase = $state('loading');
  let fatal = $state('');
  let me = $state(null);
  let project = $state(null);
  let limits = $state(null);
  let files = $state([]);
  let picks = $state({});
  let runtime = $state(60);
  let uploading = $state('');
  let uploadError = $state('');
  let submitting = $state(false);
  let submitError = $state('');
  let jobs = $state([]);
  let jobsError = $state('');
  let cancelling = $state({});
  let watched = $state(null);
  let preview = $state({ job: null, text: null, url: null, loading: false, error: '' });
  let now = $state(Date.now());
  let pollTimer;

  const selected = $derived(files.filter((file) => file.id in picks));
  const totalCopies = $derived(selected.reduce((sum, file) => sum + (Number(picks[file.id]) || 0), 0));
  const problems = $derived(validate(selected, totalCopies, runtime, limits));

  onMount(() => {
    const ticker = setInterval(() => (now = Date.now()), 1000);
    start();
    return () => {
      clearInterval(ticker);
      clearTimeout(pollTimer);
    };
  });

  async function start() {
    if (!authConfigured) {
      fail('Set VITE_FIREBASE_API_KEY + VITE_FIREBASE_REFRESH_TOKEN, or VITE_FIREBASE_ID_TOKEN, in .env.local, then rebuild.');
      return;
    }
    try {
      me = await api.me();
      const [schema, found] = await Promise.all([api.inputSchema(), api.activeProjects(projectName)]);
      limits = limitsFrom(schema);
      runtime = limits.defaultRuntime;
      project =
        found.content.find((p) => p.name === projectName && p.myPermission !== 'READ') ??
        (await api.createProject(projectName));
      await Promise.all([loadFiles(), refreshJobs()]);
      phase = 'ready';
    } catch (error) {
      fail(error.message);
    }
  }

  function fail(message) {
    fatal = message;
    phase = 'error';
  }

  function limitsFrom(schema) {
    const items = schema.properties.items;
    const copies = items.items.properties.copies;
    const time = schema.properties.maxRuntimeSeconds;
    return {
      maxItems: items.maxItems,
      maxTotalCopies: items['x-maxTotalCopies'],
      minCopies: copies.minimum,
      maxCopies: copies.maximum,
      minRuntime: time.minimum,
      maxRuntime: time.maximum,
      defaultRuntime: time.default
    };
  }

  function validate(chosen, total, seconds, limit) {
    if (!limit) return [];
    const out = [];
    if (chosen.length === 0) out.push('Pick at least one model');
    if (chosen.length > limit.maxItems) out.push(`At most ${limit.maxItems} models per job`);
    const badCopies = chosen.some((file) => {
      const copies = Number(picks[file.id]);
      return !Number.isInteger(copies) || copies < limit.minCopies || copies > limit.maxCopies;
    });
    if (badCopies) out.push(`Copies must be ${limit.minCopies}–${limit.maxCopies}`);
    if (total > limit.maxTotalCopies) out.push(`At most ${limit.maxTotalCopies} objects in total`);
    if (!Number.isInteger(seconds) || seconds < limit.minRuntime || seconds > limit.maxRuntime) {
      out.push(`Time limit must be ${limit.minRuntime}–${limit.maxRuntime} s`);
    }
    return out;
  }

  async function loadFiles() {
    files = (await api.objFiles(project.id)).content;
  }

  async function addFiles(event) {
    const chosen = [...event.currentTarget.files];
    event.currentTarget.value = '';
    uploadError = '';
    for (const [index, file] of chosen.entries()) {
      uploading = `Uploading ${index + 1}/${chosen.length}: ${file.name}`;
      try {
        const stored = await api.upload(project.id, file);
        picks[stored.id] = 1;
      } catch (error) {
        uploadError = `${file.name}: ${error.message}`;
        break;
      }
    }
    uploading = '';
    await loadFiles().catch((error) => (uploadError = error.message));
  }

  function toggle(file) {
    if (file.id in picks) delete picks[file.id];
    else picks[file.id] = 1;
  }

  async function submit() {
    submitting = true;
    submitError = '';
    try {
      const job = await api.createJob(project.id, {
        maxRuntimeSeconds: runtime,
        parameters: {},
        items: selected.map((file) => ({ fileId: file.id, copies: Number(picks[file.id]) }))
      });
      watched = job.id;
      await refreshJobs();
    } catch (error) {
      submitError = error.message;
    } finally {
      submitting = false;
    }
  }

  async function cancel(job) {
    cancelling[job.id] = true;
    try {
      await api.cancelJob(project.id, job.id);
      if (watched === job.id) watched = null;
    } catch (error) {
      jobsError = error.message;
    } finally {
      delete cancelling[job.id];
    }
    await refreshJobs();
  }

  async function refreshJobs() {
    clearTimeout(pollTimer);
    try {
      jobs = (await api.jobs(project.id)).content;
      jobsError = '';
      const finished = jobs.find((job) => job.id === watched && !active.includes(job.status));
      if (finished) {
        watched = null;
        if (finished.status === 'SUCCEEDED') open(finished);
      }
    } catch (error) {
      jobsError = error.message;
    }
    if (jobsError || jobs.some((job) => active.includes(job.status))) {
      pollTimer = setTimeout(refreshJobs, jobsError ? 5000 : 2000);
    }
  }

  async function open(job) {
    if (preview.url) URL.revokeObjectURL(preview.url);
    preview = { job, text: null, url: null, loading: true, error: '' };
    try {
      const blob = await api.result(project.id, job.id);
      const text = await blob.text();
      if (preview.job?.id !== job.id) return;
      preview = { job, text, url: URL.createObjectURL(blob), loading: false, error: '' };
    } catch (error) {
      if (preview.job?.id === job.id) preview = { ...preview, loading: false, error: error.message };
    }
  }

  const elapsed = (from, to) => (from ? ((to ? Date.parse(to) : now) - Date.parse(from)) / 1000 : null);

  function duration(seconds) {
    if (seconds == null) return '—';
    if (seconds < 120) return `${seconds.toFixed(1)} s`;
    return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
  }

  function size(bytes) {
    if (bytes == null) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  const clock = (instant) => new Date(instant).toLocaleTimeString();

  const itemsOf = (job) => job.input?.items.map((item) => `${item.fileName ?? 'file'} ×${item.copies}`).join(', ') ?? '';
</script>

<main>
  <aside>
    <header>
      <h1>Packing test bench</h1>
      {#if me}<small>{me.email ?? me.username ?? me.id}</small>{/if}
    </header>

    {#if phase === 'loading'}
      <p class="muted">Connecting…</p>
    {:else if phase === 'error'}
      <p class="error">{fatal}</p>
    {:else}
      <section>
        <div class="row">
          <h2>Models</h2>
          <label class="button" class:disabled={uploading}>
            Add .obj files
            <input type="file" accept=".obj" multiple hidden disabled={!!uploading} onchange={addFiles} />
          </label>
        </div>
        {#if uploading}<p class="muted">{uploading}</p>{/if}
        {#if uploadError}<p class="error">{uploadError}</p>{/if}
        {#if files.length === 0}
          <p class="muted">No models in the project yet.</p>
        {:else}
          <ul class="files">
            {#each files as file (file.id)}
              <li class:picked={file.id in picks}>
                <label>
                  <input type="checkbox" checked={file.id in picks} onchange={() => toggle(file)} />
                  <span class="name" title={file.filename}>{file.filename}</span>
                  <span class="muted">{size(file.sizeBytes)}</span>
                </label>
                {#if file.id in picks}
                  <input
                    class="copies"
                    type="number"
                    min={limits.minCopies}
                    max={limits.maxCopies}
                    bind:value={picks[file.id]}
                    title="Copies"
                  />
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section>
        <h2>Run</h2>
        <label class="row">
          <span>Time limit</span>
          <span>
            <input class="runtime" type="number" min={limits.minRuntime} max={limits.maxRuntime} bind:value={runtime} /> s
          </span>
        </label>
        <p class="muted">
          {selected.length} models · {totalCopies}/{limits.maxTotalCopies} objects. Large inputs overrun the limit while
          the engine loads them.
        </p>
        <button disabled={submitting || problems.length > 0} onclick={submit}>
          {submitting ? 'Submitting…' : 'Submit packing job'}
        </button>
        {#each problems as problem}<p class="muted">{problem}</p>{/each}
        {#if submitError}<p class="error">{submitError}</p>{/if}
      </section>

      <section class="jobs">
        <div class="row">
          <h2>Jobs</h2>
          <button class="link" onclick={refreshJobs}>Refresh</button>
        </div>
        {#if jobsError}<p class="error">{jobsError}</p>{/if}
        {#if jobs.length === 0}
          <p class="muted">No jobs yet.</p>
        {/if}
        <ul>
          {#each jobs as job (job.id)}
            {@const limit = job.input?.maxRuntimeSeconds}
            {@const run = elapsed(job.startedAt, job.finishedAt)}
            <li class:current={preview.job?.id === job.id}>
              <button class="job" disabled={job.status !== 'SUCCEEDED'} onclick={() => open(job)}>
                <span class="row">
                  <span class="status {job.status.toLowerCase()}">{job.status}</span>
                  <span class="muted">{clock(job.createdAt)}</span>
                </span>
                <span class="items">{itemsOf(job)}</span>
                <span class="muted">
                  queue {duration(elapsed(job.createdAt, job.startedAt ?? job.finishedAt))} · run {duration(run)} / {limit} s
                  {#if run != null && limit && run > limit}<strong>(+{(run - limit).toFixed(1)} s)</strong>{/if}
                  {#if job.engineVersion}· {job.engineVersion}{/if}
                  {#if job.resultSizeBytes}· {size(job.resultSizeBytes)}{/if}
                </span>
                {#if job.failureReason}<span class="error">{job.failureReason}</span>{/if}
              </button>
              {#if active.includes(job.status)}
                <button class="cancel" disabled={cancelling[job.id]} onclick={() => cancel(job)}>
                  {cancelling[job.id] ? 'Cancelling…' : 'Cancel'}
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </aside>

  <div class="stage">
    <Viewer text={preview.text} />
    <div class="overlay">
      {#if preview.loading}
        <span>Loading result…</span>
      {:else if preview.error}
        <span class="error">{preview.error}</span>
      {:else if preview.url}
        <a class="button" href={preview.url} download={preview.job.resultFileName ?? 'packed.obj'}>
          Download {preview.job.resultFileName ?? 'packed.obj'}
        </a>
      {:else}
        <span class="muted">Pick a finished job to preview its result.</span>
      {/if}
    </div>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: system-ui, sans-serif;
    font-size: 14px;
    background: #0f172a;
    color: #e2e8f0;
  }
  :global(*) {
    box-sizing: border-box;
  }
  main {
    display: grid;
    grid-template-columns: 380px 1fr;
    height: 100vh;
  }
  aside {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    overflow-y: auto;
    border-right: 1px solid #1e293b;
    background: #111827;
  }
  header {
    display: flex;
    flex-direction: column;
  }
  h1 {
    margin: 0;
    font-size: 1.2rem;
  }
  h2 {
    margin: 0;
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #94a3b8;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  p {
    margin: 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .muted {
    color: #94a3b8;
  }
  .error {
    color: #f87171;
    overflow-wrap: anywhere;
  }
  button,
  .button {
    padding: 0.45rem 0.8rem;
    border: 0;
    border-radius: 6px;
    background: #3b82f6;
    color: white;
    font: inherit;
    cursor: pointer;
    text-decoration: none;
  }
  button:disabled,
  .button.disabled {
    background: #334155;
    color: #94a3b8;
    cursor: default;
  }
  button.link {
    padding: 0;
    background: none;
    color: #60a5fa;
  }
  input[type='number'] {
    width: 5rem;
    padding: 0.3rem;
    border: 1px solid #334155;
    border-radius: 4px;
    background: #0f172a;
    color: inherit;
    font: inherit;
  }
  .files li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.3rem 0.4rem;
    border-radius: 4px;
  }
  .files li.picked {
    background: #1e293b;
  }
  .files label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    cursor: pointer;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .copies {
    width: 4rem;
  }
  .jobs li {
    display: flex;
    align-items: flex-start;
    gap: 0.25rem;
  }
  .cancel {
    padding: 0.3rem 0.55rem;
    background: #7f1d1d;
    font-size: 0.8rem;
  }
  .job {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    flex: 1;
    min-width: 0;
    padding: 0.5rem;
    border: 1px solid #1e293b;
    background: #0f172a;
    color: inherit;
    text-align: left;
  }
  .job:disabled {
    background: #0f172a;
    color: inherit;
  }
  li.current .job {
    border-color: #3b82f6;
  }
  .items {
    overflow-wrap: anywhere;
  }
  .status {
    font-weight: 600;
    font-size: 0.8rem;
  }
  .status.queued {
    color: #facc15;
  }
  .status.running {
    color: #38bdf8;
  }
  .status.succeeded {
    color: #4ade80;
  }
  .status.failed {
    color: #f87171;
  }
  .status.cancelled {
    color: #94a3b8;
  }
  .stage {
    position: relative;
    min-width: 0;
  }
  .overlay {
    position: absolute;
    top: 1rem;
    right: 1rem;
    padding: 0.4rem 0.7rem;
    border-radius: 6px;
    background: rgb(15 23 42 / 0.8);
  }
</style>
