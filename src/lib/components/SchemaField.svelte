<script lang="ts">
	import type { JsonSchema } from '../api/client';
	import { fieldError, rangeHint } from '../schema';

	let {
		schema,
		value = $bindable(),
		id,
		showHint = true
	}: { schema: JsonSchema; value: unknown; id: string; showHint?: boolean } = $props();

	const error = $derived(fieldError(schema, value));
	const numeric = $derived(schema.type === 'number' || schema.type === 'integer');
	const hint = $derived(
		[schema.description, numeric ? rangeHint(schema) : ''].filter(Boolean).join(' ')
	);
</script>

<div class="field">
	<label class="label" for={id}>{schema.title ?? id}</label>
	{#if schema.enum}
		<select {id} class="select" bind:value>
			{#each schema.enum as option (option)}<option value={option}>{option}</option>{/each}
		</select>
	{:else if schema.type === 'boolean'}
		<input
			{id}
			type="checkbox"
			checked={!!value}
			onchange={(e) => (value = e.currentTarget.checked)}
		/>
	{:else if numeric}
		<input
			{id}
			class="input mono"
			inputmode={schema.type === 'integer' ? 'numeric' : 'decimal'}
			aria-invalid={!!error}
			value={value ?? ''}
			oninput={(e) => {
				const raw = e.currentTarget.value.trim();
				value = raw === '' ? undefined : Number(raw);
			}}
		/>
	{:else}
		<input {id} class="input" bind:value />
	{/if}
	{#if error}
		<span class="error">{error}</span>
	{:else if hint && showHint}
		<span class="hint">{hint}</span>
	{/if}
</div>
