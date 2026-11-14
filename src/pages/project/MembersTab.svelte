<script>
  import Avatar from '../../components/Avatar.svelte';
  import Confirm from '../../components/Confirm.svelte';
  import Filter from '../../components/Filter.svelte';
  import Icon from '../../components/Icon.svelte';
  import Pager from '../../components/Pager.svelte';
  import SortHeader from '../../components/SortHeader.svelte';
  import SortControl from '../../components/SortControl.svelte';
  import { api } from '../../lib/api.js';
  import { day, dayAfter, isDeletedUser, nameOf, permissionLabel, permissions, startOfDay } from '../../lib/format.js';
  import { session } from '../../lib/session.svelte.js';
  import { failed, toast } from '../../lib/toast.svelte.js';
  import AddMemberModal from './AddMemberModal.svelte';
  import { useProject } from './context.svelte.js';

  const { ctx, refresh } = useProject();

  const sorts = [
    { value: 'addedAt', label: 'Date added' },
    { value: 'username', label: 'Username' },
    { value: 'displayName', label: 'Display name' },
    { value: 'permission', label: 'Permission' }
  ];

  let search = $state('');
  let debounced = $state('');
  let permission = $state([]);
  let added = $state({ from: '', to: '' });
  let sort = $state('addedAt');
  let direction = $state('ASC');
  let page = $state(0);
  let size = $state(20);
  let result = $state(null);
  let loading = $state(true);
  let loadError = $state('');
  let adding = $state(false);
  let removing = $state(null);
  let changing = $state('');
  let rowError = $state({});

  const me = $derived(session.me);
  const manage = $derived(ctx.isOwner && ctx.active);
  const filtered = $derived(debounced.length >= 3 || permission.length > 0 || !!(added.from || added.to));

  let timer;
  $effect(() => {
    const value = search.trim();
    clearTimeout(timer);
    timer = setTimeout(() => {
      const next = value.length >= 3 ? value : '';
      if (next !== debounced) {
        debounced = next;
        page = 0;
      }
    }, 250);
    return () => clearTimeout(timer);
  });

  const params = $derived({
    page,
    size,
    search: debounced || undefined,
    permission,
    addedFrom: startOfDay(added.from),
    addedBefore: dayAfter(added.to),
    sort,
    direction
  });

  let generation = 0;
  $effect(() => {
    load(params);
  });

  async function load(query) {
    const current = ++generation;
    loading = true;
    try {
      const next = await api.members(ctx.id, query);
      if (current !== generation) return;
      result = next;
      loadError = '';
    } catch (error) {
      if (current === generation) loadError = error.message;
    } finally {
      if (current === generation) loading = false;
    }
  }

  function resort(nextSort, nextDirection) {
    sort = nextSort;
    direction = nextDirection;
    page = 0;
  }

  function clearFilters() {
    search = '';
    debounced = '';
    permission = [];
    added = { from: '', to: '' };
    page = 0;
  }

  async function change(member, next, select) {
    rowError = {};
    if (member.userId === me.id && member.permission === 'OWNER' && next !== 'OWNER' && ctx.counts.owners <= 1) {
      select.value = member.permission;
      rowError = { [member.userId]: 'Make another member an Owner first' };
      return;
    }
    changing = member.userId;
    try {
      await api.changeMember(ctx.id, member.userId, next);
      toast.success(`${nameOf(member)} now ${next === 'OWNER' ? 'is an Owner' : permissionLabel(next).toLowerCase()}`);
      await Promise.all([load(params), refresh()]);
    } catch (error) {
      select.value = member.permission;
      if (error.status === 409) rowError = { [member.userId]: error.message };
      else failed(error);
    } finally {
      changing = '';
    }
  }

  function afterAdd() {
    adding = false;
    load(params);
    refresh();
  }
</script>

<section class="members">
  <div class="pk-filterbar">
    <div class="pk-search">
      <Icon name="search" />
      <label for="member-search" class="sr-only">Search members</label>
      <input id="member-search" class="pk-input" type="search" placeholder="Username or display name" bind:value={search} />
    </div>
    <Filter label="Permission" options={permissions} value={permission} onchange={(next) => ((permission = next), (page = 0))} />
    <Filter label="Date added" kind="dates" value={added} onchange={(next) => ((added = next), (page = 0))} />
    <span class="pk-filterbar__spacer"></span>
    <SortControl options={sorts} {sort} {direction} onchange={(nextSort, nextDirection) => ((sort = nextSort), (direction = nextDirection), (page = 0))} />
    {#if manage}
      <button type="button" class="pk-btn pk-btn--solid" onclick={() => (adding = true)}><Icon name="plus" />Add member</button>
    {/if}
  </div>
  {#if search.trim().length > 0 && search.trim().length < 3}<p class="pk-hint">Type at least 3 characters to search.</p>{/if}

  {#if loadError && !result}
    <div class="pk-banner pk-banner--danger" role="alert">
      <Icon name="alert" /><span class="pk-banner__text">{loadError}</span><button type="button" class="pk-btn" onclick={() => load(params)}>Retry</button>
    </div>
  {:else}
    <div class="pk-table-wrap" class:loading={loading && result}>
      <div style="overflow-x: auto">
        <table class="pk-table" style="min-width: 720px">
          <thead>
            <tr>
              <SortHeader label="Member" field="username" {sort} {direction} onsort={resort} />
              <SortHeader label="Permission" field="permission" {sort} {direction} onsort={resort} />
              <SortHeader label="Date added" field="addedAt" {sort} {direction} onsort={resort} />
              <th><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {#if !result}
              {#each [1, 2, 3] as row (row)}
                <tr>{#each [1, 2, 3, 4] as cell (cell)}<td><span class="pk-skeleton"></span></td>{/each}</tr>
              {/each}
            {:else if result.content.length === 0}
              <tr>
                <td colspan="4" class="pk-table-empty">
                  {#if filtered}No members match these filters. <button type="button" class="pk-link linkish" onclick={clearFilters}>Clear filters</button>{:else}No members.{/if}
                </td>
              </tr>
            {:else}
              {#each result.content as member (member.userId)}
                {@const deleted = isDeletedUser(member)}
                {@const self = member.userId === me?.id}
                <tr>
                  <td>
                    <div class="person">
                      <Avatar person={{ ...member, id: member.userId }} />
                      <div class="names">
                        {#if deleted}
                          <span class="name muted-name">{member.username}</span>
                          <span class="handle">Deleted account</span>
                        {:else}
                          <span class="name">{nameOf(member)}{#if self}<span class="you"> (you)</span>{/if}</span>
                          <span class="handle">{member.username}</span>
                        {/if}
                      </div>
                    </div>
                  </td>
                  <td>
                    {#if manage && !deleted}
                      <div class="perm">
                        <select
                          class="pk-select perm-select"
                          aria-label="Permission for {member.username}"
                          value={member.permission}
                          disabled={changing === member.userId}
                          onchange={(event) => change(member, event.currentTarget.value, event.currentTarget)}
                        >
                          {#each permissions as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
                        </select>
                        {#if rowError[member.userId]}<span class="pk-error tiny">{rowError[member.userId]}</span>{/if}
                      </div>
                    {:else}
                      <span class="pk-chip" class:pk-chip--owner={member.permission === 'OWNER'}>{permissionLabel(member.permission)}</span>
                    {/if}
                  </td>
                  <td class="date">{day(member.addedAt)}</td>
                  <td class="pk-cell-actions">
                    {#if manage && !self}
                      <button type="button" class="pk-btn pk-btn--danger-ghost" onclick={() => (removing = member)}>Remove</button>
                    {/if}
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
      {#if result && result.totalElements > 0}
        <Pager {page} {size} total={result.totalElements} noun="members" onpage={(next) => (page = next)} onsize={(next) => ((size = next), (page = 0))} />
      {/if}
    </div>
  {/if}
</section>

{#if adding}
  <AddMemberModal onclose={() => (adding = false)} ondone={afterAdd} />
{/if}

{#if removing}
  <Confirm
    title="Remove {isDeletedUser(removing) ? 'this deleted account' : nameOf(removing)}?"
    body="{removing.username} loses access to this project. Files and jobs they created stay."
    confirmLabel="Remove member"
    tone="danger"
    onclose={() => (removing = null)}
    onconfirm={async () => {
      await api.removeMember(ctx.id, removing.userId);
      toast.success(`${nameOf(removing)} was removed`);
      load(params);
      refresh();
    }}
  />
{/if}

<style>
  .members {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .linkish {
    border: 0;
    background: none;
    cursor: pointer;
    font-size: inherit;
    padding: 0;
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
  .muted-name {
    color: var(--ink-muted);
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
  .perm {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .perm-select {
    width: 140px;
    height: 32px;
    padding-top: 4px;
    padding-bottom: 4px;
  }
  .tiny {
    font-size: 12px;
  }
</style>
