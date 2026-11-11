<script>
  import { onMount } from 'svelte';
  import { api } from './lib/api.js';
  import { authConfigured, authMessage, onUserChanged, signIn, signInWithGoogle, signOut, signUp } from './lib/auth.js';
  import Viewer from './lib/Viewer.svelte';

  const projectName = 'Packing test bench';
  const active = ['QUEUED', 'RUNNING'];
  const triangleBudget = 3_000_000;
  const closed = { job: null, sample: null, text: null, glb: null, quality: null, loading: false, error: '' };

  let phase = $state('loading');
  let fatal = $state('');
  let user = $state(null);
  let email = $state('');
  let password = $state('');
  let authBusy = $state(false);
  let authError = $state('');
  let project = $state(null);
  let limits = $state(null);
  let files = $state([]);
  let picks = $state({});
  let runtime = $state(60);
  let engine = $state(null);
  let algorithms = $state([]);
  let uploading = $state('');
  let uploadError = $state('');
  let samples = $state([]);
  let showSamples = $state(false);
  let addingSample = $state('');
  let submitting = $state(false);
  let submitError = $state('');
  let jobs = $state([]);
  let jobsError = $state('');
  let cancelling = $state({});
  let watched = $state(null);
  let preview = $state(closed);
  let downloading = $state('');
  let bin = $state(1);
  let now = $state(Date.now());
  let pollTimer;

  const selected = $derived(files.filter((file) => file.id in picks));
  const totalCopies = $derived(selected.reduce((sum, file) => sum + (Number(picks[file.id]) || 0), 0));
  const problems = $derived(validate(selected, totalCopies, runtime, limits, engine));

  onMount(() => {
    const ticker = setInterval(() => (now = Date.now()), 1000);
    let unsubscribe;
    if (authConfigured) {
      unsubscribe = onUserChanged((next) => {
        user = next;
        if (next) start();
        else reset();
      });
    } else {
      fail('Firebase is not configured: set VITE_FIREBASE_API_KEY in .env.local, or serve it from /config.js.');
    }
    return () => {
      clearInterval(ticker);
      clearTimeout(pollTimer);
      unsubscribe?.();
    };
  });

  async function start() {
    phase = 'loading';
    try {
      await api.me();
      const [schema, found, catalogue] = await Promise.all([
        api.inputSchema(),
        api.activeProjects(projectName),
        api.samples().catch(() => [])
      ]);
      limits = limitsFrom(schema);
      samples = catalogue;
      runtime = limits.defaultRuntime;
      engine = engineDefaults(schema);
      algorithms = schema.properties.parameters?.properties?.algorithm?.enum ?? [];
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

  function reset() {
    clearTimeout(pollTimer);
    project = null;
    files = [];
    picks = {};
    showSamples = false;
    jobs = [];
    jobsError = '';
    watched = null;
    preview = closed;
    password = '';
    phase = 'signed-out';
  }

  async function authenticate(action) {
    authBusy = true;
    authError = '';
    try {
      await action(email.trim(), password);
    } catch (error) {
      authError = authMessage(error);
    } finally {
      authBusy = false;
    }
  }

  function submitLogin(event) {
    event.preventDefault();
    authenticate(signIn);
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
      defaultRuntime: time.default,
      maxSeed: schema.properties.parameters?.properties?.seed?.maximum
    };
  }

  function engineDefaults(schema) {
    const options = schema.properties.parameters?.properties ?? {};
    const container = options.container?.properties ?? {};
    return {
      width: container.width?.default,
      length: container.length?.default,
      height: container.height?.default,
      gap: options.gap?.default ?? 0,
      algorithm: options.algorithm?.default,
      seed: options.seed?.default
    };
  }

  function validate(chosen, total, seconds, limit, options) {
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
    if (options) {
      if (![options.width, options.length, options.height].every((side) => Number.isFinite(side) && side > 0)) {
        out.push('Every container side must be a positive number');
      }
      if (!Number.isFinite(options.gap) || options.gap < 0) out.push('Gap must be zero or more');
      if (!Number.isInteger(options.seed) || options.seed < 0 || (limit.maxSeed != null && options.seed > limit.maxSeed)) {
        out.push(`Seed must be a whole number from 0 to ${limit.maxSeed}`);
      }
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

  async function addSample(sample) {
    addingSample = sample.id;
    uploadError = '';
    try {
      const stored = await api.addSample(project.id, sample.id);
      picks[stored.id] = 1;
    } catch (error) {
      uploadError = `${sample.name}: ${error.message}`;
    } finally {
      addingSample = '';
    }
    await loadFiles().catch((error) => (uploadError = error.message));
  }

  async function previewSample(sample) {
    preview = { ...closed, sample, loading: true };
    try {
      const text = await api.sampleText(sample.id);
      if (preview.sample?.id !== sample.id) return;
      preview = { ...closed, sample, text };
    } catch (error) {
      if (preview.sample?.id === sample.id) preview = { ...preview, loading: false, error: error.message };
    }
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
        parameters: {
          container: { width: engine.width, length: engine.length, height: engine.height },
          gap: engine.gap,
          algorithm: engine.algorithm,
          seed: engine.seed
        },
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
      const opened = jobs.find((job) => job.id === preview.job?.id);
      if (opened && waitingForPreview(preview.job) && opened.preview?.status !== 'PENDING' && !preview.text && !preview.loading) {
        open(opened);
      }
    } catch (error) {
      jobsError = error.message;
    }
    if (jobsError || jobs.some((job) => active.includes(job.status) || waitingForPreview(job))) {
      pollTimer = setTimeout(refreshJobs, jobsError ? 5000 : 2000);
    }
  }

  const waitingForPreview = (job) => job?.status === 'SUCCEEDED' && job.preview?.status === 'PENDING';

  const previewModels = (job) => (job?.preview?.status === 'READY' ? job.preview.models : []);

  function defaultQuality(models) {
    const fitting = models.filter((model) => model.triangles <= triangleBudget);
    return (fitting.at(-1) ?? models[0]).quality;
  }

  async function open(job) {
    bin = 1;
    const models = previewModels(job);
    if (models.length > 0) {
      const target = defaultQuality(models);
      if (models[0].quality !== target) await showPreview(job, models[0].quality);
      if (preview.job?.id === job.id && !preview.error) await showPreview(job, target);
    } else if (waitingForPreview(job)) {
      preview = { ...closed, job };
    } else {
      await showFull(job);
    }
  }

  async function showPreview(job, quality) {
    const glb = preview.job?.id === job.id ? preview.glb : null;
    preview = { ...closed, job, glb, quality, loading: true };
    try {
      const loaded = await api.preview(project.id, job.id, quality);
      if (preview.job?.id !== job.id || preview.quality !== quality) return;
      preview = { ...closed, job, glb: loaded, quality };
    } catch (error) {
      if (preview.job?.id === job.id) preview = { ...preview, loading: false, error: error.message };
    }
  }

  async function showFull(job) {
    preview = { ...closed, job, loading: true };
    try {
      const text = await (await api.result(project.id, job.id)).text();
      if (preview.job?.id !== job.id || preview.quality) return;
      preview = { ...closed, job, text };
    } catch (error) {
      if (preview.job?.id === job.id) preview = { ...preview, loading: false, error: error.message };
    }
  }

  async function download(job, quality) {
    downloading = quality ?? 'OBJ';
    try {
      const blob = quality
        ? new Blob([await api.preview(project.id, job.id, quality)], { type: 'model/gltf-binary' })
        : await api.result(project.id, job.id);
      save(blob, quality ? `packing-job-${job.id}-${quality.toLowerCase()}.glb` : (job.resultFileName ?? 'packed.obj'));
    } catch (error) {
      preview = { ...preview, error: error.message };
    } finally {
      downloading = '';
    }
  }

  async function downloadBin(job, number) {
    downloading = `bin-${number}`;
    try {
      save(await api.resultBin(project.id, job.id, number), `packing-job-${job.id}-bin-${String(number).padStart(3, '0')}.obj`);
    } catch (error) {
      preview = { ...preview, error: error.message };
    } finally {
      downloading = '';
    }
  }

  function save(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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

  const triangles = (count) => (count >= 1_000_000 ? `${(count / 1_000_000).toFixed(1)}M` : `${Math.round(count / 1000)}k`);

  const clock = (instant) => new Date(instant).toLocaleTimeString();

  const itemsOf = (job) => job.input?.items.map((item) => `${item.fileName ?? 'file'} ×${item.copies}`).join(', ') ?? '';

  function containerOf(job) {
    const side = job.input?.parameters?.container;
    return side ? `${side.width} × ${side.length} × ${side.height}` : '';
  }

  const boxes = (count) => `${count} ${count === 1 ? 'container' : 'containers'}`;
</script>

<main>
  <aside>
    <header>
      <h1>Packing test bench</h1>
      {#if user}
        <div class="row">
          <small>{user.email}</small>
          <button class="link" onclick={signOut}>Sign out</button>
        </div>
      {/if}
    </header>

    {#if phase === 'loading'}
      <p class="muted">Connecting…</p>
    {:else if phase === 'signed-out'}
      <form class="login" onsubmit={submitLogin}>
        <input type="email" placeholder="Email" autocomplete="username" required bind:value={email} />
        <input type="password" placeholder="Password" autocomplete="current-password" required bind:value={password} />
        <div class="row">
          <button type="submit" disabled={authBusy}>Sign in</button>
          <button type="button" class="link" disabled={authBusy} onclick={() => authenticate(signUp)}>Create account</button>
        </div>
        <button type="button" class="google" disabled={authBusy} onclick={() => authenticate(signInWithGoogle)}>Continue with Google</button>
        {#if authError}<p class="error">{authError}</p>{/if}
      </form>
    {:else if phase === 'error'}
      <p class="error">{fatal}</p>
    {:else}
      <section>
        <div class="row">
          <h2>Models</h2>
          <span class="row">
            {#if samples.length > 0 && files.length > 0}
              <button class="link" onclick={() => (showSamples = !showSamples)}>
                {showSamples ? 'Hide samples' : 'Samples'}
              </button>
            {/if}
            <label class="button" class:disabled={uploading}>
              Add .obj files
              <input type="file" accept=".obj" multiple hidden disabled={!!uploading} onchange={addFiles} />
            </label>
          </span>
        </div>
        {#if uploading}<p class="muted">{uploading}</p>{/if}
        {#if uploadError}<p class="error">{uploadError}</p>{/if}
        {#if samples.length > 0 && (showSamples || files.length === 0)}
          {#if files.length === 0}
            <p class="muted">No models in the project yet. Start with a sample:</p>
          {/if}
          <ul class="samples">
            {#each samples as sample (sample.id)}
              <li class:current={preview.sample?.id === sample.id}>
                <button class="sample" onclick={() => previewSample(sample)} title="Preview {sample.name}">
                  <span class="row">
                    <span>{sample.name}</span>
                    <span class="muted">{size(sample.sizeBytes)}</span>
                  </span>
                  <span class="muted">{sample.description}</span>
                </button>
                <button class="add" disabled={!!addingSample} onclick={() => addSample(sample)}>
                  {addingSample === sample.id ? 'Adding…' : 'Add'}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        {#if files.length === 0}
          {#if samples.length === 0}<p class="muted">No models in the project yet.</p>{/if}
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
        <div class="row">
          <span>Container</span>
          <span class="sides">
            <input type="number" min="0" step="any" title="Width (X)" bind:value={engine.width} />
            ×
            <input type="number" min="0" step="any" title="Length (Y)" bind:value={engine.length} />
            ×
            <input type="number" min="0" step="any" title="Height (Z)" bind:value={engine.height} />
          </span>
        </div>
        <label class="row">
          <span>Gap</span>
          <input type="number" min="0" step="any" bind:value={engine.gap} />
        </label>
        <label class="row">
          <span>Algorithm</span>
          <select bind:value={engine.algorithm}>
            {#each algorithms as algorithm}<option value={algorithm}>{algorithm}</option>{/each}
          </select>
        </label>
        <label class="row">
          <span>Seed</span>
          <input type="number" min="0" max={limits.maxSeed} step="1" bind:value={engine.seed} />
        </label>
        <p class="muted">
          Container size and gap use the models' own units. The engine fills as few containers as it can; the samples are
          about 0.1–2 units across.
        </p>
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
                {#if containerOf(job)}
                  <span class="muted">
                    container {containerOf(job)}
                    {#if job.resultBins?.length}· {boxes(job.resultBins.length)}{/if}
                  </span>
                {/if}
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
    <Viewer
      text={preview.text}
      glb={preview.glb}
      subject={preview.job?.id ?? preview.sample?.id}
      onerror={(error) => (preview = { ...preview, loading: false, error: error.message })}
    />
    <div class="overlay">
      {#if preview.job}
        {@const models = previewModels(preview.job)}
        {#if models.length > 0}
          <div class="qualities">
            {#each models as model (model.quality)}
              <button
                class:current={preview.quality === model.quality}
                disabled={preview.loading}
                title="{triangles(model.triangles)} triangles · {size(model.sizeBytes)}"
                onclick={() => showPreview(preview.job, model.quality)}
              >
                {model.quality.toLowerCase()} · {triangles(model.triangles)}
              </button>
            {/each}
          </div>
        {:else if waitingForPreview(preview.job) && !preview.text && !preview.loading}
          <span class="muted">Preparing a lighter preview…</span>
          <button class="link" onclick={() => showFull(preview.job)}>
            Load the full result ({size(preview.job.resultSizeBytes)}) instead
          </button>
        {/if}
        {#if preview.loading}
          <span>Loading {preview.quality ? `${preview.quality.toLowerCase()} preview` : 'full result'}…</span>
        {/if}
        {#if preview.error}<span class="error">{preview.error}</span>{/if}
        <div class="downloads">
          <button disabled={!!downloading} onclick={() => download(preview.job, null)}>
            {downloading === 'OBJ' ? 'Downloading…' : `Download OBJ (${size(preview.job.resultSizeBytes)})`}
          </button>
          {#if preview.quality}
            <button disabled={!!downloading} onclick={() => download(preview.job, preview.quality)}>
              {downloading === preview.quality ? 'Downloading…' : `Download ${preview.quality.toLowerCase()} GLB`}
            </button>
          {/if}
        </div>
        {#if preview.job.resultBins?.length > 1}
          {@const bins = preview.job.resultBins}
          <div class="downloads">
            <span class="muted">{boxes(bins.length)}, shown side by side</span>
            <select bind:value={bin}>
              {#each bins as entry (entry.number)}
                <option value={entry.number}>Container {entry.number} · {size(entry.sizeBytes)}</option>
              {/each}
            </select>
            <button disabled={!!downloading} onclick={() => downloadBin(preview.job, bin)}>
              {downloading === `bin-${bin}` ? 'Downloading…' : 'Download OBJ'}
            </button>
          </div>
        {/if}
      {:else if preview.sample}
        <span>Sample: {preview.sample.name}</span>
        {#if preview.loading}<span>Loading sample…</span>{/if}
        {#if preview.error}<span class="error">{preview.error}</span>{/if}
        <button disabled={!!addingSample} onclick={() => addSample(preview.sample)}>
          {addingSample === preview.sample.id ? 'Adding…' : 'Add to project'}
        </button>
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
  .login {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  button.google {
    background: #f8fafc;
    color: #0f172a;
  }
  input[type='email'],
  input[type='password'] {
    padding: 0.45rem;
    border: 1px solid #334155;
    border-radius: 4px;
    background: #0f172a;
    color: inherit;
    font: inherit;
  }
  select {
    padding: 0.3rem;
    border: 1px solid #334155;
    border-radius: 4px;
    background: #0f172a;
    color: inherit;
    font: inherit;
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
  .sides {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .sides input {
    width: 4.2rem;
  }
  .samples li {
    display: flex;
    align-items: stretch;
    gap: 0.25rem;
  }
  .sample {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    flex: 1;
    min-width: 0;
    padding: 0.45rem 0.5rem;
    border: 1px solid #1e293b;
    background: #0f172a;
    color: inherit;
    text-align: left;
  }
  .samples li.current .sample {
    border-color: #3b82f6;
  }
  .add {
    padding: 0.3rem 0.7rem;
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
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.4rem;
    padding: 0.4rem 0.7rem;
    border-radius: 6px;
    background: rgb(15 23 42 / 0.8);
  }
  .qualities,
  .downloads {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  .qualities button.current {
    outline: 2px solid #94a3b8;
  }
</style>
