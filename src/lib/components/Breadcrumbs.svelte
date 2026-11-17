<script lang="ts">
	let { items }: { items: { label: string; href?: string }[] } = $props();
</script>

<nav class="crumbs small" aria-label="Breadcrumb">
	{#each items as item, i (i)}
		{#if i > 0}<span class="muted" aria-hidden="true">/</span>{/if}
		{#if item.href}
			<a href={item.href}>{item.label}</a>
		{:else}
			<span aria-current="page">{item.label}</span>
		{/if}
	{/each}
</nav>

<style>
	.crumbs {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
</style>
