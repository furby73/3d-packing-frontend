<script>
  import Icon from '../components/Icon.svelte';
  import IsoArt from '../components/IsoArt.svelte';
  import Logo from '../components/Logo.svelte';
  import { authMessage, resetPassword, signInWithEmail, signInWithGoogle, signUpWithEmail } from '../lib/firebase.js';
  import { session } from '../lib/session.svelte.js';

  const cell = 31;
  const lattice = `M0 0L${(cell * Math.sqrt(3)).toFixed(3)} ${cell}M0 ${cell}L${(cell * Math.sqrt(3)).toFixed(3)} 0M0 0V${cell}M${((cell * Math.sqrt(3)) / 2).toFixed(3)} 0V${cell}M${(cell * Math.sqrt(3)).toFixed(3)} 0V${cell}`;

  let mode = $state('choose');
  let creating = $state(false);
  let email = $state('');
  let password = $state('');
  let busy = $state('');
  let error = $state('');
  let info = $state('');
  let sheetWidth = $state(0);
  let sheetHeight = $state(0);

  const half = $derived(sheetWidth < 720 ? 250 : 330);
  const scale = $derived(Math.max(sheetWidth, sheetHeight, 1) / (half * 2));

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

  function back() {
    mode = 'choose';
    error = '';
    info = '';
  }

  const steps = [
    {
      scene: 'upload',
      title: 'Upload your models',
      body: 'OBJ, STL, 3MF, PLY and glTF, up to 100 MB each, or start from a ready-made sample. Everything but OBJ is converted to OBJ in millimetres for packing.'
    },
    {
      scene: 'container',
      title: 'Set the container',
      body: 'Give its width, length and height in your models’ units, and how many copies of each model you need.'
    },
    {
      scene: 'packed',
      title: 'Get the fewest containers',
      body: 'Every part is placed. A new container opens only when the last one is full, and each one downloads on its own.'
    }
  ];
</script>

<div class="page">
  <section class="hero">
    <div class="sheet" bind:clientWidth={sheetWidth} bind:clientHeight={sheetHeight}>
      <svg class="sheet__svg" viewBox="{-half} {-half} {half * 2} {half * 2}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <pattern id="iso-lattice" width={cell * Math.sqrt(3)} height={cell} patternUnits="userSpaceOnUse">
            <path d={lattice} class="lattice" style:stroke-width={1 / scale} />
          </pattern>
        </defs>
        <rect x={-half * 3} y={-half * 3} width={half * 6} height={half * 6} fill="url(#iso-lattice)" />
        <Logo size={400} crop={false} motion="draw" x="-200" y="-200" class="sheet__mark" />
      </svg>
    </div>

    <div class="brand"><Logo size={28} />3D Packing</div>
    <div class="intro">
      <h1 class="headline">Pack it tight.</h1>
      <p class="lead">
        Upload your 3D models, choose the container size and how many copies you need. The engine packs every part into as few containers as it
        can.
      </p>

      {#if mode === 'choose'}
        <div class="actions">
          <button type="button" class="pk-btn pk-btn--cta" disabled={!!busy} onclick={() => run('google', signInWithGoogle)}>
            {#if busy === 'google'}<span class="pk-spinner on-primary"></span>{:else}<svg class="g" viewBox="0 0 24 24" aria-hidden="true"
                ><path
                  fill="currentColor"
                  d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.62 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.95S8.78 6.28 12 6.28c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.68 3.72 14.55 2.8 12 2.8 6.92 2.8 2.8 6.92 2.8 12s4.12 9.2 9.2 9.2c5.31 0 8.83-3.73 8.83-8.99 0-.6-.07-1.06-.15-1.51Z"
                /></svg
              >{/if}
            Continue with Google
          </button>
          <button type="button" class="pk-btn outline" disabled={!!busy} onclick={() => (mode = 'email')}>
            <Icon name="mail" />Continue with email
          </button>
        </div>
        <p class="note">New here? Signing in creates your account.</p>
      {:else}
        <form class="email" onsubmit={submit}>
          <div class="email__head">
            <h2>{creating ? 'Create an account' : 'Sign in with email'}</h2>
            <button type="button" class="pk-btn pk-btn--ghost back" onclick={back}>Other options</button>
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
          <div class="email__actions">
            <button type="submit" class="pk-btn pk-btn--solid" disabled={!!busy}>
              {#if busy === 'email'}<span class="pk-spinner on-primary"></span>{/if}{creating ? 'Create account' : 'Sign in'}
            </button>
            {#if !creating}
              <button type="button" class="pk-btn pk-btn--ghost" disabled={!!busy} onclick={forgot}>Forgot password?</button>
            {/if}
            <span class="spacer"></span>
            <button type="button" class="switch" onclick={() => ((creating = !creating), (error = ''), (info = ''))}>
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

  <section class="steps" aria-labelledby="steps-title">
    <h2 id="steps-title" class="sr-only">How packing works</h2>
    <ol>
      {#each steps as step, index (step.scene)}
        <li>
          <IsoArt scene={step.scene} />
          <div class="step__text">
            <h3><span class="step__number">{index + 1}</span>{step.title}</h3>
            <p>{step.body}</p>
          </div>
        </li>
      {/each}
    </ol>
    <p class="team">Projects are shared: invite people as viewers, editors or owners, and everyone sees the same files and results.</p>
  </section>
</div>

<style>
  .page {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--canvas);
    color: var(--ink);
  }
  .hero {
    position: relative;
    min-height: min(780px, 100vh);
    display: flex;
    align-items: center;
    overflow: hidden;
    border-bottom: 1px solid var(--hairline);
  }
  .sheet {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 60%;
    pointer-events: none;
    -webkit-mask-image: radial-gradient(farthest-side at 50% 50%, #000 30%, transparent 100%);
    mask-image: radial-gradient(farthest-side at 50% 50%, #000 30%, transparent 100%);
  }
  .sheet__svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .lattice {
    fill: none;
    stroke: var(--control-line);
  }
  .sheet :global(.sheet__mark) {
    color: var(--ink);
  }
  .intro {
    position: relative;
    width: 100%;
    max-width: 1440px;
    margin: 0 auto;
    padding: 40px clamp(24px, 6vw, 96px) 72px;
  }
  .brand {
    position: absolute;
    z-index: 1;
    top: 32px;
    left: max(clamp(24px, 6vw, 96px), calc((100% - 1440px) / 2 + clamp(24px, 6vw, 96px)));
    display: flex;
    align-items: center;
    gap: 10px;
    font: 600 17px/1 var(--font-sans);
    letter-spacing: -0.2px;
  }
  .headline {
    margin-top: 96px;
    max-width: 9ch;
    font: 700 clamp(56px, 7.4vw, 104px) / 0.94 var(--font-sans);
    letter-spacing: -0.045em;
  }
  .lead {
    max-width: 30rem;
    margin: 28px 0 32px;
    font-size: 18px;
    line-height: 1.5;
    color: var(--ink-muted);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  .g {
    width: 18px;
    height: 18px;
  }
  .outline {
    height: var(--size-control-lg);
    padding: 0 20px;
    border-radius: var(--radius-full);
    border-color: var(--ink);
    background: transparent;
    color: var(--ink);
    font-size: 16px;
  }
  .outline:hover {
    background: var(--surface-hover);
  }
  .on-primary {
    border-color: rgb(255 255 255 / 0.35);
    border-top-color: #fff;
  }
  .note {
    margin-top: 16px;
    font-size: 14px;
    color: var(--ink-muted);
  }
  .email {
    max-width: 440px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 24px;
    border: 1px solid var(--hairline);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }
  .email__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .email__head h2 {
    font: 600 20px/1.4 var(--font-sans);
    letter-spacing: -0.125px;
  }
  .back {
    margin-right: -10px;
    font-size: 14px;
  }
  .email__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .spacer {
    flex: 1;
  }
  .switch {
    border: 0;
    background: none;
    padding: 0;
    color: var(--link);
    font: 500 14px/1 var(--font-sans);
    cursor: pointer;
  }
  .switch:hover {
    text-decoration: underline;
  }
  .message {
    max-width: 440px;
    margin-top: 16px;
  }
  .steps {
    width: 100%;
    max-width: 1440px;
    margin: 0 auto;
    padding: 56px clamp(24px, 6vw, 96px) 64px;
  }
  .steps ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 40px;
  }
  .steps li {
    display: flex;
    flex-direction: column;
    gap: 20px;
    color: var(--ink);
  }
  .step__text {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .steps h3 {
    display: flex;
    align-items: baseline;
    gap: 10px;
    font: 600 20px/1.3 var(--font-sans);
    letter-spacing: -0.125px;
  }
  .step__number {
    font-variant-numeric: tabular-nums;
    color: var(--ink-faint);
  }
  .steps p {
    max-width: 34ch;
    font-size: 16px;
    line-height: 1.5;
    color: var(--ink-muted);
  }
  .steps .team {
    max-width: none;
    margin-top: 48px;
    font-size: 15px;
    color: var(--ink-muted);
  }
  @media (max-width: 900px) {
    .hero {
      flex-direction: column;
      align-items: stretch;
      min-height: 0;
    }
    .sheet {
      position: relative;
      order: -1;
      width: 100%;
      height: 300px;
      -webkit-mask-image: radial-gradient(farthest-side at 50% 50%, #000 45%, transparent 100%);
      mask-image: radial-gradient(farthest-side at 50% 50%, #000 45%, transparent 100%);
    }
    .brand {
      top: 24px;
    }
    .intro {
      position: static;
      padding-top: 8px;
    }
    .headline {
      margin-top: 0;
    }
    .steps ol {
      grid-template-columns: 1fr;
      gap: 32px;
    }
    .steps li {
      flex-direction: row;
      align-items: flex-start;
    }
  }
</style>
