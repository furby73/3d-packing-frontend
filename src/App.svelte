<script>
  import { onMount } from 'svelte';
  import * as THREE from 'three';

  const probePath = '/api/v1/users/me';

  let canvas;
  let apiStatus = $state('pending');

  onMount(() => {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setClearColor(0x0f172a);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.z = 3;

    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x3b82f6 })
    );
    scene.add(cube);
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(2, 3, 4);
    scene.add(light);

    const resize = () => {
      const { clientWidth, clientHeight } = canvas;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    let frame;
    const animate = () => {
      cube.rotation.x += 0.01;
      cube.rotation.y += 0.015;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    fetch(probePath)
      .then((response) => (apiStatus = `${response.status} ${response.statusText}`.trim()))
      .catch(() => (apiStatus = 'unreachable'));

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      renderer.dispose();
    };
  });
</script>

<main>
  <canvas bind:this={canvas}></canvas>
  <p>GET {probePath} → <strong>{apiStatus}</strong></p>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: system-ui, sans-serif;
    background: #0f172a;
    color: #e2e8f0;
  }
  main {
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100vh;
    overflow: hidden;
  }
  canvas {
    display: block;
    width: 100%;
    flex: 1 1 0;
    min-height: 0;
  }
  p {
    margin: 1rem;
  }
</style>
