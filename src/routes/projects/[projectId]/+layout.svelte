<script lang="ts">
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { api, errorMessage } from '#lib/api/client.ts';
	import ErrorBanner from '#lib/components/ErrorBanner.svelte';
	import { ProjectState, setProject } from '#lib/project.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const ctx = setProject(new ProjectState());
	let error = $state('');

	async function load(projectId: string) {
		error = '';
		try {
			const project = await api.project(projectId);
			if (page.params.projectId === projectId) ctx.project = project;
		} catch (e) {
			error = errorMessage(e);
		}
	}

	// Runs only when the project id in the URL changes.
	$effect(() => {
		const id = page.params.projectId;
		if (!id) return;
		untrack(() => {
			if (ctx.project?.id !== id) ctx.project = null;
			load(id);
		});
	});
</script>

{#if error}
	<div class="page">
		<ErrorBanner
			message={error}
			onretry={() => page.params.projectId && load(page.params.projectId)}
		/>
		<a href="/" class="small">Back to projects</a>
	</div>
{:else if ctx.project}
	{@render children()}
{/if}
