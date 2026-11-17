<script lang="ts">
	import { api, errorMessage } from '#lib/api/client.ts';
	import type { JobStatus, PackingJob, PageOf } from '#lib/api/types.ts';
	import ErrorBanner from '#lib/components/ErrorBanner.svelte';
	import Pagination from '#lib/components/Pagination.svelte';
	import ProjectHeader from '#lib/components/ProjectHeader.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import { duration, isActive, jobDuration, plural, totalCopies, when } from '#lib/format.ts';
	import { useProject } from '#lib/project.svelte.ts';
	import { runNumbers } from '#lib/runs.ts';

	const pageSize = 10;
	const statuses: JobStatus[] = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'];

	const ctx = useProject();
	const project = $derived(ctx.project!);

	let status = $state<JobStatus | ''>('');
	let order = $state<'DESC' | 'ASC'>('DESC');
	let pageIndex = $state(0);
	let result = $state<PageOf<PackingJob> | null>(null);
	let numbers = $state<Record<string, number>>({});
	let loading = $state(true);
	let error = $state('');
	let now = $state(Date.now());

	let request = 0;
	let poll: ReturnType<typeof setTimeout> | undefined;

	async function load() {
		clearTimeout(poll);
		const current = ++request;
		loading = true;
		error = '';
		try {
			const next = await api.jobs(project.id, {
				status: status ? [status] : undefined,
				sort: 'createdAt',
				direction: order,
				page: pageIndex,
				size: pageSize
			});
			if (current !== request) return;
			result = next;
			numbers = { ...numbers, ...(await runNumbers(project.id, next.content)) };
			// Keep the list fresh while something is still queued or running.
			if (next.content.some((job) => isActive(job.status))) poll = setTimeout(load, 3000);
		} catch (e) {
			if (current === request) error = errorMessage(e);
		} finally {
			if (current === request) loading = false;
		}
	}

	$effect(() => {
		void status;
		void order;
		void pageIndex;
		void project.id;
		load();
		return () => clearTimeout(poll);
	});

	$effect(() => {
		const ticker = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(ticker);
	});

	const action = (job: PackingJob) =>
		job.status === 'SUCCEEDED' ? 'View result' : job.status === 'FAILED' ? 'See why' : 'Open';

	const runDuration = (job: PackingJob) =>
		job.status === 'RUNNING'
			? duration(Math.round((now - new Date(job.startedAt ?? job.createdAt).getTime()) / 1000))
			: duration(jobDuration(job));
</script>

<svelte:head><title>{project.name} · Runs</title></svelte:head>

<div class="page">
	<ProjectHeader tab="runs" />

	<div class="filters">
		<select
			class="select on-surface"
			aria-label="Filter by status"
			bind:value={status}
			onchange={() => (pageIndex = 0)}
		>
			<option value="">All statuses</option>
			{#each statuses as s (s)}<option value={s}>{s[0] + s.slice(1).toLowerCase()}</option>{/each}
		</select>
		<select
			class="select on-surface"
			aria-label="Sort"
			bind:value={order}
			onchange={() => (pageIndex = 0)}
		>
			<option value="DESC">Newest first</option>
			<option value="ASC">Oldest first</option>
		</select>
	</div>

	{#if error}
		<ErrorBanner message={error} onretry={load} />
	{:else if result}
		<div class="card table">
			<div class="row head">
				<span class="c-run">Run</span>
				<span class="c-status">Status</span>
				<span class="c-started">Started</span>
				<span class="c-duration">Duration</span>
				<span class="c-items">Models / copies</span>
				<span class="c-engine">Engine</span>
				<span class="c-action"></span>
			</div>
			{#each result.content as job (job.id)}
				<a class="row link" href="/projects/{project.id}/jobs/{job.id}">
					<span class="c-run mono small">#{numbers[job.id] ?? '…'}</span>
					<span class="c-status"><StatusBadge status={job.status} /></span>
					<span class="c-started">{when(job.startedAt ?? job.createdAt)}</span>
					<span class="c-duration mono small">{runDuration(job)}</span>
					<span class="c-items mono small">
						{job.input?.items.length ?? '-'} / {totalCopies(job.input) || '-'}
					</span>
					<span class="c-engine mono small">{job.engineVersion ?? '-'}</span>
					<span class="c-action">{action(job)}</span>
				</a>
			{:else}
				<div class="empty">
					{#if status}
						No {status.toLowerCase()} runs.
					{:else}
						No runs yet.
						{#if ctx.editable}<a href="/projects/{project.id}/jobs/new">Start the first one.</a
							>{/if}
					{/if}
				</div>
			{/each}
		</div>

		<Pagination
			page={result.page}
			totalPages={result.totalPages}
			label="{result.content.length} of {plural(result.totalElements, 'run')}"
			onchange={(p) => (pageIndex = p)}
		/>
	{/if}
</div>

<style>
	.filters {
		display: flex;
		gap: 8px;
	}
	.filters .select {
		width: 160px;
	}
	.row.link {
		color: var(--color-text);
		transition: background-color 120ms;
	}
	.row.link:hover {
		background: rgb(255 255 255 / 0.02);
		text-decoration: none;
	}
	.row.link:hover .c-action {
		text-decoration: underline;
	}
	.c-run {
		width: 64px;
	}
	.c-status {
		width: 106px;
	}
	.c-started {
		flex: 1;
		min-width: 0;
	}
	.c-duration {
		width: 110px;
	}
	.c-items {
		width: 130px;
	}
	.c-engine {
		width: 100px;
	}
	.c-action {
		width: 110px;
		text-align: right;
		color: var(--color-accent);
		font-size: 13px;
	}
</style>
