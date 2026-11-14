<script>
  import { api } from '../lib/api.js';
  import { plural } from '../lib/format.js';
  import { session } from '../lib/session.svelte.js';
  import Confirm from './Confirm.svelte';
  import Icon from './Icon.svelte';
  import Modal from './Modal.svelte';

  let { dialog, onclose, ondone } = $props();

  let name = $state('');
  let busy = $state(false);
  let error = $state('');
  let conflict = $state(false);
  let counts = $state(null);
  let soleOwner = $state(null);

  const kind = $derived(dialog?.kind);
  const project = $derived(dialog?.project);
  const trimmed = $derived(name.trim());
  const nameProblem = $derived(!trimmed ? 'Enter a name' : trimmed.length > 128 ? 'Up to 128 characters' : '');

  $effect(() => {
    if (!dialog) return;
    name = dialog.kind === 'rename' ? (dialog.project?.name ?? '') : '';
    error = '';
    conflict = false;
    counts = dialog.counts ?? null;
    soleOwner = null;
    if (dialog.kind === 'delete' && !dialog.counts) loadCounts(dialog.project.id);
    if (dialog.kind === 'leave') checkOwners(dialog.project);
  });

  async function loadCounts(projectId) {
    try {
      const [files, jobs, members] = await Promise.all([
        api.files(projectId, { size: 1 }),
        api.jobs(projectId, { size: 1 }),
        api.members(projectId, { size: 1 })
      ]);
      counts = { files: files.totalElements, jobs: jobs.totalElements, members: members.totalElements };
    } catch {
      counts = null;
    }
  }

  async function checkOwners(target) {
    if (target.myPermission !== 'OWNER') {
      soleOwner = false;
      return;
    }
    try {
      const owners = await api.members(target.id, { permission: ['OWNER'], size: 1 });
      soleOwner = owners.totalElements <= 1;
    } catch {
      soleOwner = false;
    }
  }

  async function create() {
    if (nameProblem || busy) return;
    busy = true;
    error = '';
    try {
      const created = await api.createProject(trimmed);
      ondone('create', created);
    } catch (failure) {
      error = failure.fieldErrors?.name ?? failure.message;
    } finally {
      busy = false;
    }
  }

  async function rename() {
    if (nameProblem || busy) return;
    busy = true;
    error = '';
    try {
      if (conflict) {
        await api.project(project.id);
        conflict = false;
      }
      const renamed = await api.renameProject(project.id, trimmed);
      ondone('rename', renamed);
    } catch (failure) {
      if (failure.concurrentUpdate) conflict = true;
      else error = failure.fieldErrors?.name ?? failure.message;
    } finally {
      busy = false;
    }
  }

  const deleteBody = $derived(
    counts
      ? `All ${plural(counts.files, 'file')} and ${plural(counts.jobs, 'job')} are deleted for ${
          counts.members === 1 ? 'you' : `all ${counts.members} members`
        }. This cannot be undone.`
      : 'All files and jobs are deleted for every member. This cannot be undone.'
  );
</script>

{#if kind === 'create'}
  <Modal title="New project" {onclose} {busy} onsubmit={create}>
    <div class="pk-field">
      <label class="pk-label" for="project-name">Name</label>
      <input
        id="project-name"
        class="pk-input"
        class:pk-input--error={error}
        maxlength="200"
        autocomplete="off"
        bind:value={name}
        data-autofocus
      />
      {#if error}<span class="pk-error"><Icon name="alert" size={14} />{error}</span>{/if}
      <span class="pk-hint">Up to 128 characters. You become its Owner.</span>
    </div>
    {#snippet actions()}
      <button type="button" class="pk-btn" onclick={onclose} disabled={busy}>Cancel</button>
      <button type="submit" class="pk-btn pk-btn--solid" disabled={!!nameProblem || busy}>
        {#if busy}<span class="pk-spinner"></span>{/if}Create project
      </button>
    {/snippet}
  </Modal>
{:else if kind === 'rename'}
  <Modal title="Rename project" {onclose} {busy} onsubmit={rename}>
    {#if conflict}
      <div class="pk-banner pk-banner--danger" role="alert">
        <Icon name="alert" /><span class="pk-banner__text">Someone else changed this — refresh and try again. Your text is kept.</span>
      </div>
    {/if}
    <div class="pk-field">
      <label class="pk-label" for="rename-project">Name</label>
      <input id="rename-project" class="pk-input" class:pk-input--error={error} autocomplete="off" bind:value={name} data-autofocus />
      {#if error}<span class="pk-error"><Icon name="alert" size={14} />{error}</span>{/if}
      <span class="pk-hint">{trimmed.length} / 128 characters</span>
    </div>
    {#snippet actions()}
      <button type="button" class="pk-btn" onclick={onclose} disabled={busy}>Cancel</button>
      <button type="submit" class="pk-btn pk-btn--solid" disabled={!!nameProblem || busy || (!conflict && trimmed === project.name)}>
        {conflict ? 'Refresh and retry' : 'Rename'}
      </button>
    {/snippet}
  </Modal>
{:else if kind === 'archive'}
  <Confirm
    title="Archive {project.name}?"
    body="Everyone, you included, can only view and download until it is re-activated. Uploads, jobs and member changes stop."
    confirmLabel="Archive project"
    {onclose}
    onconfirm={async () => {
      await api.disableProject(project.id);
      ondone('archive', project);
    }}
  />
{:else if kind === 'activate'}
  <Confirm
    title="Re-activate {project.name}?"
    body="Members can upload files, run jobs and change members again, each as their permission allows."
    confirmLabel="Re-activate"
    {onclose}
    onconfirm={async () => {
      await api.activateProject(project.id);
      ondone('activate', project);
    }}
  />
{:else if kind === 'delete'}
  <Confirm
    title="Delete {project.name}?"
    body={deleteBody}
    confirmLabel="Delete project"
    tone="danger"
    typeToConfirm={project.name}
    typeLabel="Type the project name to confirm"
    {onclose}
    onconfirm={async () => {
      await api.deleteProject(project.id);
      ondone('delete', project);
    }}
  />
{:else if kind === 'leave'}
  {#if soleOwner === null}
    <Modal title="Leave {project.name}?" {onclose}>
      <div class="pk-row muted"><span class="pk-spinner"></span>Checking the project's owners…</div>
    </Modal>
  {:else if soleOwner}
    <Modal title="You are the only Owner" {onclose}>
      <p class="pk-modal__body">
        {project.name} must keep at least one Owner. Make another member an Owner first, or archive or delete the project instead.
      </p>
      {#snippet actions()}
        <button type="button" class="pk-btn pk-btn--solid" onclick={onclose}>Got it</button>
      {/snippet}
    </Modal>
  {:else}
    <Confirm
      title="Leave {project.name}?"
      body="You lose access straight away. Files and jobs you created stay. An Owner can add you back later."
      confirmLabel="Leave project"
      tone="danger"
      {onclose}
      onconfirm={async () => {
        await api.removeMember(project.id, session.me.id);
        ondone('leave', project);
      }}
    />
  {/if}
{/if}

<style>
  .muted {
    color: var(--ink-muted);
    font-size: 14px;
  }
</style>
