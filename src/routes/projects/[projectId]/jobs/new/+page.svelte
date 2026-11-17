<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api, errorMessage, type JsonSchema } from '#lib/api/client.ts';
	import type { JobDraft, ModelFormat, ProjectFile } from '#lib/api/types.ts';
	import Breadcrumbs from '#lib/components/Breadcrumbs.svelte';
	import ErrorBanner from '#lib/components/ErrorBanner.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import SchemaField from '#lib/components/SchemaField.svelte';
	import { bytes, modelColor } from '#lib/format.ts';
	import { useProject } from '#lib/project.svelte.ts';
	import { runNumber } from '#lib/runs.ts';
	import { fieldError, objectErrors, withDefaults } from '#lib/schema.ts';

	interface Row {
		fileId: string;
		name: string;
		sizeBytes: number | null;
		copies: number;
	}

	const ctx = useProject();
	const project = $derived(ctx.project!);

	let schema = $state<JsonSchema | null>(null);
	let draft = $state<JobDraft | null>(null);
	let files = $state<ProjectFile[]>([]);
	let rows = $state<Row[]>([]);
	let maxRuntimeSeconds = $state<number | undefined>(60);
	let parameters = $state<Record<string, unknown>>({});
	let sourceRun = $state<number | null>(null);

	let loadError = $state('');
	let submitError = $state('');
	let submitting = $state(false);
	let picking = $state(false);
	let picked = $state<string[]>([]);

	// Limits come from the backend's input schema, so the form follows the engine.
	const itemsSchema = $derived(schema?.properties?.items);
	const copiesSchema = $derived(itemsSchema?.items?.properties?.copies ?? {});
	const runtimeSchema = $derived(schema?.properties?.maxRuntimeSeconds ?? {});
	const paramsSchema = $derived(schema?.properties?.parameters);
	const paramEntries = $derived(Object.entries(paramsSchema?.properties ?? {}));
	const paramGroups = $derived(paramEntries.filter(([, c]) => c.type === 'object' && c.properties));
	const paramScalars = $derived(
		paramEntries.filter(([, c]) => !(c.type === 'object' && c.properties))
	);
	const maxItems = $derived(itemsSchema?.maxItems ?? 50);
	const maxTotal = $derived(itemsSchema?.['x-maxTotalCopies'] ?? 200);
	const minCopies = $derived(copiesSchema.minimum ?? 1);
	const maxCopies = $derived(copiesSchema.maximum ?? 100);
	const accepted = $derived<ModelFormat[]>(itemsSchema?.['x-acceptedFormats'] ?? ['OBJ']);

	const packable = $derived(
		files.filter((f) => f.packingFormat && accepted.includes(f.packingFormat))
	);
	const available = $derived(packable.filter((f) => !rows.some((r) => r.fileId === f.id)));
	const total = $derived(rows.reduce((sum, r) => sum + (r.copies || 0), 0));

	const problems = $derived.by(() => {
		const list: string[] = [];
		if (rows.length === 0) list.push('Add at least one model.');
		if (rows.length > maxItems) list.push(`Use at most ${maxItems} models.`);
		if (total > maxTotal) list.push(`Use at most ${maxTotal} copies in total.`);
		if (
			rows.some((r) => !Number.isInteger(r.copies) || r.copies < minCopies || r.copies > maxCopies)
		)
			list.push(`Each model needs ${minCopies} to ${maxCopies} copies.`);
		const runtime = fieldError(runtimeSchema, maxRuntimeSeconds);
		if (runtime) list.push(`Time limit: ${runtime}`);
		if (paramsSchema) list.push(...objectErrors(paramsSchema, parameters));
		return list;
	});

	async function allFiles(projectId: string) {
		const out: ProjectFile[] = [];
		for (let p = 0; p < 10; p++) {
			const chunk = await api.files(projectId, { page: p, size: 100, sort: 'filename' });
			out.push(...chunk.content);
			if (p >= chunk.totalPages - 1) break;
		}
		return out;
	}

	async function load() {
		loadError = '';
		const from = page.url.searchParams.get('from') ?? undefined;
		try {
			const [s, d, f] = await Promise.all([
				api.inputSchema(),
				api.draft(project.id, from),
				allFiles(project.id)
			]);
			schema = s;
			draft = d;
			files = f;
			const sizes = new Map(f.map((file) => [file.id, file]));
			rows = d.input.items.map((item) => ({
				fileId: item.fileId,
				name: sizes.get(item.fileId)?.filename ?? item.fileName ?? 'Model',
				sizeBytes: sizes.get(item.fileId)?.sizeBytes ?? null,
				copies: item.copies ?? 1
			}));
			maxRuntimeSeconds = d.input.maxRuntimeSeconds;
			parameters = (
				s.properties?.parameters
					? withDefaults(s.properties.parameters, d.input.parameters)
					: d.input.parameters
			) as Record<string, unknown>;
			if (d.sourceJobId && d.source === 'SELECTED_JOB') {
				const job = await api.job(project.id, d.sourceJobId);
				sourceRun = await runNumber(project.id, job);
			}
		} catch (e) {
			loadError = errorMessage(e);
		}
	}

	$effect(() => {
		void project.id;
		load();
	});

	const sourceText = $derived.by(() => {
		if (!draft) return '';
		switch (draft.source) {
			case 'SELECTED_JOB':
				return sourceRun ? `Started from run ${sourceRun}.` : 'Started from an earlier run.';
			case 'LAST_OWN_JOB':
				return 'Started from your last run.';
			case 'LAST_PROJECT_JOB':
				return 'Started from the latest run in this project.';
			default:
				return '';
		}
	});

	const warning = $derived.by(() => {
		if (!draft) return '';
		const parts: string[] = [];
		const omitted = draft.omittedItems.map((i) => i.fileName);
		if (omitted.length) {
			const names = omitted.join(', ');
			parts.push(
				`${names} ${omitted.length === 1 ? 'was' : 'were'} deleted, so ${omitted.length === 1 ? 'it was' : 'they were'} left out.`
			);
		}
		if (draft.resetFields.length) {
			parts.push(`These settings were reset to their defaults: ${draft.resetFields.join(', ')}.`);
		}
		return parts.length ? `${sourceText} ${parts.join(' ')} Check the list below.` : '';
	});

	function setCopies(row: Row, copies: number) {
		row.copies = Math.min(maxCopies, Math.max(minCopies, Math.round(copies) || minCopies));
	}

	function openPicker() {
		picked = [];
		picking = true;
	}

	function addPicked() {
		for (const id of picked) {
			const file = packable.find((f) => f.id === id);
			if (file && !rows.some((r) => r.fileId === id)) {
				rows.push({
					fileId: file.id,
					name: file.filename,
					sizeBytes: file.sizeBytes,
					copies: (copiesSchema.default as number | undefined) ?? 1
				});
			}
		}
		picking = false;
	}

	async function submit() {
		submitting = true;
		submitError = '';
		try {
			const job = await api.createJob(project.id, {
				maxRuntimeSeconds: maxRuntimeSeconds!,
				parameters,
				items: rows.map((r) => ({ fileId: r.fileId, copies: r.copies }))
			});
			await goto(`/projects/${project.id}/jobs/${job.id}`);
		} catch (e) {
			submitError = errorMessage(e);
			submitting = false;
		}
	}
</script>

<svelte:head><title>New packing job · {project.name}</title></svelte:head>

<div class="page">
	<Breadcrumbs
		items={[
			{ label: 'Projects', href: '/' },
			{ label: project.name, href: `/projects/${project.id}` },
			{ label: 'New packing job' }
		]}
	/>

	<div class="heading">
		<h1>New packing job</h1>
		<p class="muted">Choose how many copies of each model to print, then start the run.</p>
	</div>

	{#if !ctx.editable}
		<div class="banner warning">
			<span class="mark">!</span>
			<span>You can only look at this project, so you cannot start a run here.</span>
		</div>
	{:else if loadError}
		<ErrorBanner message={loadError} onretry={load} />
	{:else if schema && draft}
		{#if warning}
			<div class="banner warning">
				<span class="mark">!</span>
				<span>{warning}</span>
			</div>
		{:else if sourceText}
			<p class="small muted">{sourceText}</p>
		{/if}

		<div class="columns">
			<section class="card models">
				<div class="models-head">
					<h2>Models to pack</h2>
					<button
						class="btn md"
						onclick={openPicker}
						disabled={available.length === 0 || rows.length >= maxItems}
						title={available.length === 0
							? 'Every packable model is already in the list'
							: undefined}
					>
						Add model
					</button>
				</div>

				{#each rows as row, i (row.fileId)}
					<div class="item">
						<span class="swatch" style:background={modelColor(i)}></span>
						<div class="item-text">
							<span class="item-name" title={row.name}>{row.name}</span>
							<span class="tiny muted">{bytes(row.sizeBytes)}</span>
						</div>
						<div class="stepper" role="group" aria-label="Copies of {row.name}">
							<button
								aria-label="Fewer copies"
								disabled={row.copies <= minCopies}
								onclick={() => setCopies(row, row.copies - 1)}>−</button
							>
							<input
								class="mono"
								inputmode="numeric"
								aria-label="Copies"
								value={row.copies}
								onchange={(e) => setCopies(row, Number(e.currentTarget.value))}
							/>
							<button
								aria-label="More copies"
								disabled={row.copies >= maxCopies}
								onclick={() => setCopies(row, row.copies + 1)}>+</button
							>
						</div>
						<button class="link-btn danger" onclick={() => rows.splice(i, 1)}>Remove</button>
					</div>
				{:else}
					<div class="empty-list">
						{#if packable.length === 0}
							This project has no models that can be packed yet.
							<a href="/projects/{project.id}">Upload models</a> first.
						{:else}
							No models yet. Press “Add model” to choose what to pack.
						{/if}
					</div>
				{/each}

				<p class="foot tiny muted">
					Only {accepted.join(', ')} models (or models converted to it) can be packed. {minCopies} to
					{maxCopies} copies each.
				</p>
			</section>

			<aside class="sidebar">
				<section class="card panel">
					<h2>Settings</h2>
					<SchemaField
						id="maxRuntimeSeconds"
						schema={{ ...runtimeSchema, title: 'Time limit (seconds)', description: undefined }}
						bind:value={maxRuntimeSeconds}
					/>
					{#if paramsSchema?.properties && Object.keys(paramsSchema.properties).length}
						<div class="params">
							<!-- Grouped options (the container size) stay visible; single knobs fold away. -->
							{#each paramGroups as [key, child] (key)}
								<fieldset>
									<legend>{child.title ?? key}</legend>
									{#if child.description}<p class="tiny muted">{child.description}</p>{/if}
									<div class="grid3">
										{#each Object.entries(child.properties ?? {}) as [sub, leaf] (sub)}
											<SchemaField
												id="{key}.{sub}"
												schema={{ ...leaf, title: leaf.title?.replace(/\s*\(.\)$/, '') }}
												showHint={false}
												bind:value={(parameters[key] as Record<string, unknown>)[sub]}
											/>
										{/each}
									</div>
								</fieldset>
							{/each}
							{#if paramScalars.length}
								<details class="more">
									<summary>More options</summary>
									<div class="more-body">
										{#each paramScalars as [key, child] (key)}
											<SchemaField id={key} schema={child} bind:value={parameters[key]} />
										{/each}
									</div>
								</details>
							{/if}
						</div>
					{:else}
						<p class="divider tiny muted">
							More options, such as printer size and spacing, will appear here when the engine
							supports them.
						</p>
					{/if}
				</section>

				<section class="card panel">
					<h2>Summary</h2>
					<div class="kv"><span>Models</span><span>{rows.length} of {maxItems}</span></div>
					<div class="kv">
						<span>Total copies</span>
						<span class:over={total > maxTotal}>{total} of {maxTotal}</span>
					</div>
					<div class="kv"><span>Time limit</span><span>{maxRuntimeSeconds ?? '–'} s</span></div>
					{#if problems.length && rows.length}
						<ul class="problems tiny">
							{#each problems as problem (problem)}<li>{problem}</li>{/each}
						</ul>
					{/if}
					{#if submitError}<p class="problems tiny">{submitError}</p>{/if}
					<button
						class="btn primary block"
						disabled={problems.length > 0 || submitting}
						onclick={submit}
					>
						{submitting ? 'Starting…' : 'Pack'}
					</button>
					<a class="btn block" href="/projects/{project.id}">Cancel</a>
				</section>
			</aside>
		</div>
	{/if}
</div>

{#if picking}
	<Modal title="Add models" onclose={() => (picking = false)} width={480}>
		<div class="picker">
			{#each available as file (file.id)}
				<label class="pick">
					<input type="checkbox" value={file.id} bind:group={picked} />
					<span class="pick-name">{file.filename}</span>
					<span class="mono tiny muted">{bytes(file.sizeBytes)}</span>
				</label>
			{/each}
		</div>
		{#snippet actions()}
			<button class="btn" onclick={() => (picking = false)}>Cancel</button>
			<button
				class="btn primary md"
				disabled={picked.length === 0 || rows.length + picked.length > maxItems}
				onclick={addPicked}
			>
				Add {picked.length || ''}
			</button>
		{/snippet}
	</Modal>
{/if}

<style>
	.heading {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.columns {
		display: flex;
		gap: 24px;
		align-items: flex-start;
	}
	.models {
		flex: 1;
		min-width: 0;
		overflow: hidden;
	}
	.models-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		border-bottom: 1px solid var(--color-line);
	}
	.item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border-bottom: 1px solid var(--color-line);
	}
	.item-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.item-name {
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.stepper {
		display: flex;
	}
	.stepper > * {
		height: 40px;
		border: 1px solid var(--color-control-border);
		background: var(--color-bg);
		color: var(--color-text);
	}
	.stepper button {
		width: 32px;
		font-size: 16px;
		cursor: pointer;
	}
	.stepper button:disabled {
		color: var(--color-muted);
		cursor: default;
	}
	.stepper button:first-child {
		border-radius: 8px 0 0 8px;
	}
	.stepper button:last-child {
		border-radius: 0 8px 8px 0;
	}
	.stepper input {
		width: 56px;
		margin: 0 -1px;
		text-align: center;
		font-size: 14px;
	}
	.empty-list {
		padding: 24px 16px;
		color: var(--color-muted);
		border-bottom: 1px solid var(--color-line);
	}
	.foot {
		padding: 10px 16px;
	}
	.sidebar {
		width: 340px;
		flex-shrink: 0;
		position: sticky;
		top: 80px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.panel {
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.panel h2 {
		margin-bottom: 4px;
	}
	.params {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--color-line);
	}
	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	legend {
		padding: 0;
		margin-bottom: 4px;
		font-weight: 500;
	}
	.more summary {
		cursor: pointer;
		color: var(--color-muted);
		font-size: 13px;
	}
	.more summary:hover {
		color: var(--color-text);
	}
	.more-body {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 12px;
	}
	.grid3 {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.divider {
		padding-top: 12px;
		border-top: 1px solid var(--color-line);
	}
	.over {
		color: var(--color-danger);
	}
	.problems {
		margin: 0;
		padding-left: 16px;
		color: var(--color-danger);
	}
	p.problems {
		padding-left: 0;
	}
	.picker {
		max-height: 360px;
		overflow: auto;
		display: flex;
		flex-direction: column;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-control);
	}
	.pick {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
		border-bottom: 1px solid var(--color-line);
		cursor: pointer;
	}
	.pick:last-child {
		border-bottom: 0;
	}
	.pick:hover {
		background: rgb(255 255 255 / 0.03);
	}
	.pick-name {
		flex: 1;
	}
	.pick input {
		accent-color: var(--color-accent);
	}
	@media (max-width: 900px) {
		.columns {
			flex-direction: column;
			align-items: stretch;
		}
		.sidebar {
			width: auto;
		}
	}
</style>
