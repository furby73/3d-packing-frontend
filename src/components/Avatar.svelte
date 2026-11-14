<script>
  import { initials, isDeletedUser, sticker } from '../lib/format.js';

  let { person, size = 28 } = $props();

  const deleted = $derived(isDeletedUser(person));
</script>

<span
  class="pk-avatar {deleted ? 'pk-avatar--deleted' : sticker(person?.id ?? person?.userId ?? person?.username)}"
  style:width="{size}px"
  style:height="{size}px"
  style:font-size="{Math.round(size * 0.42)}px"
  aria-hidden="true">{initials(person)}</span
>
