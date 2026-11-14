<script module>
  const c = Math.cos(Math.PI / 6);
  const s = 0.5;

  const project = ([x, y, z]) => [(x - y) * c, (x + y) * s - z];
  const pts = (list) => list.map((point) => project(point).map((value) => value.toFixed(2)).join(',')).join(' ');

  function box([x0, y0, z0], size) {
    const [x1, y1, z1] = [x0 + size, y0 + size, z0 + size];
    return {
      depth: x0 + y0 + z0,
      faces: [
        pts([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]),
        pts([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]),
        pts([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]])
      ]
    };
  }

  function frame([x0, y0, z0], size) {
    const [x1, y1, z1] = [x0 + size, y0 + size, z0 + size];
    const seg = (a, b) => pts([a, b]);
    return {
      hidden: [seg([x0, y0, z0], [x1, y0, z0]), seg([x0, y0, z0], [x0, y1, z0]), seg([x0, y0, z0], [x0, y0, z1])],
      visible: [
        pts([[x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0]]),
        seg([x1, y1, z0], [x1, y1, z1]),
        seg([x0, y1, z1], [x1, y1, z1]),
        seg([x1, y0, z1], [x1, y1, z1])
      ]
    };
  }

  const scenes = {
    upload: () => ({
      frames: [],
      boxes: [box([0, 0, 0], 32)],
      arrows: [[project([16, 16, 74]), project([16, 16, 42])]]
    }),
    container: () => ({ frames: [frame([0, 0, 0], 44)], boxes: [], arrows: [] }),
    packed: () => ({
      frames: [frame([0, 0, 0], 28), frame([56, 0, 0], 28)],
      boxes: [
        box([0, 0, 0], 14),
        box([14, 0, 0], 14),
        box([0, 14, 0], 14),
        box([14, 14, 0], 14),
        box([0, 14, 14], 14),
        box([14, 14, 14], 14),
        box([56, 14, 0], 14)
      ].sort((a, b) => a.depth - b.depth),
      arrows: []
    })
  };
</script>

<script>
  let { scene, size = 112 } = $props();

  const art = $derived(scenes[scene]());
</script>

<svg class="iso-art" viewBox="-62 -66 124 104" width={size} height={size * (104 / 124)} aria-hidden="true">
  <g transform={scene === 'packed' ? 'translate(-24 -28)' : scene === 'upload' ? 'translate(0 -1)' : 'translate(0 -14)'}>
    {#each art.frames as part, index (index)}
      {#each part.hidden as d (d)}<polyline class="hidden" points={d} />{/each}
    {/each}
    {#each art.boxes as cube, index (index)}
      {#each cube.faces as face, faceIndex (faceIndex)}<polygon class="face face-{faceIndex}" points={face} />{/each}
    {/each}
    {#each art.frames as part, index (index)}
      {#each part.visible as d (d)}<polyline points={d} />{/each}
    {/each}
    {#each art.arrows as [tip, tail], index (index)}
      <line x1={tail[0]} y1={tail[1]} x2={tip[0]} y2={tip[1]} />
      <polyline points="{tip[0] - 7},{tip[1] + 9} {tip[0]},{tip[1]} {tip[0] + 7},{tip[1] + 9}" />
    {/each}
  </g>
</svg>

<style>
  .iso-art {
    display: block;
    overflow: visible;
  }
  polyline,
  polygon,
  line {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linejoin: miter;
    stroke-linecap: butt;
  }
  .hidden {
    stroke-dasharray: 3 3;
    opacity: 0.55;
  }
  .face {
    fill: var(--canvas);
  }
  .face-0 {
    fill: color-mix(in srgb, currentColor 6%, var(--canvas));
  }
  .face-1 {
    fill: color-mix(in srgb, currentColor 16%, var(--canvas));
  }
  .face-2 {
    fill: color-mix(in srgb, currentColor 26%, var(--canvas));
  }
</style>
