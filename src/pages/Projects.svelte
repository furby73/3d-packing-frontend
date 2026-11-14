<script>
  import Badge from '../components/Badge.svelte';
  import Filter from '../components/Filter.svelte';
  import Icon from '../components/Icon.svelte';
  import Menu from '../components/Menu.svelte';
  import Pager from '../components/Pager.svelte';
  import ProjectDialogs from '../components/ProjectDialogs.svelte';
  import ProjectIcon from '../components/ProjectIcon.svelte';
  import Shell from '../components/Shell.svelte';
  import SortHeader from '../components/SortHeader.svelte';
  import SortControl from '../components/SortControl.svelte';
  import { api } from '../lib/api.js';
  import { dayAfter, day, permissionLabel, permissions, relative, startOfDay } from '../lib/format.js';
  import { navigate } from '../lib/router.svelte.js';
  import { refreshProjectIndex, session } from '../lib/session.svelte.js';
  import { failed, toast } from '../lib/toast.svelte.js';

  const sorts = [
    { value: 'createdAt', label: 'Created' },
    { value: 'updatedAt', label: 'Updated' },
    { value: 'name', label: 'Name' },
    { value: 'status', label: 'Status' },
    { value: 'permission', label: 'My permission' },
    { value: 'memberCount', label: 'Members' }
  ];

  let search = $state('');
  let debounced = $state('');
  let status = $state([]);
  let permission = $state([]);
  let created = $state({ from: '', to: '' });
  let updated = $state({ from: '', to: '' });
  let sort = $state('createdAt');
  let direction = $state('DESC');
  let page = $state(0);
  let size = $state(20);
  let result = $state(null);
  let loading = $state(true);
  let loadError = $state('');
  let dialog = $state(null);
  let welcomeHidden = $state(false);

  const me = $derived(session.me);
  const welcomeKey = $derived(me ? `pk-welcomed-${me.id}` : '');
  const showWelcome = $derived(
    !!me && !welcomeHidden && !localStorage.getItem(welcomeKey) && Date.now() - Date.parse(me.createdAt) < 7 * 86_400_000
  );
  const filtered = $derived(
    debounced.length >= 3 || status.length > 0 || permission.length > 0 || !!(created.from || created.to || updated.from || updated.to)
  );
  const empty = $derived(result && result.totalElements === 0 && !filtered);

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
    status,
    permission,
    createdFrom: startOfDay(created.from),
    createdBefore: dayAfter(created.to),
    updatedFrom: startOfDay(updated.from),
    updatedBefore: dayAfter(updated.to),
    sort,
    direction
  });

  let generation = 0;
  $effect(() => {
    load(params);
  });

  async function load(params) {
    const current = ++generation;
    loading = true;
    try {
      const next = await api.projects(params);
      if (current !== generation) return;
      result = next;
      loadError = '';
    } catch (error) {
      if (current === generation) loadError = error.message;
    } finally {
      if (current === generation) loading = false;
    }
  }

  const reload = () => load(params);

  function resort(nextSort, nextDirection) {
    sort = nextSort;
    direction = nextDirection;
    page = 0;
  }

  function clearFilters() {
    search = '';
    debounced = '';
    status = [];
    permission = [];
    created = { from: '', to: '' };
    updated = { from: '', to: '' };
    page = 0;
  }

  function dismissWelcome() {
    localStorage.setItem(welcomeKey, '1');
    welcomeHidden = true;
  }

  function itemsFor(project) {
    const owner = project.myPermission === 'OWNER';
    const active = project.status === 'ACTIVE';
    const items = [{ label: 'Open', icon: 'folder', onselect: () => navigate(`/projects/${project.id}`) }];
    if (owner) {
      items.push({
        label: 'Rename',
        icon: 'pencil',
        disabled: !active,
        title: active ? undefined : 'Project is archived',
        onselect: () => (dialog = { kind: 'rename', project })
      });
      items.push(
        active
          ? { label: 'Archive', icon: 'archive', onselect: () => (dialog = { kind: 'archive', project }) }
          : { label: 'Re-activate', icon: 'refresh', onselect: () => (dialog = { kind: 'activate', project }) }
      );
    }
    items.push({ separator: true });
    items.push({
      label: 'Leave project',
      icon: 'sign-out',
      disabled: !active,
      title: active ? undefined : 'Project is archived',
      onselect: () => (dialog = { kind: 'leave', project })
    });
    if (owner) items.push({ label: 'Delete project', icon: 'trash', danger: true, onselect: () => (dialog = { kind: 'delete', project }) });
    return items;
  }

  function done(kind, project) {
    dialog = null;
    refreshProjectIndex();
    if (kind === 'create') {
      navigate(`/projects/${project.id}`);
      return;
    }
    const messages = {
      rename: 'Project renamed',
      archive: `${project.name} is archived`,
      activate: `${project.name} is active again`,
      delete: `${project.name} was deleted`,
      leave: `You left ${project.name}`
    };
    toast.success(messages[kind]);
    reload();
  }
</script>

<Shell crumbs={[{ label: 'Projects' }]}>
  <div class="pk-content stack">
    {#if showWelcome}
      <div class="pk-banner pk-banner--info" role="status">
        <Icon name="info" />
        <span class="pk-banner__text">Welcome. Your username is <b>{me.username}</b> — you can change it in your profile.</span>
        <a href="/profile" class="pk-btn">Edit profile</a>
        <button type="button" class="pk-btn pk-btn--icon" aria-label="Dismiss" style="color: var(--link)" onclick={dismissWelcome}>
          <Icon name="close" />
        </button>
      </div>
    {/if}

    <div class="pk-page-head">
      <div>
        <h1 class="pk-page-title">Projects</h1>
        {#if !empty}<p class="pk-page-sub">Projects you are a member of</p>{/if}
      </div>
      {#if !empty}
        <button type="button" class="pk-btn pk-btn--cta" onclick={() => (dialog = { kind: 'create' })}><Icon name="plus" />New project</button>
      {/if}
    </div>

    {#if loadError && !result}
      <div class="pk-banner pk-banner--danger" role="alert">
        <Icon name="alert" /><span class="pk-banner__text">{loadError}</span>
        <button type="button" class="pk-btn" onclick={reload}>Retry</button>
      </div>
    {:else if empty}
      <div class="pk-empty empty">
        <svg class="pk-empty__art art" viewBox="0 0 120 72" aria-hidden="true">
          <rect x="1" y="1" width="118" height="70" rx="12" fill="none" stroke="var(--control-line)" stroke-width="2" stroke-dasharray="4 4" />
          <rect x="10" y="26" width="40" height="36" rx="8" fill="var(--sticker-sky)" />
          <rect x="54" y="38" width="28" height="24" rx="5" fill="var(--sticker-orange)" />
          <rect x="86" y="30" width="24" height="32" rx="5" fill="var(--sticker-purple)" />
          <rect x="54" y="18" width="20" height="16" rx="4" fill="var(--sticker-teal)" />
        </svg>
        <h2 class="pk-empty__title">No projects yet</h2>
        <p class="pk-empty__body">
          A project holds your 3D models and the packing jobs you run on them. Create one, or ask a colleague to add you to theirs.
        </p>
        <button type="button" class="pk-btn pk-btn--cta" onclick={() => (dialog = { kind: 'create' })}><Icon name="plus" />New project</button>
      </div>
    {:else}
      <div class="pk-filterbar">
        <div class="pk-search">
          <Icon name="search" />
          <label for="project-search" class="sr-only">Search</label>
          <input id="project-search" class="pk-input" type="search" placeholder="Search by name" bind:value={search} />
        </div>
        <Filter
          label="Status"
          options={[
            { value: 'ACTIVE', label: 'Active' },
            { value: 'DISABLED', label: 'Archived' }
          ]}
          value={status}
          onchange={(next) => ((status = next), (page = 0))}
        />
        <Filter label="My permission" options={permissions} value={permission} onchange={(next) => ((permission = next), (page = 0))} />
        <Filter label="Created" kind="dates" value={created} onchange={(next) => ((created = next), (page = 0))} />
        <Filter label="Updated" kind="dates" value={updated} onchange={(next) => ((updated = next), (page = 0))} />
        <span class="pk-filterbar__spacer"></span>
        {#if result}<span class="count">{result.totalElements} {result.totalElements === 1 ? 'project' : 'projects'}</span>{/if}
        <SortControl options={sorts} {sort} {direction} onchange={(nextSort, nextDirection) => ((sort = nextSort), (direction = nextDirection), (page = 0))} />
      </div>
      {#if search.trim().length > 0 && search.trim().length < 3}<p class="pk-hint">Type at least 3 characters to search.</p>{/if}

      <div class="pk-table-wrap" class:loading={loading && result}>
        <div style="overflow-x: auto">
          <table class="pk-table" style="min-width: 820px">
            <thead>
              <tr>
                <SortHeader label="Name" field="name" {sort} {direction} onsort={resort} />
                <SortHeader label="Status" field="status" {sort} {direction} onsort={resort} />
                <SortHeader label="My permission" field="permission" {sort} {direction} onsort={resort} />
                <SortHeader label="Members" field="memberCount" {sort} {direction} onsort={resort} num />
                <SortHeader label="Created" field="createdAt" {sort} {direction} onsort={resort} />
                <SortHeader label="Updated" field="updatedAt" {sort} {direction} onsort={resort} />
                <th><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {#if !result}
                {#each [1, 2, 3, 4] as row (row)}
                  <tr>{#each [1, 2, 3, 4, 5, 6, 7] as cell (cell)}<td><span class="pk-skeleton"></span></td>{/each}</tr>
                {/each}
              {:else if result.content.length === 0}
                <tr>
                  <td colspan="7" class="pk-table-empty">
                    No projects match these filters. <button type="button" class="pk-link linkish" onclick={clearFilters}>Clear filters</button>
                  </td>
                </tr>
              {:else}
                {#each result.content as project (project.id)}
                  <tr>
                    <td class="pk-cell-main">
                      <a href="/projects/{project.id}" class="name cell-link"><ProjectIcon {project} />{project.name}</a>
                    </td>
                    <td><Badge kind="project" status={project.status} /></td>
                    <td><span class="pk-chip" class:pk-chip--owner={project.myPermission === 'OWNER'}>{permissionLabel(project.myPermission)}</span></td>
                    <td class="pk-num">{project.memberCount}</td>
                    <td class="date">{day(project.createdAt)}</td>
                    <td class="date" title={project.updatedAt}>{relative(project.updatedAt)}</td>
                    <td class="pk-cell-actions"><Menu label="More actions for {project.name}" items={itemsFor(project)} /></td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>
        {#if result && result.totalElements > 0}
          <Pager
            {page}
            {size}
            total={result.totalElements}
            noun="projects"
            onpage={(next) => (page = next)}
            onsize={(next) => ((size = next), (page = 0))}
          />
        {/if}
      </div>
    {/if}
  </div>
</Shell>

{#if dialog}
  <ProjectDialogs {dialog} onclose={() => (dialog = null)} ondone={done} />
{/if}

<style>
  .count {
    font-size: 14px;
    color: var(--ink-muted);
  }
  .name {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .empty {
    padding: 64px 32px;
  }
  .art {
    width: 160px;
    height: 96px;
  }
  .linkish {
    border: 0;
    background: none;
    cursor: pointer;
    font-size: inherit;
    padding: 0;
  }
</style>
