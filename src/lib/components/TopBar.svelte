<script lang="ts">
	import { goto } from '$app/navigation';
	import { session, signOut } from '../auth.svelte';
	import Logo from './Logo.svelte';

	async function leave() {
		await signOut();
		await goto('/login');
	}
</script>

<header class="topbar">
	<a href="/" class="home" aria-label="Projects"><Logo /></a>
	<span class="spacer"></span>
	<span class="small muted">{session.user?.email}</span>
	<button class="btn" onclick={leave}>Sign out</button>
</header>

<style>
	.topbar {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: 28px;
		height: 56px;
		padding: 0 24px;
		background: var(--color-panel);
		border-bottom: 1px solid var(--color-line);
	}
	.home:hover {
		text-decoration: none;
	}
	.spacer {
		flex: 1;
	}
</style>
