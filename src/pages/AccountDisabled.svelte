<script>
  import Icon from '../components/Icon.svelte';
  import Logo from '../components/Logo.svelte';
  import { session, signOut } from '../lib/session.svelte.js';
</script>

<section class="pk-night page">
  <svg class="pk-night__stars" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <circle cx="180" cy="160" r="3" fill="#ffffff66" />
    <circle cx="1240" cy="140" r="4" fill="var(--sticker-sky)" />
    <circle cx="1320" cy="560" r="2" fill="#ffffff80" />
    <circle cx="120" cy="680" r="4" fill="var(--sticker-purple)" />
    <circle cx="1100" cy="760" r="3" fill="#ffffff66" />
    <circle cx="300" cy="420" r="2" fill="#ffffff80" />
  </svg>
  <div class="brand"><Logo size={28} />3D Packing</div>
  <div class="center">
    <div class="body">
      <span class="lock"><Icon name="lock" size={28} /></span>
      <h1>Your account is disabled</h1>
      <p class="pk-night__body">
        You can't open projects or make changes while it is disabled. Accounts are disabled by the people who run this
        service, not from inside the app — contact them if you think this is a mistake.
      </p>
      {#if session.firebaseUser?.email}<p class="who">Signed in as {session.firebaseUser.email}</p>{/if}
      <button type="button" class="pk-btn pk-btn--cta-secondary" onclick={() => signOut()}>Sign out</button>
    </div>
  </div>
</section>

<style>
  .page {
    min-height: 100vh;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .brand {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 32px 48px;
    font: 600 17px/1 var(--font-sans);
    letter-spacing: -0.2px;
    color: #ffffff;
  }
  .center {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px 16px 96px;
  }
  .body {
    max-width: 560px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 20px;
  }
  .lock {
    width: 64px;
    height: 64px;
    border-radius: 16px;
    background: #ffffff1f;
    display: grid;
    place-items: center;
    color: #ffffff;
  }
  h1 {
    font: 700 54px/1.04 var(--font-sans);
    letter-spacing: -1.875px;
  }
  .pk-night__body {
    margin: 0;
  }
  .who {
    font-size: 14px;
    color: #ffffffb3;
  }
  @media (max-width: 840px) {
    h1 {
      font-size: 36px;
      letter-spacing: -1px;
    }
    .brand {
      padding: 24px 20px;
    }
  }
</style>
