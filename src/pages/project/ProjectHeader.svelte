<script>
  import Badge from '../../components/Badge.svelte';
  import Icon from '../../components/Icon.svelte';
  import ProjectIcon from '../../components/ProjectIcon.svelte';
  import { day, nameOf, permissionLabel, relative } from '../../lib/format.js';
  import { useProject } from './context.svelte.js';

  let { tab, onleave, onactivate } = $props();

  const { ctx } = useProject();
  const project = $derived(ctx.project);
  const base = $derived(`/projects/${ctx.id}`);
</script>

<div class="header">
  <div class="top">
    <div class="identity">
      <ProjectIcon {project} size="lg" />
      <div class="titles">
        <h1 class="title">{project.name}</h1>
        <div class="meta">
          <Badge kind="project" status={project.status} />
          <span class="pk-chip" class:pk-chip--owner={ctx.isOwner}>{permissionLabel(project.myPermission)}</span>
          <span>
            {#if ctx.creator}Created by {nameOf(ctx.creator)} ·{/if}
            {day(project.createdAt)} · Updated {relative(project.updatedAt).replace(/^(Just|Yesterday)/, (word) => word.toLowerCase())}
          </span>
        </div>
      </div>
    </div>
    <div class="pk-row">
      {#if ctx.canWrite && tab !== 'settings'}
        <a href="{base}/jobs/new" class="pk-btn pk-btn--cta"><Icon name="play" />Start job</a>
      {/if}
      {#if tab === 'members'}
        <button
          type="button"
          class="pk-btn pk-btn--ghost"
          aria-disabled={!ctx.active || ctx.soleOwner ? 'true' : undefined}
          title={!ctx.active
            ? 'Project is archived'
            : ctx.soleOwner
              ? 'You are the only Owner — make another member an Owner first'
              : 'Leave this project'}
          onclick={() => ctx.active && !ctx.soleOwner && onleave()}
        >
          <Icon name="sign-out" />Leave project
        </button>
      {/if}
    </div>
  </div>

  {#if !ctx.active}
    <div class="pk-banner" role="status">
      <Icon name="archive" />
      <span class="pk-banner__text"><b>This project is archived.</b> Files and results can still be viewed and downloaded; nothing can be changed.</span>
      {#if ctx.isOwner}<button type="button" class="pk-btn" onclick={onactivate}>Re-activate</button>{/if}
    </div>
  {/if}

  <nav class="pk-tabs" aria-label="Project sections">
    <a href="{base}/files" class="pk-tab" class:is-active={tab === 'files'} aria-current={tab === 'files' ? 'page' : undefined}>
      <Icon name="box" />Files{#if ctx.counts.files != null}<span class="pk-tab__count">{ctx.counts.files}</span>{/if}
    </a>
    <a href="{base}/jobs" class="pk-tab" class:is-active={tab === 'jobs'} aria-current={tab === 'jobs' ? 'page' : undefined}>
      <Icon name="play" />Jobs{#if ctx.counts.jobs != null}<span class="pk-tab__count">{ctx.counts.jobs}</span>{/if}
    </a>
    <a href="{base}/members" class="pk-tab" class:is-active={tab === 'members'} aria-current={tab === 'members' ? 'page' : undefined}>
      <Icon name="users" />Members{#if ctx.counts.members != null}<span class="pk-tab__count">{ctx.counts.members}</span>{/if}
    </a>
    {#if ctx.isOwner}
      <a href="{base}/settings" class="pk-tab" class:is-active={tab === 'settings'} aria-current={tab === 'settings' ? 'page' : undefined}>
        <Icon name="sliders" />Settings
      </a>
    {/if}
  </nav>
</div>

<style>
  .header {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }
  .identity {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 0;
  }
  .titles {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .title {
    font: 700 40px/1.1 var(--font-sans);
    letter-spacing: -1px;
    overflow-wrap: anywhere;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--ink-muted);
  }
  .pk-tabs {
    flex-wrap: wrap;
    column-gap: 24px;
    row-gap: 0;
  }
  @media (max-width: 840px) {
    .title {
      font-size: 28px;
      letter-spacing: -0.5px;
    }
  }
</style>
