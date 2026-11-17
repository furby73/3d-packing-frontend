<script lang="ts">
	import { api, errorMessage, saveBlob } from '#lib/api/client.ts';
	import type { ModelFormat, PageOf, ProjectFile, SampleModel } from '#lib/api/types.ts';
	import Badge from '#lib/components/Badge.svelte';
	import ErrorBanner from '#lib/components/ErrorBanner.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import Pagination from '#lib/components/Pagination.svelte';
	import ProjectHeader from '#lib/components/ProjectHeader.svelte';
	import { bytes, modelColor, plural, when } from '#lib/format.ts';
	import { useProject } from '#lib/project.svelte.ts';

	const pageSize = 20;
	const formats: { value: ModelFormat; label: string }[] = [
		{ value: 'OBJ', label: 'OBJ' },
		{ value: 'STL', label: 'STL' },
		{ value: 'STEP', label: 'STEP' },
		{ value: 'THREE_MF', label: '3MF' },
		{ value: 'PLY', label: 'PLY' },
		{ value: 'GLTF', label: 'glTF' },
		{ value: 'GLB', label: 'GLB' }
	];
	const formatLabel = (format: ModelFormat) =>
		formats.find((f) => f.value === format)?.label ?? format;
	const accept = '.obj,.stl,.step,.stp,.3mf,.ply,.gltf,.glb';

	const ctx = useProject();
	const project = $derived(ctx.project!);

	let search = $state('');
	let format = $state<ModelFormat | ''>('');
	let pageIndex = $state(0);
	let result = $state<PageOf<ProjectFile> | null>(null);
	let loading = $state(true);
	let error = $state('');
	let actionError = $state('');

	let uploads = $state<{ id: number; name: string; done?: boolean; error?: string }[]>([]);
	let uploadSeq = 0;
	let dragging = $state(false);
	let picker = $state<HTMLInputElement>();

	let renaming = $state<ProjectFile | null>(null);
	let renameTo = $state('');
	let deleting = $state<ProjectFile | null>(null);
	let busy = $state(false);

	let samples = $state<SampleModel[]>([]);

	let request = 0;

	async function load() {
		const current = ++request;
		loading = true;
		error = '';
		try {
			const next = await api.files(project.id, {
				search,
				format: format ? [format] : undefined,
				page: pageIndex,
				size: pageSize
			});
			if (current !== request) return;
			// Stepping back when the last row of a page was deleted.
			if (next.content.length === 0 && pageIndex > 0) {
				pageIndex--;
				return;
			}
			result = next;
		} catch (e) {
			if (current === request) error = errorMessage(e);
		} finally {
			if (current === request) loading = false;
		}
	}

	$effect(() => {
		void search;
		void format;
		void pageIndex;
		void project.id;
		const timer = setTimeout(load, 200);
		return () => clearTimeout(timer);
	});

	const isEmptyProject = $derived(
		!!result && result.totalElements === 0 && !format && search.trim().length < 3
	);

	$effect(() => {
		if (isEmptyProject && ctx.editable && samples.length === 0) {
			api.samples().then(
				(list) => (samples = list),
				() => {}
			);
		}
	});

	async function uploadAll(files: FileList | File[]) {
		const list = Array.from(files);
		if (!list.length || !ctx.editable) return;
		const batch = list.map((file) => ({ id: ++uploadSeq, name: file.name }));
		uploads = [...uploads.filter((u) => !u.done && !u.error), ...batch];
		await Promise.all(
			list.map(async (file, i) => {
				const entry = uploads.find((u) => u.id === batch[i].id);
				try {
					await api.upload(project.id, file);
					if (entry) entry.done = true;
				} catch (e) {
					if (entry) entry.error = errorMessage(e);
				}
			})
		);
		pageIndex = 0;
		await load();
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		if (event.dataTransfer?.files.length) uploadAll(event.dataTransfer.files);
	}

	async function addSample(sample: SampleModel) {
		actionError = '';
		try {
			await api.addSample(project.id, sample.id);
			await load();
		} catch (e) {
			actionError = errorMessage(e);
		}
	}

	async function download(file: ProjectFile) {
		actionError = '';
		try {
			saveBlob(await api.fileContent(project.id, file.id), file.filename);
		} catch (e) {
			actionError = errorMessage(e);
		}
	}

	function startRename(file: ProjectFile) {
		renaming = file;
		renameTo = file.filename;
	}

	async function rename(event: SubmitEvent) {
		event.preventDefault();
		if (!renaming) return;
		busy = true;
		actionError = '';
		try {
			await api.renameFile(project.id, renaming.id, renameTo.trim());
			renaming = null;
			await load();
		} catch (e) {
			actionError = errorMessage(e);
		} finally {
			busy = false;
		}
	}

	async function remove() {
		if (!deleting) return;
		busy = true;
		actionError = '';
		try {
			await api.deleteFile(project.id, deleting.id);
			deleting = null;
			await load();
		} catch (e) {
			actionError = errorMessage(e);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>{project.name} · Models</title></svelte:head>

<div class="page">
	<ProjectHeader tab="models" />

	<div class="toolbar">
		<div class="filters">
			<input
				class="input on-surface search"
				type="search"
				placeholder="Search by name"
				aria-label="Search models by name"
				bind:value={search}
				oninput={() => (pageIndex = 0)}
			/>
			<select
				class="select on-surface format"
				aria-label="Filter by format"
				bind:value={format}
				onchange={() => (pageIndex = 0)}
			>
				<option value="">All formats</option>
				{#each formats as f (f.value)}<option value={f.value}>{f.label}</option>{/each}
			</select>
		</div>
		{#if ctx.editable}
			<button class="btn" onclick={() => picker?.click()}>Upload files</button>
			<input
				bind:this={picker}
				type="file"
				multiple
				{accept}
				hidden
				onchange={(e) => {
					const input = e.currentTarget;
					if (input.files) uploadAll(input.files).then(() => (input.value = ''));
				}}
			/>
		{/if}
	</div>

	{#if ctx.editable}
		<div
			class="dropzone"
			class:dragging
			role="region"
			aria-label="Drop files to upload"
			ondragover={(e) => {
				e.preventDefault();
				dragging = true;
			}}
			ondragleave={() => (dragging = false)}
			ondrop={onDrop}
		>
			<span>Drop 3D model files here to add them to this project.</span>
			<span class="mono small">OBJ, STL, 3MF, PLY, glTF can be packed</span>
		</div>
	{/if}

	{#each uploads.filter((u) => !u.done) as upload (upload.id)}
		<div class="banner small" class:danger={!!upload.error} class:pending={!upload.error}>
			<span class="mark">{upload.error ? '!' : '↑'}</span>
			<span>
				{upload.name}{upload.error ? `: ${upload.error}` : ' is uploading…'}
			</span>
		</div>
	{/each}

	{#if actionError}<ErrorBanner message={actionError} />{/if}

	{#if error}
		<ErrorBanner message={error} onretry={load} />
	{:else if result}
		<div class="card table" class:stale={loading}>
			<div class="row head">
				<span class="c-name">Name</span>
				<span class="c-format">Format</span>
				<span class="c-size">Size</span>
				<span class="c-date">Uploaded</span>
				<span class="c-actions"></span>
			</div>
			{#each result.content as file, i (file.id)}
				<div class="row">
					<span class="c-name name-cell">
						<span class="swatch" style:background={modelColor(result.page * pageSize + i)}></span>
						<span class="filename" title={file.filename}>{file.filename}</span>
						{#if !file.packingFormat}<Badge tone="warning">Not packable</Badge>{/if}
					</span>
					<span class="c-format mono small">{formatLabel(file.format)}</span>
					<span class="c-size mono small">{bytes(file.sizeBytes)}</span>
					<span class="c-date muted">{when(file.createdAt)}</span>
					<span class="c-actions">
						<button class="link-btn" onclick={() => download(file)}>Download</button>
						{#if ctx.editable}
							<button class="link-btn" onclick={() => startRename(file)}>Rename</button>
							<button class="link-btn danger" onclick={() => (deleting = file)}>Delete</button>
						{/if}
					</span>
				</div>
			{:else}
				<div class="empty">
					{#if isEmptyProject}
						No models yet.
						{ctx.editable ? 'Upload your own files, or start with a sample model.' : ''}
					{:else}
						No models match these filters.
					{/if}
				</div>
			{/each}
		</div>

		{#if isEmptyProject && samples.length}
			<div class="card samples">
				<h2>Sample models</h2>
				{#each samples as sample (sample.id)}
					<div class="sample">
						<div class="sample-text">
							<span>{sample.name}</span>
							<span class="tiny muted">{sample.description}</span>
						</div>
						<span class="mono small muted">{bytes(sample.sizeBytes)}</span>
						<button class="btn sm" onclick={() => addSample(sample)}>Add</button>
					</div>
				{/each}
			</div>
		{/if}

		<Pagination
			page={result.page}
			totalPages={result.totalPages}
			label="{result.content.length} of {plural(result.totalElements, 'model')}"
			onchange={(p) => (pageIndex = p)}
		/>
	{/if}
</div>

{#if renaming}
	<Modal title="Rename model" onclose={() => (renaming = null)}>
		<form id="rename-file" onsubmit={rename}>
			<label class="field">
				<span class="label">File name</span>
				<!-- svelte-ignore a11y_autofocus -->
				<input class="input" required maxlength="255" autofocus bind:value={renameTo} />
			</label>
		</form>
		{#snippet actions()}
			<button class="btn" onclick={() => (renaming = null)}>Cancel</button>
			<button class="btn primary md" form="rename-file" disabled={busy || !renameTo.trim()}>
				Rename
			</button>
		{/snippet}
	</Modal>
{/if}

{#if deleting}
	<Modal title="Delete model?" onclose={() => (deleting = null)}>
		<p class="muted">
			<strong class="text">{deleting.filename}</strong> will be removed from this project. Runs that already
			used it keep their results.
		</p>
		{#snippet actions()}
			<button class="btn" onclick={() => (deleting = null)}>Cancel</button>
			<button class="btn danger md" disabled={busy} onclick={remove}>Delete</button>
		{/snippet}
	</Modal>
{/if}

<style>
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.filters {
		display: flex;
		gap: 8px;
	}
	.search {
		width: 260px;
	}
	.format {
		width: 140px;
	}
	.dropzone {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 14px 16px;
		border: 1px dashed var(--color-control-border);
		border-radius: var(--radius-card);
		color: var(--color-muted);
		transition:
			border-color 120ms,
			background-color 120ms;
	}
	.dropzone.dragging {
		border-color: var(--color-accent);
		background: rgb(255 138 61 / 0.06);
		color: var(--color-text);
	}
	.banner.pending {
		background: var(--color-surface);
		border: 1px solid var(--color-line);
		color: var(--color-muted);
	}
	.stale {
		opacity: 0.6;
	}
	.c-name {
		flex: 1;
		min-width: 0;
	}
	.c-format {
		width: 90px;
	}
	.c-size {
		width: 100px;
	}
	.c-date {
		width: 160px;
	}
	.c-actions {
		width: 260px;
		display: flex;
		justify-content: flex-end;
		gap: 16px;
	}
	.name-cell {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.filename {
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.samples {
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.sample {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.sample-text {
		flex: 1;
		display: flex;
		flex-direction: column;
	}
	.label {
		font-size: 12px;
		line-height: 16px;
		color: var(--color-muted);
	}
	.text {
		color: var(--color-text);
		font-weight: 600;
	}
</style>
