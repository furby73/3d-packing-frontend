<script>
  import { onMount } from 'svelte';
  import Avatar from '../../components/Avatar.svelte';
  import Badge from '../../components/Badge.svelte';
  import Icon from '../../components/Icon.svelte';
  import Modal from '../../components/Modal.svelte';
  import { api } from '../../lib/api.js';
  import { nameOf, permissionLabel, permissions } from '../../lib/format.js';
  import { toast } from '../../lib/toast.svelte.js';
  import { useProject } from './context.svelte.js';

  let { onclose, ondone } = $props();

  const { ctx } = useProject();

  let term = $state('');
  let results = $state(null);
  let searching = $state(false);
  let picked = $state(null);
  let permission = $state('WRITE');
  let roster = $state(new Map());
  let busy = $state(false);
  let error = $state('');
  let active = $state(-1);

  const existing = $derived(picked ? roster.get(picked.id) : null);
  const firstName = $derived(picked ? nameOf(picked).split(' ')[0] : '');

  onMount(async () => {
    try {
      const members = await api.members(ctx.id, { size: 100 });
      roster = new Map(members.content.map((member) => [member.userId, member]));
    } catch {
      roster = new Map();
    }
  });

  let timer;
  let controller;
  $effect(() => {
    const value = term.trim();
    clearTimeout(timer);
    if (value.length < 3) {
      results = null;
      return;
    }
    timer = setTimeout(async () => {
      controller?.abort();
      controller = new AbortController();
      searching = true;
      try {
        results = await api.searchUsers(value, 10, controller.signal);
        active = -1;
      } catch (failure) {
        if (failure.name !== 'AbortError') error = failure.message;
      } finally {
        searching = false;
      }
    }, 250);
    return () => clearTimeout(timer);
  });

  function choose(person) {
    if (person.status !== 'ACTIVE') return;
    picked = person;
    error = '';
    const member = roster.get(person.id);
    permission = member ? (member.permission === 'OWNER' ? 'WRITE' : 'OWNER') : 'WRITE';
  }

  function keydown(event) {
    if (!results?.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      active = Math.min(results.length - 1, active + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      active = Math.max(0, active - 1);
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      choose(results[active]);
    }
  }

  async function submit() {
    if (!picked || busy || (existing && existing.permission === permission)) return;
    busy = true;
    error = '';
    try {
      if (existing) {
        await api.changeMember(ctx.id, picked.id, permission);
        toast.success(`${nameOf(picked)} is now ${permission === 'OWNER' ? 'an Owner' : permissionLabel(permission)}`);
      } else {
        await api.addMember(ctx.id, picked.id, permission);
        toast.success(`${nameOf(picked)} was added as ${permissionLabel(permission)}`);
      }
      ondone();
    } catch (failure) {
      error = failure.message;
    } finally {
      busy = false;
    }
  }
</script>

<Modal title="Add member to {ctx.project.name}" width={520} {onclose} {busy} onsubmit={submit}>
  <div class="pk-field">
    <label class="pk-label" for="person">Person</label>
    <div class="pk-search">
      <Icon name="search" />
      <input
        id="person"
        class="pk-input"
        autocomplete="off"
        role="combobox"
        aria-expanded={!!results?.length}
        aria-controls="people"
        bind:value={term}
        onkeydown={keydown}
        data-autofocus
      />
    </div>
    <span class="pk-hint">Search by username, name or email · at least 3 characters. They must have signed in once.</span>
  </div>

  {#if results}
    <div id="people" role="listbox" aria-label="People" class="people">
      {#each results as person, index (person.id)}
        {@const member = roster.get(person.id)}
        {@const disabled = person.status !== 'ACTIVE'}
        <div
          role="option"
          tabindex="-1"
          aria-selected={picked?.id === person.id}
          aria-disabled={disabled ? 'true' : undefined}
          class="option"
          class:is-picked={picked?.id === person.id}
          class:is-active={active === index}
          class:is-disabled={disabled}
          onclick={() => choose(person)}
          onkeydown={(event) => event.key === 'Enter' && choose(person)}
        >
          <span style:opacity={disabled ? 0.5 : 1}><Avatar {person} /></span>
          <div class="option__text">
            <span class="option__name">{nameOf(person)}</span>
            <span class="option__meta">{person.username}{#if member}&nbsp;· already a member ({permissionLabel(member.permission)}){/if}</span>
          </div>
          {#if disabled}
            <Badge kind="user" status={person.status} />
          {:else if picked?.id === person.id}
            <span class="check"><Icon name="check" /></span>
          {/if}
        </div>
      {:else}
        <p class="nobody">{searching ? 'Searching…' : 'Nobody matches. They may need to sign in to the app first.'}</p>
      {/each}
    </div>
  {/if}

  <div class="pk-field">
    <label class="pk-label" for="permission">Permission</label>
    <select id="permission" class="pk-select" bind:value={permission}>
      {#each permissions as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
    </select>
    <span class="pk-hint">Can view: see and download. Can edit: also upload files and run jobs. Owners also manage members and settings.</span>
  </div>

  {#if existing}
    <div class="pk-banner pk-banner--info">
      <Icon name="info" />
      <span class="pk-banner__text">
        {#if existing.permission === permission}
          {firstName} already has {permissionLabel(permission)}. Pick another permission to change it.
        {:else}
          {firstName} is already a member. This changes their permission from {permissionLabel(existing.permission)} to {permissionLabel(permission)} — no email is sent.
        {/if}
      </span>
    </div>
  {:else if picked}
    <p class="pk-hint">{firstName} gets an email saying you added them.</p>
  {/if}

  {#if error}
    <div class="pk-banner pk-banner--danger" role="alert"><Icon name="alert" /><span class="pk-banner__text">{error}</span></div>
  {/if}

  {#snippet actions()}
    <button type="button" class="pk-btn" onclick={onclose} disabled={busy}>Cancel</button>
    <button type="submit" class="pk-btn pk-btn--solid" disabled={!picked || busy || (existing && existing.permission === permission)}>
      {#if busy}<span class="pk-spinner"></span>{/if}{existing ? 'Change permission' : 'Add member'}
    </button>
  {/snippet}
</Modal>

<style>
  .people {
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 260px;
    overflow-y: auto;
  }
  .option {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    border-radius: 5px;
    cursor: pointer;
  }
  .option:hover,
  .option.is-active {
    background: var(--surface-hover);
  }
  .option.is-picked {
    background: var(--primary-soft);
  }
  .option.is-disabled {
    cursor: not-allowed;
  }
  .option__text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .option__name {
    font-weight: 500;
  }
  .is-disabled .option__name {
    color: var(--ink-muted);
  }
  .option__meta {
    font-size: 13px;
    color: var(--ink-muted);
  }
  .check {
    color: var(--link);
    display: inline-flex;
  }
  .nobody {
    padding: 10px;
    font-size: 14px;
    color: var(--ink-muted);
  }
</style>
