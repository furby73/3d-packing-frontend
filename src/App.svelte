<script>
  import { onMount } from 'svelte';
  import Toasts from './components/Toasts.svelte';
  import { interceptLinks, match, route } from './lib/router.svelte.js';
  import { session, startSession } from './lib/session.svelte.js';
  import AccountDisabled from './pages/AccountDisabled.svelte';
  import AdminUsers from './pages/AdminUsers.svelte';
  import ConfigError from './pages/ConfigError.svelte';
  import NotFound from './pages/NotFound.svelte';
  import Profile from './pages/Profile.svelte';
  import ProjectPage from './pages/project/ProjectPage.svelte';
  import Projects from './pages/Projects.svelte';
  import SignIn from './pages/SignIn.svelte';
  import Splash from './pages/Splash.svelte';

  onMount(() => startSession());

  const page = $derived.by(() => {
    const path = route.path.replace(/\/+$/, '') || '/';
    if (path === '/') return { name: 'projects' };
    if (path === '/profile') return { name: 'profile' };
    if (path === '/admin' || path === '/admin/users') return { name: 'admin' };
    const project = match('/projects/:projectId', path) ?? path.match(/^\/projects\/([^/]+)\/.+/);
    if (project) return { name: 'project', projectId: project.projectId ?? decodeURIComponent(project[1]) };
    return { name: 'missing' };
  });
</script>

<svelte:document onclick={interceptLinks} />

{#if session.phase === 'config'}
  <ConfigError />
{:else if session.phase === 'loading' || session.phase === 'deleted'}
  <Splash />
{:else if session.phase === 'signed-out'}
  <SignIn />
{:else if session.phase === 'disabled'}
  <AccountDisabled />
{:else if session.phase === 'error'}
  <Splash error={session.error} />
{:else if page.name === 'projects'}
  <Projects />
{:else if page.name === 'profile'}
  <Profile />
{:else if page.name === 'admin'}
  {#if session.me?.role === 'ADMIN'}<AdminUsers />{:else}<NotFound />{/if}
{:else if page.name === 'project'}
  {#key page.projectId}<ProjectPage projectId={page.projectId} />{/key}
{:else}
  <NotFound />
{/if}

<Toasts />
