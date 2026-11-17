<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		tone = 'outline',
		children
	}: {
		tone?: 'outline' | 'neutral' | 'success' | 'warning' | 'danger';
		children: Snippet;
	} = $props();
</script>

<span class="badge {tone}">{@render children()}</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		height: 22px;
		padding: 0 8px;
		border-radius: 999px;
		font-size: 12px;
		line-height: 17px;
		font-weight: 600;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.outline {
		border: 1px solid var(--color-control-border);
		color: var(--color-muted);
		font-weight: 500;
	}
	.neutral {
		background: var(--color-line);
		color: var(--color-muted);
	}
	.success {
		background: var(--color-success-bg);
		color: var(--color-success);
	}
	.warning {
		background: var(--color-warning-bg);
		color: var(--color-warning);
	}
	.danger {
		background: var(--color-danger-bg);
		color: var(--color-danger);
	}
</style>
