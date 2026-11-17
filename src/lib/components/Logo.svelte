<script lang="ts">
	import mark from '../assets/logo-mark.svg';
</script>

<span class="logo">
	<img src={mark} alt="" width="24" height="24" />
	<span class="name">ZPI</span>
	<span class="sub">3D nesting</span>
</span>

<style>
	.logo {
		display: inline-flex;
		align-items: center;
		gap: 10px;
	}
	.name {
		font-size: 16px;
		line-height: 23px;
		font-weight: 600;
		color: var(--color-text);
	}
	.sub {
		color: var(--color-muted);
	}
</style>
