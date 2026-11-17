<script lang="ts">
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { api, errorMessage, saveBlob } from '#lib/api/client.ts';
	import type { PackingJob, PreviewModel, PreviewQuality } from '#lib/api/types.ts';
	import Breadcrumbs from '#lib/components/Breadcrumbs.svelte';
	import ErrorBanner from '#lib/components/ErrorBanner.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import Viewer, { type Container } from '#lib/components/Viewer.svelte';
	import {
		bytes,
		clock,
		duration,
		isActive,
		jobDuration,
		secondsBetween,
		totalCopies,
		when
	} from '#lib/format.ts';
	import { useProject } from '#lib/project.svelte.ts';
	import { runLabel, runNumber } from '#lib/runs.ts';

	const ctx = useProject();
	const project = $derived(ctx.project!);
	const jobId = $derived(page.params.jobId!);

	let job = $state<PackingJob | null>(null);
	let number = $state<number | undefined>();
	let error = $state('');
	let actionError = $state('');
	let now = $state(Date.now());
	let cancelling = $state(false);
	let downloading = $state('');

	// Result preview
	let bin = $state(1);
	let glb = $state<ArrayBuffer | null>(null);
	let previewStatus = $state('');
	let loadedPreview = '';

	let poll: ReturnType<typeof setTimeout> | undefined;

	async function load() {
		clearTimeout(poll);
		try {
			const next = await api.job(project.id, jobId);
			if (next.id !== jobId) return;
			job = next;
			error = '';
			number ??= await runNumber(project.id, next);
			const waiting =
				isActive(next.status) || (next.status === 'SUCCEEDED' && next.preview.status === 'PENDING');
			if (waiting) poll = setTimeout(load, 2000);
		} catch (e) {
			error = errorMessage(e);
			poll = setTimeout(load, 5000);
		}
	}

	$effect(() => {
		void jobId;
		untrack(() => {
			job = null;
			number = undefined;
			glb = null;
			loadedPreview = '';
			bin = 1;
			load();
		});
		return () => clearTimeout(poll);
	});

	$effect(() => {
		const ticker = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(ticker);
	});

	const crumbs = $derived([
		{ label: 'Projects', href: '/' },
		{ label: project.name, href: `/projects/${project.id}` },
		{ label: 'Runs', href: `/projects/${project.id}/runs` },
		{ label: runLabel(number) }
	]);

	const limit = $derived(job?.input?.maxRuntimeSeconds ?? 0);
	const elapsed = $derived(
		job?.status === 'RUNNING' ? (secondsBetween(job.startedAt, null, now) ?? 0) : 0
	);
	const progress = $derived(limit ? Math.min(1, elapsed / limit) : 0);

	const container = $derived.by((): Container | null => {
		const c = (job?.input?.parameters as { container?: Partial<Container> } | undefined)?.container;
		return c?.width && c.length && c.height
			? { width: c.width, length: c.length, height: c.height }
			: null;
	});

	const bins = $derived(job?.resultBins ?? []);

	// Pick the best preview that keeps the page light: MEDIUM, else LOW, else HIGH.
	const choose = (models: PreviewModel[]): PreviewQuality | null =>
		(['MEDIUM', 'LOW', 'HIGH'] as const).find((q) => models.some((m) => m.quality === q)) ?? null;

	$effect(() => {
		if (!job || job.status !== 'SUCCEEDED') return;
		if (job.preview.status === 'PENDING' || job.preview.status === 'NONE') {
			previewStatus = 'Preparing the 3D preview…';
			return;
		}
		if (job.preview.status === 'FAILED') {
			previewStatus = 'The 3D preview could not be built. You can still download the result.';
			return;
		}
		const multi = bins.length > 1;
		const quality = choose(multi ? (bins[bin - 1]?.previews ?? []) : job.preview.models);
		if (!quality) {
			previewStatus = 'No preview available.';
			return;
		}
		const key = `${job.id}:${multi ? bin : 0}:${quality}`;
		if (key === loadedPreview) return;
		loadedPreview = key;
		previewStatus = 'Loading the 3D preview…';
		const jobRef = job;
		(multi
			? api.binPreview(project.id, jobRef.id, bin, quality)
			: api.preview(project.id, jobRef.id, quality)
		)
			.then((buffer) => {
				if (loadedPreview !== key) return;
				glb = buffer;
				previewStatus = '';
			})
			.catch((e) => {
				if (loadedPreview !== key) return;
				loadedPreview = '';
				previewStatus = errorMessage(e);
			});
	});

	async function cancel() {
		if (!job) return;
		cancelling = true;
		actionError = '';
		try {
			job = await api.cancelJob(project.id, job.id);
		} catch (e) {
			actionError = errorMessage(e);
		} finally {
			cancelling = false;
		}
	}

	async function downloadResult() {
		if (!job) return;
		downloading = 'all';
		actionError = '';
		try {
			saveBlob(await api.result(project.id, job.id), job.resultFileName ?? 'packed.obj');
		} catch (e) {
			actionError = errorMessage(e);
		} finally {
			downloading = '';
		}
	}

	async function downloadBin(numberOfBin: number) {
		if (!job) return;
		downloading = `bin-${numberOfBin}`;
		actionError = '';
		try {
			const base = (job.resultFileName ?? 'packed.obj').replace(/\.obj$/i, '');
			saveBlob(
				await api.resultBin(project.id, job.id, numberOfBin),
				`${base}-container-${numberOfBin}.obj`
			);
		} catch (e) {
			actionError = errorMessage(e);
		} finally {
			downloading = '';
		}
	}

	const failureTips = [
		'Remove the model named in the message, or scale it down and upload it again.',
		'Lower the number of copies.',
		'Run again. Some failures are temporary.'
	];
</script>

<svelte:head><title>{runLabel(number)} · {project.name}</title></svelte:head>

{#if !job}
	<div class="page narrow">
		<Breadcrumbs items={crumbs} />
		{#if error}<ErrorBanner message={error} onretry={load} />{/if}
	</div>
{:else if isActive(job.status)}
	<!-- 5. Job in progress -->
	<div class="page narrow">
		<Breadcrumbs items={crumbs} />
		<div class="title-row">
			<h1>{job.status === 'QUEUED' ? 'Waiting to start' : 'Packing in progress'}</h1>
			<StatusBadge status={job.status} />
		</div>

		<section class="card progress">
			<p class="muted">
				{job.status === 'QUEUED'
					? 'The run is queued and starts as soon as the engine is free.'
					: elapsed >= limit
						? 'Time limit reached. The engine is saving its best layout.'
						: 'The engine is searching for a tight layout.'}
			</p>
			<div class="bar-label">
				<span class="tiny muted">Time used</span>
				<span class="mono small">{Math.min(elapsed, limit)} s of {limit} s</span>
			</div>
			<div
				class="bar"
				role="progressbar"
				aria-valuemin={0}
				aria-valuemax={limit}
				aria-valuenow={elapsed}
			>
				<span style:width="{progress * 100}%"></span>
			</div>
			<div class="stats">
				<div class="stat">
					<span class="tiny muted">Models</span><span class="value"
						>{job.input?.items.length ?? '–'}</span
					>
				</div>
				<div class="stat">
					<span class="tiny muted">Total copies</span><span class="value"
						>{totalCopies(job.input)}</span
					>
				</div>
				<div class="stat">
					<span class="tiny muted">{job.startedAt ? 'Started' : 'Queued'}</span>
					<span class="value mono">{clock(job.startedAt ?? job.createdAt)}</span>
				</div>
			</div>
			<div class="actions">
				<a class="btn" href="/projects/{project.id}/runs">Back to runs</a>
				<span class="small muted">You can leave this page. The run keeps going.</span>
				<span class="spacer"></span>
				{#if ctx.editable}
					<button class="link-btn danger" disabled={cancelling} onclick={cancel}>
						{cancelling ? 'Cancelling…' : 'Cancel run'}
					</button>
				{/if}
			</div>
		</section>
		{#if actionError}<ErrorBanner message={actionError} />{/if}
		<p class="tiny muted">
			The engine does not report progress, so the bar shows time used against your time limit. It
			can finish earlier.
		</p>
	</div>
{:else if job.status === 'SUCCEEDED'}
	<!-- 6. Job result -->
	<div class="page">
		<Breadcrumbs items={crumbs} />
		<div class="page-header">
			<div class="title-row">
				<h1>{runLabel(number)}</h1>
				<StatusBadge status={job.status} />
			</div>
			<div class="header-actions">
				{#if ctx.editable}
					<a class="btn primary-outline" href="/projects/{project.id}/jobs/new?from={job.id}">
						Run again
					</a>
				{/if}
				<button class="btn primary" disabled={downloading !== ''} onclick={downloadResult}>
					{downloading === 'all' ? 'Downloading…' : 'Download result'}
				</button>
			</div>
		</div>
		{#if actionError}<ErrorBanner message={actionError} />{/if}

		<div class="result">
			<div class="scene card">
				{#if bins.length > 1}
					<div class="bin-tabs" role="tablist" aria-label="Containers">
						{#each bins as b (b.number)}
							<button
								role="tab"
								aria-selected={bin === b.number}
								class:active={bin === b.number}
								onclick={() => (bin = b.number)}
							>
								Container {b.number}
							</button>
						{/each}
					</div>
				{/if}
				<Viewer
					{glb}
					{container}
					status={previewStatus}
					onerror={(e) => (previewStatus = errorMessage(e))}
				/>
			</div>

			<aside class="sidebar">
				<section class="card panel">
					<h2>Result</h2>
					<div class="kv"><span>File</span><span>{job.resultFileName ?? '–'}</span></div>
					<div class="kv"><span>Size</span><span>{bytes(job.resultSizeBytes)}</span></div>
					<div class="kv"><span>Finished</span><span>{clock(job.finishedAt, true)}</span></div>
					<div class="kv"><span>Duration</span><span>{duration(jobDuration(job))}</span></div>
					<div class="kv"><span>Engine</span><span>{job.engineVersion ?? '–'}</span></div>
					{#if bins.length > 1}
						<div class="kv"><span>Containers</span><span>{bins.length}</span></div>
					{/if}
				</section>

				{#if bins.length > 1}
					<section class="card panel">
						<h2>Containers</h2>
						<p class="tiny muted">
							Not everything fit into one build volume. Each container is a separate print.
						</p>
						{#each bins as b (b.number)}
							<div class="kv bin-row">
								<span>Container {b.number}</span>
								<button
									class="link-btn accent"
									disabled={downloading !== ''}
									onclick={() => downloadBin(b.number)}
								>
									{downloading === `bin-${b.number}`
										? 'Downloading…'
										: `Download · ${bytes(b.sizeBytes)}`}
								</button>
							</div>
						{/each}
					</section>
				{/if}

				<section class="card panel">
					<h2>Input</h2>
					<div class="kv"><span>Models</span><span>{job.input?.items.length ?? '–'}</span></div>
					<div class="kv"><span>Total copies</span><span>{totalCopies(job.input)}</span></div>
					<div class="kv"><span>Time limit</span><span>{limit} s</span></div>
					{#if container}
						<div class="kv">
							<span>Container</span>
							<span>{container.width} × {container.length} × {container.height}</span>
						</div>
					{/if}
				</section>

				<section class="note">
					<span class="small">Volume used</span>
					<span class="tiny muted">Not reported by the engine yet.</span>
				</section>

				<a class="btn block" href="/projects/{project.id}/runs">Back to runs</a>
			</aside>
		</div>
	</div>
{:else}
	<!-- 7. Job failed (or cancelled) -->
	<div class="page narrow">
		<Breadcrumbs items={crumbs} />
		<div class="title-row">
			<h1>{job.status === 'CANCELLED' ? 'Run cancelled' : 'Packing failed'}</h1>
			<StatusBadge status={job.status} />
		</div>

		{#if job.status === 'FAILED'}
			<div class="banner danger failure">
				<span class="mark">!</span>
				<div class="failure-text">
					<strong>No result was produced</strong>
					<span class="text">The engine could not finish this run.</span>
					{#if job.failureReason}
						<code class="mono small">{job.failureReason}</code>
					{/if}
				</div>
			</div>

			<section class="card panel">
				<h2>What you can try</h2>
				<ul class="tips">
					{#each failureTips as tip (tip)}<li>{tip}</li>{/each}
				</ul>
			</section>
		{:else}
			<p class="muted">This run was stopped before it finished, so there is no result.</p>
		{/if}

		<section class="card panel">
			<h2>Run details</h2>
			<div class="kv">
				<span>Started</span><span>{when(job.startedAt ?? job.createdAt, { seconds: true })}</span>
			</div>
			<div class="kv">
				<span>{job.status === 'CANCELLED' ? 'Stopped after' : 'Failed after'}</span>
				<span>{duration(jobDuration(job))}</span>
			</div>
			<div class="kv">
				<span>Models / copies</span>
				<span>{job.input?.items.length ?? '–'} / {totalCopies(job.input)}</span>
			</div>
			<div class="kv"><span>Engine</span><span>{job.engineVersion ?? '–'}</span></div>
		</section>

		<div class="actions">
			{#if ctx.editable}
				<a class="btn primary" href="/projects/{project.id}/jobs/new?from={job.id}">Run again</a>
			{/if}
			<a class="btn primary-height" href="/projects/{project.id}/runs">Back to runs</a>
		</div>
	</div>
{/if}

<style>
	/* progress */
	.progress {
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.bar-label {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-top: 8px;
	}
	.bar {
		height: 6px;
		border-radius: 3px;
		background: var(--color-line);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--color-accent);
		transition: width 900ms linear;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
		margin-top: 4px;
	}
	.stat {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 12px;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-control);
		background: var(--color-bg);
	}
	.stat .value {
		font-size: 22px;
		line-height: 28px;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 8px;
	}
	.spacer {
		flex: 1;
	}

	/* result */
	.header-actions {
		display: flex;
		gap: 8px;
	}
	.primary-outline,
	.primary-height {
		height: 44px;
	}
	.result {
		display: flex;
		gap: 24px;
		align-items: stretch;
	}
	.scene {
		flex: 1;
		min-width: 0;
		height: 680px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.bin-tabs {
		display: flex;
		gap: 4px;
		padding: 8px;
		border-bottom: 1px solid var(--color-line);
	}
	.bin-tabs button {
		height: 28px;
		padding: 0 10px;
		border: 1px solid transparent;
		border-radius: 6px;
		background: none;
		color: var(--color-muted);
		font: 500 13px/19px var(--font-sans);
		cursor: pointer;
	}
	.bin-tabs button.active {
		border-color: var(--color-control-border);
		color: var(--color-text);
	}
	.sidebar {
		width: 320px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.panel {
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.panel h2 {
		margin-bottom: 4px;
	}
	.note {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 14px 16px;
		border: 1px dashed var(--color-control-border);
		border-radius: var(--radius-card);
	}
	.bin-row > :last-child {
		font-family: var(--font-sans);
	}

	/* failure */
	.failure {
		padding: 16px;
	}
	.failure-text {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.failure-text .text {
		color: var(--color-text);
	}
	.failure-text code {
		word-break: break-word;
	}
	.tips {
		margin: 0;
		padding-left: 18px;
		color: var(--color-muted);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	@media (max-width: 960px) {
		.result {
			flex-direction: column;
		}
		.sidebar {
			width: auto;
		}
		.scene {
			height: 480px;
		}
	}
</style>
