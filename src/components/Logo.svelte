<script module>
  const angles = [0, 120, 240];
</script>

<script>
  let { size = 24, stroke = null, crop = true, motion = 'none', label = '', class: extra = '', ...rest } = $props();

  const box = $derived(crop ? '-132 -132 264 264' : '-200 -200 400 400');
  const width = $derived(stroke ?? (crop ? Math.max(4.5, (1.05 * 264) / size) : 4.5));
</script>

<svg
  class="logo {extra}"
  class:draw={motion === 'draw'}
  class:press={motion === 'press'}
  viewBox={box}
  width={size}
  height={size}
  role={label ? 'img' : undefined}
  aria-label={label || undefined}
  aria-hidden={label ? undefined : 'true'}
  style:--stroke={width}
  {...rest}
>
  <g class="cube">
    <polygon pathLength="1" points="0,-62 53.69,-31 53.69,31 0,62 -53.69,31 -53.69,-31" />
    <line pathLength="1" x1="0" y1="0" x2="-53.69" y2="-31" />
    <line pathLength="1" x1="0" y1="0" x2="53.69" y2="-31" />
    <line pathLength="1" x1="0" y1="0" x2="0" y2="62" />
  </g>
  {#each angles as angle, index (angle)}
    <g transform="rotate({angle})">
      <g class="arrow" style:--i={index}>
        <line x1="0" y1="-128" x2="0" y2="-76" />
        <polyline points="-15,-93 0,-75 15,-93" />
      </g>
    </g>
  {/each}
</svg>

<style>
  .logo {
    display: block;
    flex: none;
    overflow: visible;
    color: inherit;
  }
  .logo :global(line),
  .logo :global(polygon),
  .logo :global(polyline) {
    fill: none;
    stroke: currentColor;
    stroke-width: var(--stroke);
    stroke-linecap: butt;
    stroke-linejoin: miter;
    stroke-miterlimit: 10;
  }
  .draw .cube :global(*) {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: draw 0.7s cubic-bezier(0.65, 0, 0.35, 1) forwards;
  }
  .draw .cube :global(line) {
    animation-delay: 0.45s;
    animation-duration: 0.35s;
  }
  .draw .arrow {
    opacity: 0;
    transform: translateY(-46px);
    animation: press 0.55s cubic-bezier(0.2, 0.9, 0.25, 1.15) forwards;
    animation-delay: calc(0.75s + var(--i) * 0.09s);
  }
  .press .arrow {
    animation: breathe 1.4s ease-in-out infinite;
    animation-delay: calc(var(--i) * 0.12s);
  }
  @keyframes draw {
    to {
      stroke-dashoffset: 0;
    }
  }
  @keyframes press {
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @keyframes breathe {
    0%,
    100% {
      transform: translateY(-14px);
      opacity: 0.35;
    }
    50% {
      transform: translateY(0);
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .draw .cube :global(*),
    .draw .arrow,
    .press .arrow {
      animation: none;
      stroke-dashoffset: 0;
      opacity: 1;
      transform: none;
    }
  }
</style>
