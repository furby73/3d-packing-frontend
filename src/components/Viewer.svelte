<script module>
  import * as THREE from 'three';
  import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
  import { STLLoader } from 'three/addons/loaders/STLLoader.js';
  import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
  import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
  import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
  import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

  const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const text = (data) => (typeof data === 'string' ? data : new TextDecoder().decode(data));

  function meshOf(geometry) {
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  }

  async function parse(kind, data) {
    if (kind === 'obj') return new OBJLoader().parse(text(data));
    if (kind === 'stl') return meshOf(new STLLoader().parse(data));
    if (kind === 'ply') return meshOf(new PLYLoader().parse(data));
    if (kind === '3mf') return new ThreeMFLoader().parse(data);
    if (kind === 'glb' || kind === 'gltf') return (await gltfLoader.parseAsync(data, '')).scene;
    throw new Error(`Cannot preview ${kind} files`);
  }

  const views = {
    '3d': new THREE.Vector3(1, 0.8, 1.3),
    top: new THREE.Vector3(0, 1, 0.0001),
    front: new THREE.Vector3(0, 0.0001, 1),
    side: new THREE.Vector3(1, 0.0001, 0)
  };

  const hidden4 = new THREE.Matrix4().makeScale(0, 0, 0);
</script>

<script>
  import { theme } from '../lib/theme.svelte.js';
  import { modelColor } from '../lib/format.js';
  import Icon from './Icon.svelte';

  let {
    source = null,
    subject = null,
    zUp = false,
    items = null,
    containers = null,
    hidden = [],
    focus = null,
    loading = '',
    message = '',
    error = '',
    boundsToggle = false,
    onstats = () => {},
    onerror = () => {},
    chip,
    class: extra = ''
  } = $props();

  let canvas;
  let view = $state('3d');
  let showBounds = $state(true);
  let ready = $state(false);
  let hasModel = $state(false);

  let renderer, scene, camera, controls, world, grid, boxes;
  let model = null;
  let parts = [];
  let generation = 0;
  let framedSubject;

  function css(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function paletteColors() {
    return {
      background: new THREE.Color(css('--surface-sunken', '#f6f5f4')),
      grid: new THREE.Color(css('--hairline', '#e6e6e6')),
      line: new THREE.Color(css('--ink-muted', '#615d59')),
      faint: new THREE.Color(css('--ink-faint', '#a39e98'))
    };
  }

  $effect(() => {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    camera.position.set(2, 1.5, 2.5);
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(0.4, 1, 0.6);
    camera.add(key);
    scene.add(camera, new THREE.HemisphereLight(0xffffff, 0x8a8580, 1.25));
    world = new THREE.Group();
    scene.add(world);
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;

    const resize = () => {
      const { clientWidth, clientHeight } = canvas;
      if (!clientWidth || !clientHeight) return;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let raf;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();
    ready = true;

    return () => {
      ready = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      clearModel();
      clearHelpers();
      controls.dispose();
      renderer.dispose();
    };
  });

  $effect(() => {
    theme.resolved;
    if (!ready) return;
    const colors = paletteColors();
    renderer.setClearColor(colors.background);
    rebuildHelpers();
  });

  $effect(() => {
    if (!ready) return;
    load(source, subject);
  });

  $effect(() => {
    if (!ready) return;
    world.rotation.x = zUp ? -Math.PI / 2 : 0;
  });

  $effect(() => {
    const hiddenSet = new Set(hidden);
    const target = focus;
    if (!ready) return;
    applyVisibility(hiddenSet, target);
    rebuildHelpers();
  });

  $effect(() => {
    const target = focus;
    if (!ready || !model) return;
    frame(target);
  });

  $effect(() => {
    showBounds;
    containers;
    if (ready) rebuildHelpers();
  });

  function clearModel() {
    if (!model) return;
    model.traverse((child) => {
      if (child.isMesh) {
        child.geometry.dispose();
        (Array.isArray(child.material) ? child.material : [child.material]).forEach((material) => material.dispose());
        if (child.isInstancedMesh) child.dispose();
      }
    });
    world.remove(model);
    model = null;
    hasModel = false;
    parts = [];
  }

  function clearHelpers() {
    for (const helper of [grid, boxes]) {
      if (!helper) continue;
      helper.traverse((child) => {
        child.geometry?.dispose();
        child.material?.dispose();
      });
      helper.parent?.remove(helper);
    }
    grid = null;
    boxes = null;
  }

  function itemIndexFor(name, order, used) {
    if (!items?.length) return 0;
    const byName = items.findIndex((item, index) => !used.has(index) && item.name && item.name === name);
    if (byName >= 0) {
      used.add(byName);
      return byName;
    }
    return Math.min(order, items.length - 1);
  }

  function objectItem(objectNumber) {
    if (!items?.length) return 0;
    let cumulative = 0;
    for (let index = 0; index < items.length; index++) {
      cumulative += items[index].copies ?? 1;
      if (objectNumber <= cumulative) return index;
    }
    return items.length - 1;
  }

  function containerOfX(x) {
    if (!containers?.stride || containers.count <= 1) return 0;
    return Math.min(containers.count - 1, Math.max(0, Math.floor(x / containers.stride)));
  }

  function indexParts(root, kind) {
    root.updateMatrixWorld(true);
    const out = [];
    const used = new Set();
    let order = 0;
    let objectNumber = 0;
    const center = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    root.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry.computeBoundingBox();
      const localCenter = child.geometry.boundingBox.getCenter(new THREE.Vector3());
      const name = child.name || child.parent?.name || '';
      if (child.isInstancedMesh) {
        const item = itemIndexFor(name, order++, used);
        const originals = [];
        const containerIndex = [];
        for (let i = 0; i < child.count; i++) {
          child.getMatrixAt(i, matrix);
          originals.push(matrix.clone());
          center.copy(localCenter).applyMatrix4(matrix).applyMatrix4(child.matrixWorld);
          containerIndex.push(containerOfX(center.x));
        }
        out.push({ mesh: child, item, originals, containerIndex });
      } else {
        objectNumber++;
        const bin = /bin_(\d+)_mesh_(\d+)/.exec(name);
        const mesh = /(?:mesh|Object)_(\d+)$/.exec(name);
        let item;
        if (kind === 'obj' && items?.length) item = objectItem(mesh ? Number(mesh[1]) + (name.startsWith('Object_') ? 1 : 0) : objectNumber);
        else item = itemIndexFor(name, order++, used);
        center.copy(localCenter).applyMatrix4(child.matrixWorld);
        const containerIndex = bin ? Number(bin[1]) - 1 : containerOfX(center.x);
        out.push({ mesh: child, item, containerIndex: [containerIndex] });
      }
    });
    return out;
  }

  async function load(next, key) {
    const current = ++generation;
    if (!next) {
      clearModel();
      clearHelpers();
      framedSubject = undefined;
      onstats(null);
      return;
    }
    let root;
    try {
      root = await parse(next.kind, next.data);
    } catch (failure) {
      if (current === generation) onerror(failure);
      return;
    }
    if (current !== generation) return;
    const keepCamera = !!model && key != null && key === framedSubject;
    clearModel();
    model = root;
    hasModel = true;
    parts = indexParts(model, next.kind);
    for (const part of parts) {
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(modelColor(part.item)),
        flatShading: true,
        roughness: 0.75,
        metalness: 0.02
      });
      const previous = part.mesh.material;
      (Array.isArray(previous) ? previous : [previous]).forEach((entry) => entry?.dispose?.());
      part.mesh.material = material;
      if (part.mesh.isInstancedMesh && part.mesh.instanceColor) {
        part.mesh.instanceColor = null;
      }
    }
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const counts = new Map();
    const slots = Math.max(containers?.count ?? 1, 1);
    const perContainer = new Array(slots).fill(0);
    const byContainer = Array.from({ length: slots }, () => ({}));
    let objects = 0;
    for (const part of parts) {
      const n = part.containerIndex.length;
      objects += n;
      counts.set(part.item, (counts.get(part.item) ?? 0) + n);
      part.containerIndex.forEach((index) => {
        if (index >= slots) return;
        perContainer[index]++;
        byContainer[index][part.item] = (byContainer[index][part.item] ?? 0) + 1;
      });
    }
    world.add(model);
    applyVisibility(new Set(hidden), focus);
    rebuildHelpers();
    if (!keepCamera) {
      view = '3d';
      frame(focus);
      framedSubject = key;
    }
    onstats({ objects, size: { x: size.x, y: size.y, z: size.z }, counts: Object.fromEntries(counts), perContainer, byContainer });
  }

  function applyVisibility(hiddenSet, target) {
    for (const part of parts) {
      const itemHidden = hiddenSet.has(part.item);
      if (part.mesh.isInstancedMesh) {
        let any = false;
        part.originals.forEach((matrix, index) => {
          const show = !itemHidden && (target == null || part.containerIndex[index] === target);
          part.mesh.setMatrixAt(index, show ? matrix : hidden4);
          any ||= show;
        });
        part.mesh.instanceMatrix.needsUpdate = true;
        part.mesh.computeBoundingSphere();
        part.mesh.computeBoundingBox();
        part.mesh.visible = any;
      } else {
        part.mesh.visible = !itemHidden && (target == null || part.containerIndex[0] === target);
      }
    }
  }

  function containerBox(index) {
    const { width, length, height, stride } = containers;
    return new THREE.Box3(new THREE.Vector3(index * stride, 0, 0), new THREE.Vector3(index * stride + width, length, height));
  }

  function rebuildHelpers() {
    clearHelpers();
    if (!model) return;
    const colors = paletteColors();
    boxes = new THREE.Group();
    if (showBounds || !boundsToggle) {
      if (containers) {
        for (let index = 0; index < containers.count; index++) {
          if (focus != null && index !== focus) continue;
          const box = containerBox(index);
          const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(...box.getSize(new THREE.Vector3()).toArray()));
          const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: colors.line }));
          lines.position.copy(box.getCenter(new THREE.Vector3()));
          boxes.add(lines);
        }
      } else if (boundsToggle) {
        const box = new THREE.Box3().setFromObject(model);
        world.updateMatrixWorld(true);
        const inverse = world.matrixWorld.clone().invert();
        box.applyMatrix4(inverse);
        const helper = new THREE.Box3Helper(box, colors.line);
        boxes.add(helper);
      }
    }
    world.add(boxes);
    world.updateMatrixWorld(true);
    const worldBox = new THREE.Box3().setFromObject(world);
    if (worldBox.isEmpty()) return;
    const span = Math.max(...worldBox.getSize(new THREE.Vector3()).toArray()) || 1;
    const step = 10 ** Math.floor(Math.log10(span / 4));
    const extent = Math.ceil((span * 1.6) / step) * step;
    grid = new THREE.GridHelper(extent, Math.max(2, Math.round(extent / step)), colors.grid, colors.grid);
    grid.material.transparent = true;
    grid.material.opacity = 0.9;
    const center = worldBox.getCenter(new THREE.Vector3());
    grid.position.set(center.x, worldBox.min.y - span * 0.002, center.z);
    scene.add(grid);
  }

  function targetBox(target) {
    world.updateMatrixWorld(true);
    if (containers && target != null) {
      return containerBox(target).applyMatrix4(world.matrixWorld);
    }
    const box = new THREE.Box3();
    if (model) box.expandByObject(model);
    if (boxes) box.expandByObject(boxes);
    return box;
  }

  function frame(target = focus) {
    const box = targetBox(target);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2 || 1;
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const distance = (radius / Math.sin(fov / 2)) * (camera.aspect < 1 ? 1.25 / camera.aspect : 1.05);
    camera.near = radius / 200;
    camera.far = radius * 200;
    camera.position.copy(center).add(views[view].clone().normalize().multiplyScalar(distance));
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
  }

  function pick(next) {
    view = next;
    frame();
  }
</script>

<div class="pk-viewer viewer {extra}">
  <canvas class="pk-viewer__scene" bind:this={canvas}></canvas>
  {#if hasModel || source}
    <div class="pk-viewer__toolbar" role="group" aria-label="View">
      {#each [['3d', '3D'], ['top', 'Top'], ['front', 'Front'], ['side', 'Side']] as [value, label] (value)}
        <button type="button" class="pk-btn" class:is-active={view === value} aria-pressed={view === value} onclick={() => pick(value)}>{label}</button>
      {/each}
    </div>
    <div class="pk-viewer__actions">
      {#if boundsToggle}
        <button
          type="button"
          class="pk-btn pk-btn--icon"
          aria-label={containers ? 'Show container outlines' : 'Show bounding box'}
          title={containers ? 'Container outlines' : 'Bounding box'}
          aria-pressed={showBounds}
          style:color={showBounds ? 'var(--link)' : undefined}
          onclick={() => (showBounds = !showBounds)}
        >
          <Icon name="box" />
        </button>
      {/if}
      <button type="button" class="pk-btn pk-btn--icon" aria-label="Fit to view" title="Fit to view" onclick={() => frame()}>
        <Icon name="fit" />
      </button>
    </div>
    <span class="pk-viewer__chip pk-viewer__chip--bl hint">Drag to rotate · scroll to zoom</span>
    {#if chip}<span class="pk-viewer__chip pk-viewer__chip--br">{@render chip()}</span>{/if}
  {/if}
  {#if loading || error || (!source && message)}
    <div class="overlay" class:solid={!hasModel}>
      <div class="overlay__card" role={error ? 'alert' : 'status'}>
        {#if loading && !error}<span class="pk-spinner"></span>{/if}
        {#if error}<span class="danger"><Icon name="alert" /></span>{/if}
        <span>{error || loading || message}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .viewer {
    min-height: 0;
  }
  canvas {
    position: absolute;
    inset: 0;
    touch-action: none;
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 16px;
    pointer-events: none;
  }
  .overlay__card {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    max-width: 420px;
    padding: 10px 14px;
    border-radius: var(--radius-md);
    background: var(--surface);
    border: 1px solid var(--hairline);
    box-shadow: var(--shadow-1);
    font-size: 14px;
    color: var(--ink-secondary);
    pointer-events: auto;
  }
  .overlay.solid .overlay__card {
    box-shadow: none;
    background: transparent;
    border-color: transparent;
    color: var(--ink-muted);
  }
  .danger {
    color: var(--danger-ink);
    display: inline-flex;
  }
  @media (max-width: 560px) {
    .hint {
      display: none;
    }
  }
</style>
