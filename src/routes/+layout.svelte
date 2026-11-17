<script lang="ts">
	import '../app.css';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api } from '#lib/api/client.ts';
	import { session } from '#lib/auth.svelte.ts';
	import TopBar from '#lib/components/TopBar.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const onLogin = $derived(page.url.pathname === '/login');
	let provisionedFor: string | null = null;

	// Route guard: signed-out users go to /login, signed-in users skip it.
	$effect(() => {
		if (!session.ready) return;
		if (!session.user && !onLogin) {
			const next = page.url.pathname + page.url.search;
			goto(next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`, {
				replaceState: true
			});
		} else if (session.user && onLogin) {
			goto(page.url.searchParams.get('next') ?? '/', { replaceState: true });
		}
	});

	// The backend creates the user's profile on the first /users/me call.
	$effect(() => {
		const uid = session.user?.uid;
		if (uid && uid !== provisionedFor) {
			provisionedFor = uid;
			api.me().catch(() => (provisionedFor = null));
		}
	});
</script>

{#if !session.ready}
	<div class="boot" aria-busy="true"></div>
{:else if onLogin}
	{@render children()}
{:else if session.user}
	<TopBar />
	<main>{@render children()}</main>
{/if}

<style>
	.boot {
		min-height: 100vh;
	}
</style>
