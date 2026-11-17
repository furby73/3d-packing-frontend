<script lang="ts">
	let {
		page,
		totalPages,
		label,
		onchange
	}: { page: number; totalPages: number; label: string; onchange: (page: number) => void } =
		$props();
</script>

<div class="pagination">
	<span class="small muted">{label}</span>
	<div class="buttons">
		<button class="btn sm" disabled={page <= 0} onclick={() => onchange(page - 1)}>Previous</button>
		<button class="btn sm" disabled={page >= totalPages - 1} onclick={() => onchange(page + 1)}>
			Next
		</button>
	</div>
</div>

<style>
	.pagination {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.buttons {
		display: flex;
		gap: 8px;
	}
</style>
