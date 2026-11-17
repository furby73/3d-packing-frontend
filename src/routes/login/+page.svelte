<script lang="ts">
	import { authConfigured, authMessage, resetPassword, signIn, signUp } from '#lib/auth.svelte.ts';
	import Logo from '#lib/components/Logo.svelte';

	let mode = $state<'signin' | 'signup'>('signin');
	let email = $state('');
	let password = $state('');
	let busy = $state(false);
	let error = $state('');
	let notice = $state('');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		notice = '';
		try {
			// The layout redirects once Firebase reports the signed-in user.
			await (mode === 'signin' ? signIn(email, password) : signUp(email, password));
		} catch (e) {
			error = authMessage(e);
		} finally {
			busy = false;
		}
	}

	async function forgot() {
		error = '';
		notice = '';
		if (!email) {
			error = 'Enter your email first, then press "Forgot password?" again.';
			return;
		}
		try {
			await resetPassword(email);
			notice = `We sent a reset link to ${email}.`;
		} catch (e) {
			error = authMessage(e);
		}
	}

	function toggle() {
		mode = mode === 'signin' ? 'signup' : 'signin';
		error = '';
		notice = '';
	}
</script>

<svelte:head><title>Sign in · ZPI 3D nesting</title></svelte:head>

<div class="screen">
	<form class="card" onsubmit={submit}>
		<Logo />
		<div class="heading">
			<h1>{mode === 'signin' ? 'Sign in' : 'Create account'}</h1>
			<p class="muted">
				{mode === 'signin'
					? 'Sign in to open your projects. A new account is created the first time you sign in.'
					: 'Pick an email and a password of at least 6 characters.'}
			</p>
		</div>

		{#if !authConfigured}
			<div class="banner warning small">
				<span class="mark">!</span>
				<span>Firebase is not configured. Copy .env.example to .env.local and fill it in.</span>
			</div>
		{/if}

		<label class="field">
			<span class="label">Email</span>
			<input
				class="input"
				type="email"
				autocomplete="email"
				placeholder="you@university.edu"
				required
				bind:value={email}
			/>
		</label>

		<label class="field">
			<span class="label-row">
				<span class="label">Password</span>
				{#if mode === 'signin'}
					<button type="button" class="link-btn accent tiny" onclick={forgot}>
						Forgot password?
					</button>
				{/if}
			</span>
			<input
				class="input"
				type="password"
				autocomplete={mode === 'signin' ? 'current-password' : 'new-password'}
				placeholder="••••••••"
				minlength="6"
				required
				bind:value={password}
			/>
		</label>

		{#if error}<p class="message error small" role="alert">{error}</p>{/if}
		{#if notice}<p class="message small">{notice}</p>{/if}

		<button class="btn primary block" disabled={busy || !authConfigured}>
			{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
		</button>

		<p class="switch muted">
			{mode === 'signin' ? 'No account yet?' : 'Already have an account?'}
			<button type="button" class="link-btn accent" onclick={toggle}>
				{mode === 'signin' ? 'Create one' : 'Sign in'}
			</button>
		</p>
	</form>
</div>

<style>
	.screen {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 24px;
	}
	.card {
		width: 380px;
		max-width: 100%;
		padding: 32px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.heading {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 4px;
	}
	.label-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.label {
		font-size: 12px;
		line-height: 16px;
		color: var(--color-muted);
	}
	.tiny {
		font-size: 12px;
		line-height: 16px;
	}
	.message.error {
		color: var(--color-danger);
	}
	.switch {
		text-align: center;
	}
	.switch .link-btn {
		font-size: 14px;
	}
</style>
