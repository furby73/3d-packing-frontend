<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		onclose,
		children,
		actions,
		width = 420
	}: {
		title: string;
		onclose: () => void;
		children: Snippet;
		actions?: Snippet;
		width?: number;
	} = $props();

	let dialog: HTMLDialogElement;

	$effect(() => {
		dialog.showModal();
		return () => dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	style:width="{width}px"
	aria-labelledby="modal-title"
	oncancel={(event) => {
		event.preventDefault();
		onclose();
	}}
	onclick={(event) => {
		if (event.target === dialog) onclose();
	}}
>
	<div class="body">
		<h2 id="modal-title">{title}</h2>
		{@render children()}
		{#if actions}
			<div class="actions">{@render actions()}</div>
		{/if}
	</div>
</dialog>

<style>
	dialog {
		max-width: calc(100vw - 32px);
		padding: 0;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-card);
		background: var(--color-surface);
		color: var(--color-text);
	}
	dialog::backdrop {
		background: rgb(5 8 12 / 0.7);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 20px;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
</style>
