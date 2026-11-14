<script>
  import Icon from '../../components/Icon.svelte';
  import { api } from '../../lib/api.js';
  import { plural } from '../../lib/format.js';
  import { refreshProjectIndex } from '../../lib/session.svelte.js';
  import { toast } from '../../lib/toast.svelte.js';
  import { useProject } from './context.svelte.js';

  let { onaction } = $props();

  const { ctx, refresh } = useProject();

  let name = $state(ctx.project.name);
  let saving = $state(false);
  let error = $state('');
  let conflict = $state(false);

  const trimmed = $derived(name.trim());
  const problem = $derived(!trimmed ? 'Enter a name' : trimmed.length > 128 ? 'Up to 128 characters' : '');
  const dirty = $derived(trimmed !== ctx.project.name);

  async function save(event) {
    event.preventDefault();
    if (problem || saving || (!dirty && !conflict)) return;
    saving = true;
    error = '';
    try {
      if (conflict) {
        await refresh();
        conflict = false;
      }
      ctx.project = await api.renameProject(ctx.id, trimmed);
      name = ctx.project.name;
      toast.success('Project renamed');
      refreshProjectIndex();
    } catch (failure) {
      if (failure.concurrentUpdate) conflict = true;
      else error = failure.fieldErrors?.name ?? failure.message;
    } finally {
      saving = false;
    }
  }

  const counts = $derived(ctx.counts);
</script>

<div class="cards">
  <form class="pk-card" aria-labelledby="name-h" onsubmit={save}>
    <h2 id="name-h" class="pk-card__title">Project name</h2>
    <p class="pk-muted lead">Shown to every member. It does not need to be unique.</p>
    {#if conflict}
      <div class="pk-banner pk-banner--danger conflict" role="alert">
        <Icon name="alert" /><span class="pk-banner__text">Someone else changed this — refresh and try again. Your text is kept.</span>
      </div>
    {/if}
    <div class="name-row">
      <div class="pk-field grow">
        <label for="project-name" class="sr-only">Project name</label>
        <input
          id="project-name"
          class="pk-input"
          class:pk-input--error={error || (dirty && problem)}
          disabled={!ctx.active}
          bind:value={name}
          oninput={() => (error = '')}
        />
        {#if error || (dirty && problem)}<span class="pk-error"><Icon name="alert" size={14} />{error || problem}</span>{/if}
        <span class="pk-hint">{ctx.active ? `${trimmed.length} / 128 characters` : 'Re-activate the project to rename it'}</span>
      </div>
      <button type="submit" class="pk-btn pk-btn--solid save" disabled={!ctx.active || !!problem || saving || (!dirty && !conflict)}>
        {#if saving}<span class="pk-spinner"></span>{/if}{conflict ? 'Refresh and retry' : 'Save'}
      </button>
    </div>
  </form>

  <section class="pk-card" aria-labelledby="archive-h">
    <div class="split">
      <div class="split__text">
        {#if ctx.active}
          <h2 id="archive-h" class="pk-card__title">Archive project</h2>
          <p class="body">
            Makes the project read-only for everyone, you included. Members can still view and download files and results. You can re-activate it at
            any time.
          </p>
        {:else}
          <h2 id="archive-h" class="pk-card__title">Re-activate project</h2>
          <p class="body">The project is archived and read-only. Re-activating lets members upload, run jobs and change members again.</p>
        {/if}
      </div>
      {#if ctx.active}
        <button type="button" class="pk-btn" onclick={() => onaction('archive')}><Icon name="archive" />Archive project</button>
      {:else}
        <button type="button" class="pk-btn pk-btn--solid" onclick={() => onaction('activate')}><Icon name="refresh" />Re-activate</button>
      {/if}
    </div>
  </section>

  <section class="pk-card danger-card" aria-labelledby="delete-h">
    <div class="split">
      <div class="split__text">
        <h2 id="delete-h" class="pk-card__title danger-title">Delete project</h2>
        <p class="body">
          {#if counts.files != null && counts.jobs != null && counts.members != null}
            Deletes all {plural(counts.files, 'file')} and {plural(counts.jobs, 'job')} and removes the project for {counts.members === 1
              ? 'you'
              : `all ${counts.members} members`}. This cannot be undone.
          {:else}
            Deletes every file and job and removes the project for all members. This cannot be undone.
          {/if}
        </p>
      </div>
      <button type="button" class="pk-btn pk-btn--danger-ghost outlined" onclick={() => onaction('delete')}><Icon name="trash" />Delete project</button>
    </div>
  </section>
</div>

<style>
  .cards {
    display: flex;
    flex-direction: column;
    gap: 24px;
    max-width: 760px;
    margin-top: 8px;
  }
  .lead {
    margin: 0 0 16px;
    font-size: 14px;
  }
  .conflict {
    margin-bottom: 12px;
  }
  .name-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: flex-start;
  }
  .grow {
    flex: 1 1 320px;
  }
  .save {
    height: 36px;
  }
  .split {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    justify-content: space-between;
    align-items: center;
  }
  .split__text {
    flex: 1 1 360px;
  }
  .body {
    font-size: 15px;
    line-height: 1.5;
    color: var(--ink-secondary);
  }
  .danger-card {
    border-color: var(--danger-soft);
  }
  .danger-title {
    color: var(--danger-ink);
  }
  .outlined {
    border-color: var(--control-line);
  }
</style>
