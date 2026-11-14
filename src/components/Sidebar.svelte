<script>
  import { nameOf } from '../lib/format.js';
  import { route } from '../lib/router.svelte.js';
  import { projectIndex, session, signOut } from '../lib/session.svelte.js';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import ProjectIcon from './ProjectIcon.svelte';

  let { onnavigate = () => {} } = $props();

  const me = $derived(session.me);
  const active = $derived(
    route.path === '/' ? 'projects' : route.path.startsWith('/admin') ? 'admin' : route.path.startsWith('/profile') ? 'profile' : ''
  );
  const currentProject = $derived(route.path.match(/^\/projects\/([^/]+)/)?.[1]);
</script>

<nav class="pk-sidebar sidebar" aria-label="Main">
  <a href="/" class="brand" onclick={onnavigate}>3D Packing</a>
  <a href="/" class="pk-nav-row" class:is-active={active === 'projects'} onclick={onnavigate}>
    <Icon name="folder" />Projects
    {#if projectIndex.total != null}<span class="pk-nav-row__count">{projectIndex.total}</span>{/if}
  </a>
  {#if me?.role === 'ADMIN'}
    <a href="/admin/users" class="pk-nav-row" class:is-active={active === 'admin'} onclick={onnavigate}><Icon name="shield" />Admin</a>
  {/if}
  {#if projectIndex.recent.length > 0}
    <div class="pk-sidebar__section">Recently updated</div>
    {#each projectIndex.recent as project (project.id)}
      <a href="/projects/{project.id}" class="pk-nav-row" class:is-active={currentProject === project.id} onclick={onnavigate}>
        <ProjectIcon {project} size="sm" />
        <span class="ellipsis">{project.name}</span>
      </a>
    {/each}
  {/if}
  <div class="spacer"></div>
  {#if me}
    <a href="/profile" class="pk-nav-row user" class:is-active={active === 'profile'} onclick={onnavigate}>
      <Avatar person={me} />
      <span class="who">
        <span class="name ellipsis">{nameOf(me)}</span>
        <span class="handle ellipsis">{me.username}</span>
      </span>
    </a>
  {/if}
  <button type="button" class="pk-nav-row signout" onclick={() => signOut()}><Icon name="sign-out" />Sign out</button>
</nav>

<style>
  .sidebar {
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
  }
  .brand {
    font: 600 17px/1 var(--font-sans);
    letter-spacing: -0.2px;
    padding: 10px 10px 16px;
    color: var(--ink);
  }
  .ellipsis {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .spacer {
    flex: 1 1 auto;
    min-height: 24px;
  }
  .user {
    height: 48px;
  }
  .who {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .name {
    color: var(--ink);
  }
  .handle {
    font-weight: 400;
    font-size: 12px;
    color: var(--ink-muted);
  }
  .signout {
    border: 0;
    background: none;
    width: 100%;
    font-family: inherit;
    text-align: left;
  }
</style>
