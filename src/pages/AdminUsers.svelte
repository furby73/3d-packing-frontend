<script>
  import Avatar from '../components/Avatar.svelte';
  import Badge from '../components/Badge.svelte';
  import Confirm from '../components/Confirm.svelte';
  import Icon from '../components/Icon.svelte';
  import Shell from '../components/Shell.svelte';
  import { api } from '../lib/api.js';
  import { nameOf } from '../lib/format.js';
  import { session, setMe } from '../lib/session.svelte.js';
  import { failed } from '../lib/toast.svelte.js';

  const limit = 20;

  let search = $state('');
  let results = $state(null);
  let loading = $state(false);
  let error = $state('');
  let roles = $state({});
  let saved = $state({});
  let pending = $state(null);

  const me = $derived(session.me);
  const term = $derived(search.trim());

  let timer;
  let controller;
  $effect(() => {
    const value = term;
    clearTimeout(timer);
    if (value.length < 3) {
      results = null;
      loading = false;
      return;
    }
    timer = setTimeout(() => find(value), 250);
    return () => clearTimeout(timer);
  });

  async function find(value) {
    controller?.abort();
    controller = new AbortController();
    loading = true;
    error = '';
    try {
      results = await api.searchUsers(value, limit, controller.signal);
    } catch (failure) {
      if (failure.name !== 'AbortError') error = failure.message;
    } finally {
      loading = false;
    }
  }

  const roleOf = (person) => roles[person.id] ?? (person.id === me?.id ? me.role : '');

  function choose(person, role) {
    if (!role || role === roleOf(person)) return;
    pending = { person, role };
  }

  async function apply() {
    const { person, role } = pending;
    try {
      const updated = await api.assignRole(person.id, role);
      roles[person.id] = updated.role;
      saved = { [person.id]: true };
      if (person.id === me.id) setMe({ ...me, role: updated.role });
    } catch (failure) {
      failed(failure);
      throw failure;
    }
  }
</script>

<Shell crumbs={[{ label: 'Admin' }, { label: 'Users' }]}>
  <div class="pk-content stack">
    <div>
      <h1 class="pk-page-title">Users</h1>
      <p class="pk-page-sub">Find a person and change their global role. Admin gives no access to other people's projects.</p>
    </div>
    <div class="pk-field search-field">
      <label class="pk-label" for="user-search">Search people</label>
      <div class="pk-search">
        <Icon name="search" />
        <input id="user-search" class="pk-input" type="search" autocomplete="off" bind:value={search} />
      </div>
      <span class="pk-hint">Username, name or email · at least 3 characters</span>
    </div>

    {#if error}
      <div class="pk-banner pk-banner--danger" role="alert"><Icon name="alert" /><span class="pk-banner__text">{error}</span></div>
    {/if}

    {#if results}
      <div class="pk-table-wrap" class:loading>
        <div style="overflow-x: auto">
          <table class="pk-table" style="min-width: 720px">
            <thead><tr><th>Person</th><th>Status</th><th>Role</th></tr></thead>
            <tbody>
              {#if results.length === 0}
                <tr><td colspan="3" class="pk-table-empty">Nobody matches “{term}”.</td></tr>
              {/if}
              {#each results as person (person.id)}
                <tr class:is-selected={saved[person.id]}>
                  <td>
                    <div class="person">
                      <Avatar {person} />
                      <div class="names">
                        <span class="name">{nameOf(person)}{#if person.id === me?.id}<span class="you"> (you)</span>{/if}</span>
                        <span class="handle">{person.username}</span>
                      </div>
                    </div>
                  </td>
                  <td><Badge kind="user" status={person.status} /></td>
                  <td>
                    <div class="pk-row role">
                      <select
                        class="pk-select role-select"
                        aria-label="Role for {person.username}"
                        value={roleOf(person)}
                        disabled={person.status === 'DELETED'}
                        onchange={(event) => {
                          const value = event.currentTarget.value;
                          event.currentTarget.value = roleOf(person);
                          choose(person, value);
                        }}
                      >
                        {#if !roleOf(person)}<option value="" disabled>Set role…</option>{/if}
                        <option value="USER">User</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                      {#if saved[person.id]}
                        <span class="pk-row saved"><Icon name="check" />Saved — applies on their next request</span>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div class="pk-pager">
          <span>{results.length} {results.length === 1 ? 'person matches' : 'people match'} “{term}” · username matches first</span>
          <span class="small">Shows up to {limit} matches. Deleted accounts never appear. Current roles are not listed — pick one to set it.</span>
        </div>
      </div>
    {:else if loading}
      <div class="pk-row muted"><span class="pk-spinner"></span>Searching…</div>
    {/if}
  </div>
</Shell>

{#if pending}
  <Confirm
    title={pending.role === 'ADMIN' ? `Make ${nameOf(pending.person)} an Admin?` : `Make ${nameOf(pending.person)} a regular User?`}
    body={pending.role === 'ADMIN'
      ? 'Admins can change other people’s roles. It gives no access to projects.'
      : pending.person.id === me?.id
        ? 'You lose access to this page straight away.'
        : 'They can no longer change other people’s roles.'}
    confirmLabel={pending.role === 'ADMIN' ? 'Make Admin' : 'Make User'}
    onclose={() => (pending = null)}
    onconfirm={apply}
  />
{/if}

<style>
  .search-field {
    max-width: 480px;
  }
  .person {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .names {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .name {
    color: var(--ink);
    font-weight: 500;
  }
  .you {
    margin-left: 4px;
    font-weight: 400;
    color: var(--ink-muted);
  }
  .handle {
    font-size: 13px;
    color: var(--ink-muted);
  }
  .role {
    gap: 12px;
  }
  .role-select {
    width: 140px;
    height: 32px;
    padding-top: 4px;
    padding-bottom: 4px;
  }
  .saved {
    gap: 6px;
    font-size: 13px;
    color: var(--success-ink);
  }
  .small {
    font-size: 13px;
  }
  .muted {
    color: var(--ink-muted);
    font-size: 14px;
  }
</style>
