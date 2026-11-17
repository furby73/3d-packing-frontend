<script lang="ts">
	import { goto } from '$app/navigation';
	import { api, errorMessage } from '#lib/api/client.ts';
	import type { PageOf, ProjectSummary } from '#lib/api/types.ts';
	import Badge from '#lib/components/Badge.svelte';
	import ErrorBanner from '#lib/components/ErrorBanner.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import Pagination from '#lib/components/Pagination.svelte';
	import { plural, when } from '#lib/format.ts';

	const pageSize = 24;

	let search = $state('');
	let pageIndex = $state(0);
	let result = $state<PageOf<ProjectSummary> | null>(null);
	let loading = $state(true);
	let error = $state('');

	let creating = $state(false);
	let newName = $state('');
	let createError = $state('');
	let saving = $state(false);

	let request = 0;

	async function load() {
		const current = ++request;
		loading = true;
		error = '';
		try {
			const next = await api.projects({
				search,
				page: pageIndex,
				size: pageSize,
				sort: 'updatedAt',
				direction: 'DESC'
			});
			if (current === request) result = next;
		} catch (e) {
			if (current === request) error = errorMessage(e);
		} finally {
			if (current === request) loading = false;
		}
	}

	// Reload when the search or page changes; typing is debounced.
	$effect(() => {
		void search;
		void pageIndex;
		const timer = setTimeout(load, 250);
		return () => clearTimeout(timer);
	});

	async function create(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		createError = '';
		try {
			const project = await api.createProject(newName.trim());
			await goto(`/projects/${project.id}`);
		} catch (e) {
			createError = errorMessage(e);
		} finally {
			saving = false;
		}
	}

	function openCreate() {
		newName = '';
		createError = '';
		creating = true;
	}
</script>

<svelte:head><title>Projects · ZPI 3D nesting</title></svelte:head>

<div class="page">
	<div class="page-header">
		<div class="heading">
			<h1>Projects</h1>
			<p class="muted">Each project holds its own models and packing runs.</p>
		</div>
		<div class="tools">
			<input
				class="input on-surface search"
				type="search"
				placeholder="Search projects"
				aria-label="Search projects"
				bind:value={search}
				oninput={() => (pageIndex = 0)}
			/>
			<button class="btn primary new" onclick={openCreate}>New project</button>
		</div>
	</div>

	{#if error}
		<ErrorBanner message={error} onretry={load} />
	{:else if result}
		{#if result.content.length === 0}
			<div class="card empty">
				{#if search.trim().length >= 3}
					<p>No projects match “{search.trim()}”.</p>
				{:else}
					<h2>No projects yet</h2>
					<p class="muted">Create a project, upload your models and start packing.</p>
					<button class="btn primary" onclick={openCreate}>New project</button>
				{/if}
			</div>
		{:else}
			<div class="grid" class:stale={loading}>
				{#each result.content as project (project.id)}
					<a class="card project" href="/projects/{project.id}">
						<div class="top">
							<span class="name">{project.name}</span>
							<Badge>{project.myPermission}</Badge>
						</div>
						<div class="meta small muted">
							{#if project.status === 'DISABLED'}<Badge tone="warning">DISABLED</Badge>{/if}
							<span>{plural(project.memberCount, 'member')}</span>
						</div>
						<span class="small muted">Updated {when(project.updatedAt)}</span>
					</a>
				{/each}
			</div>
			{#if result.totalPages > 1}
				<Pagination
					page={result.page}
					totalPages={result.totalPages}
					label="{result.content.length} of {result.totalElements} projects"
					onchange={(p) => (pageIndex = p)}
				/>
			{/if}
		{/if}
	{/if}
</div>

{#if creating}
	<Modal title="New project" onclose={() => (creating = false)}>
		<form id="create-project" class="form" onsubmit={create}>
			<label class="field">
				<span class="label">Name</span>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="input"
					required
					maxlength="100"
					placeholder="e.g. Bracket batch"
					autofocus
					bind:value={newName}
				/>
			</label>
			{#if createError}<p class="error small">{createError}</p>{/if}
		</form>
		{#snippet actions()}
			<button class="btn" onclick={() => (creating = false)}>Cancel</button>
			<button class="btn primary md" form="create-project" disabled={saving || !newName.trim()}>
				{saving ? 'Creating…' : 'Create project'}
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
	.tools {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.search {
		width: 240px;
	}
	.new {
		height: 40px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 16px;
		transition: opacity 120ms;
	}
	.grid.stale {
		opacity: 0.6;
	}
	.project {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px 16px 16px;
		color: var(--color-text);
		transition: border-color 120ms;
	}
	.project:hover {
		text-decoration: none;
		border-color: var(--color-control-border);
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.name {
		font-size: 15px;
		line-height: 22px;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.empty {
		padding: 40px 24px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		text-align: center;
	}
	.empty .btn {
		margin-top: 8px;
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.label {
		font-size: 12px;
		line-height: 16px;
		color: var(--color-muted);
	}
	.error {
		color: var(--color-danger);
	}
</style>
