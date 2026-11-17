<script lang="ts">
	let { message, onretry }: { message: string; onretry?: () => void } = $props();
</script>

<div class="banner danger" role="alert">
	<span class="mark">!</span>
	<span class="text">{message}</span>
	{#if onretry}<button class="link-btn danger" onclick={onretry}>Try again</button>{/if}
</div>

<style>
	.text {
		flex: 1;
	}
</style>
