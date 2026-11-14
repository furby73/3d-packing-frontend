<script module>
  let loader;
  const load = () => (loader ??= import('./Viewer.svelte'));
</script>

<script>
  let props = $props();
</script>

{#await load()}
  <div class="pk-viewer {props.class ?? ''}"></div>
{:then { default: Viewer }}
  <Viewer {...props} />
{:catch}
  <div class="pk-viewer failed {props.class ?? ''}">The 3D viewer could not load. Reload the page to try again.</div>
{/await}

<style>
  .failed {
    display: grid;
    place-items: center;
    padding: 24px;
    font-size: 14px;
    color: var(--ink-muted);
  }
</style>
