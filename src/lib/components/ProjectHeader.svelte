<script lang="ts">
	import { useProject } from '../project.svelte';
	import Badge from './Badge.svelte';
	import Breadcrumbs from './Breadcrumbs.svelte';

	let { tab }: { tab: 'models' | 'runs' } = $props();

	const ctx = useProject();
	const project = $derived(ctx.project!);
</script>

<Breadcrumbs items={[{ label: 'Projects', href: '/' }, { label: project.name }]} />

<div class="page-header">
	<div class="title-row">
		<h1>{project.name}</h1>
		<Badge>{project.myPermission}</Badge>
		{#if project.status === 'DISABLED'}<Badge tone="warning">DISABLED</Badge>{/if}
	</div>
	{#if ctx.editable}
		<a class="btn primary" href="/projects/{project.id}/jobs/new">New packing job</a>
	{/if}
</div>

{#if project.status === 'DISABLED'}
	<div class="banner warning small">
		<span class="mark">!</span>
		<span
			>This project is disabled. It is a read-only archive: you can look and download, not change.</span
		>
	</div>
{/if}

<nav class="tabs" aria-label="Project sections">
	<a
		href="/projects/{project.id}"
		class:active={tab === 'models'}
		aria-current={tab === 'models' ? 'page' : undefined}>Models</a
	>
	<a
		href="/projects/{project.id}/runs"
		class:active={tab === 'runs'}
		aria-current={tab === 'runs' ? 'page' : undefined}>Runs</a
	>
</nav>

<style>
	.tabs {
		display: flex;
		gap: 20px;
		border-bottom: 1px solid var(--color-line);
	}
	.tabs a {
		display: flex;
		align-items: center;
		height: 40px;
		padding: 0 4px;
		margin-bottom: -1px;
		color: var(--color-muted);
		font-weight: 500;
		border-bottom: 2px solid transparent;
	}
	.tabs a:hover {
		color: var(--color-text);
		text-decoration: none;
	}
	.tabs a.active {
		color: var(--color-text);
		border-bottom-color: var(--color-accent);
	}
</style>
