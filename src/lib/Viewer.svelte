<script>
  import * as THREE from 'three';
  import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
  import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
  import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

  let { text = null, glb = null, subject = null, onerror = () => {} } = $props();

  const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

  let canvas;
  let stats = $state(null);
  let scene;
  let camera;
  let controls;
  let model = null;
  let bounds = null;
  let generation = 0;
  let framedSubject;

  $effect(() => {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x0f172a);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
    camera.position.set(2, 1.5, 2.5);
    camera.add(new THREE.DirectionalLight(0xffffff, 1.6));
    scene.add(camera, new THREE.HemisphereLight(0xffffff, 0x334155, 1.1));
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;

    const resize = () => {
      const { clientWidth, clientHeight } = canvas;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / Math.max(clientHeight, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let frame;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      clear();
      controls.dispose();
      renderer.dispose();
    };
  });

  $effect(() => {
    show(text, glb, subject);
  });

  function clear() {
    model?.traverse((child) => {
      if (child.isMesh) {
        child.geometry.dispose();
        child.material.dispose();
        if (child.isInstancedMesh) child.dispose();
      }
    });
    bounds?.dispose();
    if (model) scene.remove(model);
    if (bounds) scene.remove(bounds);
    model = null;
    bounds = null;
  }

  const color = (index) => new THREE.Color().setHSL((index * 0.618034) % 1, 0.6, 0.55);

  async function show(objText, glbBuffer, key) {
    const current = ++generation;
    if (!objText && !glbBuffer) {
      clear();
      stats = null;
      framedSubject = undefined;
      return;
    }
    let next;
    try {
      next = glbBuffer ? (await gltfLoader.parseAsync(glbBuffer, '')).scene : new OBJLoader().parse(objText);
    } catch (error) {
      if (current === generation) onerror(error);
      return;
    }
    if (current !== generation) return;
    const keepCamera = !!model && key != null && key === framedSubject;
    clear();
    model = next;
    let objects = 0;
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.material = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });
      if (child.isInstancedMesh) {
        for (let i = 0; i < child.count; i++) child.setColorAt(i, color(objects++));
        child.instanceColor.needsUpdate = true;
      } else {
        child.material.color = color(objects++);
      }
    });
    scene.add(model);

    const box = new THREE.Box3().setFromObject(model);
    bounds = new THREE.Box3Helper(box, 0x94a3b8);
    scene.add(bounds);

    const size = box.getSize(new THREE.Vector3());
    if (!keepCamera) {
      const center = box.getCenter(new THREE.Vector3());
      const radius = size.length() / 2 || 1;
      camera.near = radius / 100;
      camera.far = radius * 100;
      camera.position.copy(center).add(new THREE.Vector3(1, 0.75, 1.25).normalize().multiplyScalar(radius * 2.6));
      camera.updateProjectionMatrix();
      controls.target.copy(center);
      framedSubject = key;
    }
    stats = { objects, size, volume: size.x * size.y * size.z };
  }

  const fixed = (value) => value.toPrecision(4);
</script>

<div class="viewer">
  <canvas bind:this={canvas}></canvas>
  {#if stats}
    <p class="stats">
      {stats.objects} objects · box {fixed(stats.size.x)} × {fixed(stats.size.y)} × {fixed(stats.size.z)}
      · volume {fixed(stats.volume)}
    </p>
  {/if}
</div>

<style>
  .viewer {
    position: relative;
    width: 100%;
    height: 100%;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .stats {
    position: absolute;
    left: 1rem;
    bottom: 1rem;
    margin: 0;
    padding: 0.4rem 0.7rem;
    border-radius: 6px;
    background: rgb(15 23 42 / 0.8);
    font-size: 0.85rem;
  }
</style>
