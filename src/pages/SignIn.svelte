<script>
  import Icon from '../components/Icon.svelte';
  import { authMessage, resetPassword, signInWithEmail, signInWithGoogle, signUpWithEmail } from '../lib/firebase.js';
  import { session } from '../lib/session.svelte.js';

  let mode = $state('choose');
  let creating = $state(false);
  let email = $state('');
  let password = $state('');
  let busy = $state('');
  let error = $state('');
  let info = $state('');

  async function run(kind, action) {
    busy = kind;
    error = '';
    info = '';
    session.notice = '';
    try {
      await action();
    } catch (failure) {
      error = authMessage(failure);
    } finally {
      busy = '';
    }
  }

  const google = () => run('google', signInWithGoogle);

  function submit(event) {
    event.preventDefault();
    run('email', () => (creating ? signUpWithEmail(email.trim(), password) : signInWithEmail(email.trim(), password)));
  }

  function forgot() {
    if (!email.trim()) {
      error = 'Enter your email address first, then ask for the reset link.';
      return;
    }
    run('reset', async () => {
      await resetPassword(email.trim());
      info = `If ${email.trim()} has a password here, a reset link is on its way.`;
    });
  }
</script>

<div class="page">
  <section class="pk-night hero">
    <svg class="pk-night__stars" viewBox="0 0 1440 560" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      <circle cx="980" cy="90" r="4" fill="var(--sticker-sky)" />
      <circle cx="1080" cy="170" r="2" fill="#ffffff99" />
      <circle cx="1190" cy="70" r="5" fill="var(--sticker-pink)" />
      <circle cx="1300" cy="210" r="2" fill="#ffffff80" />
      <circle cx="1120" cy="300" r="3" fill="#ffffffb3" />
      <circle cx="1360" cy="120" r="3" fill="var(--sticker-purple)" />
      <circle cx="900" cy="250" r="2" fill="#ffffff66" />
      <circle cx="1250" cy="400" r="2" fill="#ffffff80" />
      <circle cx="1020" cy="440" r="3" fill="#ffffff66" />
      <rect x="1040" y="230" width="72" height="56" rx="12" fill="var(--sticker-sky)" />
      <rect x="1120" y="250" width="44" height="36" rx="8" fill="var(--sticker-orange)" />
      <rect x="1172" y="222" width="40" height="64" rx="8" fill="var(--sticker-purple)" />
      <rect x="1120" y="214" width="36" height="28" rx="5" fill="var(--sticker-teal)" />
      <rect x="1028" y="294" width="196" height="8" rx="4" fill="#ffffff33" />
    </svg>
    <div class="inner">
      <div class="brand">3D Packing</div>
      <h1 class="pk-night__title">Pack it tight.</h1>
      <p class="pk-night__body">
        Upload your 3D models, run packing jobs on them and share the results with your team — all in one shared project.
      </p>

      {#if mode === 'choose'}
        <div class="pk-row actions">
          <button type="button" class="pk-btn pk-btn--cta" disabled={!!busy} onclick={google}>
            {#if busy === 'google'}<span class="pk-spinner"></span>{:else}<svg class="g" viewBox="0 0 24 24" aria-hidden="true"
                ><path fill="#fff" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z" /><path
                  fill="#fff"
                  opacity=".85"
                  d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"
                /><path fill="#fff" opacity=".7" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14Z" /><path
                  fill="#fff"
                  opacity=".55"
                  d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6Z"
                /></svg
              >{/if}
            Continue with Google
          </button>
          <button type="button" class="pk-btn pk-btn--cta-secondary" disabled={!!busy} onclick={() => (mode = 'email')}>
            <Icon name="mail" />Continue with email
          </button>
        </div>
        <p class="note">New here? Signing in creates your account.</p>
      {:else}
        <form class="pk-card pk-card--raised email" onsubmit={submit}>
          <div class="email-head">
            <h2 class="pk-card__title">{creating ? 'Create an account' : 'Sign in with email'}</h2>
            <button type="button" class="pk-btn pk-btn--ghost back" onclick={() => ((mode = 'choose'), (error = ''), (info = ''))}>
              Other options
            </button>
          </div>
          <div class="pk-field">
            <label class="pk-label" for="email">Email</label>
            <input id="email" class="pk-input" type="email" autocomplete="username" required bind:value={email} />
          </div>
          <div class="pk-field">
            <label class="pk-label" for="password">Password</label>
            <input
              id="password"
              class="pk-input"
              type="password"
              autocomplete={creating ? 'new-password' : 'current-password'}
              minlength={creating ? 6 : undefined}
              required
              bind:value={password}
            />
            {#if creating}<span class="pk-hint">At least 6 characters.</span>{/if}
          </div>
          <div class="pk-row submit-row">
            <button type="submit" class="pk-btn pk-btn--solid" disabled={!!busy}>
              {#if busy === 'email'}<span class="pk-spinner"></span>{/if}{creating ? 'Create account' : 'Sign in'}
            </button>
            {#if !creating}
              <button type="button" class="pk-btn pk-btn--ghost" disabled={!!busy} onclick={forgot}>Forgot password?</button>
            {/if}
            <span class="spacer"></span>
            <button type="button" class="pk-link switch" onclick={() => ((creating = !creating), (error = ''), (info = ''))}>
              {creating ? 'I already have an account' : 'Create an account'}
            </button>
          </div>
        </form>
      {/if}

      {#if error || session.notice}
        <div class="pk-banner pk-banner--danger message" role="alert">
          <Icon name="alert" /><span class="pk-banner__text">{error || session.notice}</span>
        </div>
      {:else if info}
        <div class="pk-banner pk-banner--info message" role="status">
          <Icon name="mail" /><span class="pk-banner__text">{info}</span>
        </div>
      {/if}
    </div>
  </section>

  <section class="features">
    <div class="pk-card feature">
      <span class="pk-project-icon pk-sticker-sky" aria-hidden="true"><Icon name="upload" /></span>
      <h2>Upload models</h2>
      <p>STL, OBJ, STEP, 3MF, PLY, glTF and GLB, up to 100 MB each.</p>
    </div>
    <div class="pk-card feature">
      <span class="pk-project-icon pk-sticker-orange" aria-hidden="true"><Icon name="play" /></span>
      <h2>Run packing jobs</h2>
      <p>Pick the models, copies and container size; get an email when the result is ready.</p>
    </div>
    <div class="pk-card feature">
      <span class="pk-project-icon pk-sticker-purple" aria-hidden="true"><Icon name="users" /></span>
      <h2>Work together</h2>
      <p>Invite people to a project as viewers, editors or owners.</p>
    </div>
  </section>
</div>

<style>
  .page {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .hero {
    padding: 0;
  }
  .inner {
    position: relative;
    max-width: 1120px;
    margin: 0 auto;
    padding: 32px 48px 96px;
  }
  .brand {
    font: 600 17px/1 var(--font-sans);
    letter-spacing: -0.2px;
    color: #ffffff;
    margin-bottom: 120px;
  }
  .actions {
    gap: 12px;
  }
  .g {
    width: 18px;
    height: 18px;
  }
  .note {
    margin-top: 14px;
    font-size: 14px;
    color: #ffffffcc;
  }
  .email {
    max-width: 440px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    color: var(--ink);
  }
  .email-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .email-head .pk-card__title {
    margin: 0;
  }
  .back {
    margin-right: -10px;
    font-size: 14px;
  }
  .submit-row {
    gap: 8px;
  }
  .spacer {
    flex: 1;
  }
  .switch {
    border: 0;
    background: none;
    cursor: pointer;
    font-size: 14px;
    padding: 0;
  }
  .message {
    max-width: 440px;
    margin-top: 16px;
  }
  .features {
    max-width: 1120px;
    width: 100%;
    margin: 0 auto;
    padding: 56px 48px 64px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 24px;
  }
  .feature {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .feature h2 {
    font: 600 20px/1.4 var(--font-sans);
    letter-spacing: -0.125px;
  }
  .feature p {
    font-size: 16px;
    line-height: 1.5;
    color: var(--ink-muted);
  }
  @media (max-width: 840px) {
    .inner {
      padding: 24px 20px 64px;
    }
    .brand {
      margin-bottom: 64px;
    }
    .features {
      padding: 32px 20px 48px;
    }
  }
</style>
