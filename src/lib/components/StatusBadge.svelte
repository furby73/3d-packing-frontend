<script lang="ts">
	import type { JobStatus } from '../api/types';
	import Badge from './Badge.svelte';

	let { status }: { status: JobStatus } = $props();

	const tones = {
		QUEUED: 'neutral',
		RUNNING: 'warning',
		SUCCEEDED: 'success',
		FAILED: 'danger',
		CANCELLED: 'neutral'
	} as const;
</script>

<Badge tone={tones[status]}>{status}</Badge>
