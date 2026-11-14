<script>
  import { letterOf, sticker } from '../lib/format.js';

  let { project, size = '' } = $props();
</script>

<span class="pk-project-icon {size ? `pk-project-icon--${size}` : ''} {sticker(project?.id)}" aria-hidden="true">{letterOf(project?.name)}</span>
