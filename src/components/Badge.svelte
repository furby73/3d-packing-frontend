<script module>
  const styles = {
    project: {
      ACTIVE: ['success', 'Active'],
      DISABLED: ['warning', 'Archived'],
      DELETED: ['danger', 'Deleted']
    },
    job: {
      QUEUED: ['', 'Queued'],
      RUNNING: ['info pk-badge--running', 'Running'],
      SUCCEEDED: ['success', 'Succeeded'],
      FAILED: ['danger', 'Failed'],
      CANCELLED: ['', 'Cancelled']
    },
    user: {
      ACTIVE: ['success', 'Active'],
      DISABLED: ['danger', 'Account disabled'],
      DELETED: ['', 'Deleted']
    }
  };
</script>

<script>
  let { kind, status } = $props();

  const style = $derived(styles[kind]?.[status] ?? ['', status ?? '—']);
</script>

<span class="pk-badge {style[0] ? style[0].split(' ').map((name) => (name.startsWith('pk-') ? name : `pk-badge--${name}`)).join(' ') : ''}">
  <span class="pk-badge__dot"></span>{style[1]}
</span>
