<script>
  import Avatar from '../components/Avatar.svelte';
  import Badge from '../components/Badge.svelte';
  import Confirm from '../components/Confirm.svelte';
  import Icon from '../components/Icon.svelte';
  import Shell from '../components/Shell.svelte';
  import { api } from '../lib/api.js';
  import { providersOf, resetPassword } from '../lib/firebase.js';
  import { day, nameOf, plural, when } from '../lib/format.js';
  import { session, setMe, signOut } from '../lib/session.svelte.js';
  import { setTheme, theme } from '../lib/theme.svelte.js';
  import { failed, toast } from '../lib/toast.svelte.js';

  const pattern = /^[a-z0-9][a-z0-9._-]*$/;

  const me = $derived(session.me);
  let username = $state(session.me?.username ?? '');
  let displayName = $state(session.me?.displayName ?? '');
  let saving = $state(false);
  let usernameError = $state('');
  let displayError = $state('');
  let deleting = $state(false);
  let owned = $state(null);
  let resetting = $state(false);

  const normalized = $derived(username.trim().toLowerCase());
  const localUsernameProblem = $derived(
    normalized.length < 3 || normalized.length > 64
      ? '3–64 characters'
      : !pattern.test(normalized)
        ? 'Use lowercase letters, digits, . _ and -, starting with a letter or digit'
        : ''
  );
  const dirty = $derived(normalized !== me?.username || (displayName.trim() || null) !== (me?.displayName || null));
  const providers = $derived(providersOf(session.firebaseUser));
  const hasPassword = $derived(providers.includes('password'));

  const providerNames = { 'google.com': 'Google', password: 'Email and password', 'github.com': 'GitHub', 'microsoft.com': 'Microsoft', 'apple.com': 'Apple' };

  function discard() {
    username = me.username;
    displayName = me.displayName ?? '';
    usernameError = '';
    displayError = '';
  }

  async function save(event) {
    event.preventDefault();
    if (localUsernameProblem || displayName.trim().length > 128 || saving) return;
    saving = true;
    usernameError = '';
    displayError = '';
    try {
      const updated = await api.updateMe(normalized, displayName.trim() || null);
      setMe(updated);
      username = updated.username;
      displayName = updated.displayName ?? '';
      toast.success('Profile saved');
    } catch (error) {
      if (error.status === 409) usernameError = 'Username already taken';
      else if (error.fieldErrors?.username) usernameError = error.fieldErrors.username;
      else if (error.fieldErrors?.displayName) displayError = error.fieldErrors.displayName;
      else if (error.status === 422) usernameError = error.message;
      else failed(error);
    } finally {
      saving = false;
    }
  }

  async function openDelete() {
    deleting = true;
    owned = null;
    try {
      const projects = await api.projects({ permission: ['OWNER'], size: 100 });
      const checks = await Promise.all(
        projects.content.map(async (project) => {
          const owners = await api.members(project.id, { permission: ['OWNER'], size: 1 });
          return owners.totalElements <= 1 ? project : null;
        })
      );
      owned = checks.filter(Boolean);
    } catch {
      owned = [];
    }
  }

  async function deleteAccount() {
    await api.deleteMe();
    await signOut('Your account was deleted. Files and jobs you created stay in their projects.');
  }

  async function sendReset() {
    resetting = true;
    try {
      await resetPassword(session.firebaseUser.email);
      toast.success(`Password reset link sent to ${session.firebaseUser.email}`);
    } catch (error) {
      failed(error);
    } finally {
      resetting = false;
    }
  }
</script>

<Shell crumbs={[{ label: 'Profile' }]}>
  {#if me}
    <div class="pk-content stack narrow">
      <div class="who">
        <Avatar person={me} size={56} />
        <div>
          <h1 class="pk-page-title">{nameOf(me)}</h1>
          <p class="pk-page-sub handle">
            {me.username}
            {#if me.role === 'ADMIN'}· <span class="pk-chip pk-chip--owner"><Icon name="shield" size={12} />Admin</span>{/if}
          </p>
        </div>
      </div>

      <form class="pk-card" aria-labelledby="details-h" onsubmit={save}>
        <h2 id="details-h" class="pk-card__title section-title">Your details</h2>
        <div class="grid">
          <div class="pk-field">
            <label class="pk-label" for="username">Username</label>
            <input
              id="username"
              class="pk-input"
              class:pk-input--error={usernameError || (dirty && localUsernameProblem)}
              autocomplete="username"
              autocapitalize="none"
              spellcheck="false"
              bind:value={username}
              oninput={() => (usernameError = '')}
            />
            {#if usernameError || (dirty && localUsernameProblem)}
              <span class="pk-error"><Icon name="alert" size={14} />{usernameError || localUsernameProblem}</span>
            {/if}
            <span class="pk-hint">3–64 characters: lowercase letters, digits, . _ and -. Starts with a letter or digit. Capitals become lowercase.</span>
          </div>
          <div class="pk-field">
            <label class="pk-label" for="display-name">Display name <span class="optional">(optional)</span></label>
            <input id="display-name" class="pk-input" class:pk-input--error={displayError} autocomplete="name" bind:value={displayName} />
            {#if displayError}<span class="pk-error"><Icon name="alert" size={14} />{displayError}</span>{/if}
            <span class="pk-hint">Up to 128 characters. Leave empty to show your username.</span>
          </div>
          <div class="pk-field wide">
            <label class="pk-label" for="email">Email</label>
            <input id="email" class="pk-input" value={me.email} readonly />
            <span class="pk-hint">Managed by your sign-in provider. Other members never see it.</span>
          </div>
        </div>
        <div class="pk-row form-actions">
          <button type="button" class="pk-btn pk-btn--ghost" disabled={!dirty || saving} onclick={discard}>Discard</button>
          <button type="submit" class="pk-btn pk-btn--solid" disabled={!dirty || !!localUsernameProblem || saving}>
            {#if saving}<span class="pk-spinner"></span>{/if}Save changes
          </button>
        </div>
      </form>

      <section class="pk-card" aria-labelledby="account-h">
        <h2 id="account-h" class="pk-card__title section-title">Account</h2>
        <dl class="pk-dl">
          <dt>Role</dt>
          <dd>{me.role === 'ADMIN' ? 'Admin' : 'User'}</dd>
          <dt>Status</dt>
          <dd><Badge kind="user" status={me.status} /></dd>
          <dt>Member since</dt>
          <dd>{day(me.createdAt)}</dd>
          <dt>Last updated</dt>
          <dd>{when(me.updatedAt, { timeAlways: true })}</dd>
          <dt>Last sign-in</dt>
          <dd>{when(me.lastLoginAt, { timeAlways: true })}</dd>
        </dl>
      </section>

      <section class="pk-card" aria-labelledby="signin-h">
        <h2 id="signin-h" class="pk-card__title section-title">Sign-in</h2>
        <dl class="pk-dl">
          <dt>Signed in with</dt>
          <dd>{providers.map((id) => providerNames[id] ?? id).join(', ') || '—'}</dd>
          <dt>Email verified</dt>
          <dd>{session.firebaseUser?.emailVerified ? 'Yes' : 'No'}</dd>
        </dl>
        {#if hasPassword}
          <div class="pk-row reset">
            <button type="button" class="pk-btn" disabled={resetting} onclick={sendReset}>
              {#if resetting}<span class="pk-spinner"></span>{:else}<Icon name="key" />{/if}Send password reset email
            </button>
            <span class="pk-hint">Firebase emails you a link to choose a new password.</span>
          </div>
        {/if}
      </section>

      <section class="pk-card" aria-labelledby="appearance-h">
        <h2 id="appearance-h" class="pk-card__title section-title">Appearance</h2>
        <div class="pk-field theme">
          <label class="pk-label" for="theme">Theme</label>
          <select id="theme" class="pk-select" value={theme.preference} onchange={(event) => setTheme(event.currentTarget.value)}>
            <option value="system">Match the system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          <span class="pk-hint">Saved in this browser only.</span>
        </div>
      </section>

      <section class="pk-card danger-card" aria-labelledby="delete-h">
        <div class="split">
          <div class="split__text">
            <h2 id="delete-h" class="pk-card__title danger-title">Delete account</h2>
            <p class="body">Signs you out and anonymises your profile. Files and jobs you created stay in their projects. This cannot be undone.</p>
          </div>
          <button type="button" class="pk-btn pk-btn--danger-ghost outlined" onclick={openDelete}>Delete account</button>
        </div>
      </section>
    </div>
  {/if}
</Shell>

{#if deleting}
  <Confirm
    title="Delete your account?"
    body="You are signed out and your profile is anonymised. Files and jobs you created stay in their projects."
    confirmLabel="Delete account"
    tone="danger"
    typeToConfirm={me.username}
    typeLabel="Type your username to confirm"
    onclose={() => (deleting = false)}
    onconfirm={deleteAccount}
  >
    {#if owned === null}
      <div class="pk-row checking"><span class="pk-spinner"></span>Checking the projects you own…</div>
    {:else if owned.length > 0}
      <div class="pk-banner pk-banner--danger" style="align-items: flex-start">
        <Icon name="alert" />
        <span class="pk-banner__text">
          You are the only Owner of <b>{plural(owned.length, 'project')}</b>: {owned.map((project) => project.name).join(', ')}. Make another member
          an Owner first, or they will be left without one.
        </span>
      </div>
    {/if}
  </Confirm>
{/if}

<style>
  .narrow {
    max-width: 856px;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .handle {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
  }
  .section-title {
    margin-bottom: 20px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 20px;
  }
  .wide {
    grid-column: 1 / -1;
  }
  .optional {
    font-weight: 400;
    color: var(--ink-muted);
  }
  .form-actions {
    justify-content: flex-end;
    margin-top: 20px;
  }
  .reset {
    margin-top: 16px;
    gap: 12px;
  }
  .theme {
    max-width: 320px;
  }
  .danger-card {
    border-color: var(--danger-soft);
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
  .danger-title {
    color: var(--danger-ink);
  }
  .body {
    font-size: 15px;
    line-height: 1.5;
    color: var(--ink-secondary);
  }
  .outlined {
    border-color: var(--control-line);
  }
  .checking {
    color: var(--ink-muted);
    font-size: 14px;
  }
</style>
