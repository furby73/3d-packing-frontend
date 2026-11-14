<script>
  import { untrack } from 'svelte';
  import Icon from '../../components/Icon.svelte';
  import ProjectDialogs from '../../components/ProjectDialogs.svelte';
  import Shell from '../../components/Shell.svelte';
  import { jobLabel } from '../../lib/format.js';
  import { match, navigate, route } from '../../lib/router.svelte.js';
  import { refreshProjectIndex } from '../../lib/session.svelte.js';
  import { toast } from '../../lib/toast.svelte.js';
  import NotFound from '../NotFound.svelte';
  import { createProjectContext } from './context.svelte.js';
  import FilesTab from './FilesTab.svelte';
  import JobDetails from './JobDetails.svelte';
  import JobsTab from './JobsTab.svelte';
  import MembersTab from './MembersTab.svelte';
  import NewJob from './NewJob.svelte';
  import ProjectHeader from './ProjectHeader.svelte';
  import SettingsTab from './SettingsTab.svelte';

  let { projectId } = $props();

  const { ctx, load, refresh } = createProjectContext(untrack(() => projectId));
  load();

  let dialog = $state(null);

  const base = $derived(`/projects/${projectId}`);
  const view = $derived.by(() => {
    const rest = route.path.slice(base.length).replace(/\/+$/, '');
    if (rest === '' || rest === '/files') return { tab: 'files' };
    if (rest === '/jobs') return { tab: 'jobs' };
    if (rest === '/jobs/new') return { tab: 'new-job' };
    const jobMatch = match('/jobs/:jobId', rest);
    if (jobMatch) return { tab: 'job', jobId: jobMatch.jobId };
    if (rest === '/members') return { tab: 'members' };
    if (rest === '/settings') return { tab: 'settings' };
    return { tab: 'missing' };
  });

  const crumbs = $derived.by(() => {
    const name = ctx.project?.name ?? '…';
    const list = [{ label: 'Projects', href: '/' }, { label: name, href: `${base}/files` }];
    if (view.tab === 'jobs') list.push({ label: 'Jobs' });
    if (view.tab === 'new-job') list.push({ label: 'Jobs', href: `${base}/jobs` }, { label: 'New job' });
    if (view.tab === 'job') list.push({ label: 'Jobs', href: `${base}/jobs` }, { label: jobLabel(view.jobId) });
    if (view.tab === 'members') list.push({ label: 'Members' });
    if (view.tab === 'settings') list.push({ label: 'Settings' });
    return list;
  });

  $effect(() => {
    if (ctx.project && view.tab === 'settings' && !ctx.isOwner) navigate(`${base}/files`, { replace: true });
  });

  function done(kind, project) {
    dialog = null;
    refreshProjectIndex();
    if (kind === 'leave' || kind === 'delete') {
      toast.success(kind === 'leave' ? `You left ${project.name}` : `${project.name} was deleted`);
      navigate('/');
      return;
    }
    toast.success(
      { rename: 'Project renamed', archive: `${project.name} is archived`, activate: `${project.name} is active again` }[kind] ?? 'Saved'
    );
    refresh();
  }

  const openDialog = (kind) => (dialog = { kind, project: ctx.project, counts: kind === 'delete' ? { ...ctx.counts } : undefined });
</script>

{#if ctx.missing || view.tab === 'missing'}
  <NotFound kind={ctx.missing ? 'project' : 'page'} />
{:else}
  <Shell {crumbs}>
    <div class="pk-content stack">
      {#if ctx.error}
        <div class="pk-banner pk-banner--danger" role="alert">
          <Icon name="alert" /><span class="pk-banner__text">{ctx.error}</span>
          <button type="button" class="pk-btn" onclick={load}>Retry</button>
        </div>
      {:else if !ctx.project}
        <div class="loading">
          <span class="pk-skeleton" style="width: 48px; height: 48px; border-radius: 12px"></span>
          <span class="pk-skeleton" style="max-width: 320px; height: 32px"></span>
        </div>
      {:else if view.tab === 'new-job'}
        <NewJob />
      {:else if view.tab === 'job'}
        {#key view.jobId}<JobDetails jobId={view.jobId} />{/key}
      {:else}
        <ProjectHeader tab={view.tab} onleave={() => openDialog('leave')} onactivate={() => openDialog('activate')} />
        {#if view.tab === 'files'}
          <FilesTab />
        {:else if view.tab === 'jobs'}
          <JobsTab />
        {:else if view.tab === 'members'}
          <MembersTab />
        {:else if view.tab === 'settings' && ctx.isOwner}
          <SettingsTab onaction={openDialog} />
        {/if}
      {/if}
    </div>
  </Shell>
{/if}

{#if dialog}
  <ProjectDialogs {dialog} onclose={() => (dialog = null)} ondone={done} />
{/if}

<style>
  .loading {
    display: flex;
    align-items: center;
    gap: 16px;
  }
</style>
