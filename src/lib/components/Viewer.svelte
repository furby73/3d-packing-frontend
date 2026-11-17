<script lang="ts" module>
	export interface Container {
		width: number;
		length: number;
		height: number;
	}
</script>

<script lang="ts">
	import * as THREE from 'three';
	import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
	import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
	import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
	import { modelColor } from '../format';

	let {
		glb = null,
		container = null,
		status = '',
		onerror = () => {}
	}: {
		/** Packed result as GLB (from the API's preview endpoints). */
		glb?: ArrayBuffer | null;
		/** Build volume in model units; drawn as a wireframe box. */
		container?: Container | null;
		/** Text shown over the canvas while there is nothing to draw. */
		status?: string;
		onerror?: (error: unknown) => void;
	} = $props();

	const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

	let canvas: HTMLCanvasElement;
	let scene: THREE.Scene;
	let camera: THREE.PerspectiveCamera;
	let controls: OrbitControls;
	// The engine works Z-up; three.js is Y-up. Everything we draw lives in this group.
	let world: THREE.Group;
	let generation = 0;

	$effect(() => {
		const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.setClearColor(0x0a0e13);
		scene = new THREE.Scene();
		camera = new THREE.PerspectiveCamera(40, 1, 0.1, 10000);
		camera.position.set(3, 2.5, 3);
		camera.add(new THREE.DirectionalLight(0xffffff, 1.8));
		scene.add(camera, new THREE.HemisphereLight(0xffffff, 0x1b2330, 1.2));
		world = new THREE.Group();
		world.rotation.x = -Math.PI / 2;
		scene.add(world);
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

		let frame = 0;
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
		show(glb, container);
	});

	function clear() {
		world?.traverse((child) => {
			const mesh = child as THREE.Mesh;
			if (mesh.geometry) mesh.geometry.dispose();
			const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
			if (Array.isArray(material)) material.forEach((m) => m.dispose());
			else material?.dispose();
		});
		world?.clear();
	}

	async function show(buffer: ArrayBuffer | null, box: Container | null) {
		const current = ++generation;
		if (!buffer) {
			clear();
			return;
		}
		let model: THREE.Object3D;
		try {
			// parseAsync may detach the buffer; give it a copy so a re-render can parse again.
			model = (await loader.parseAsync(buffer.slice(0), '')).scene;
		} catch (error) {
			if (current === generation) onerror(error);
			return;
		}
		if (current !== generation) return;
		clear();

		// One colour per distinct model: copies share a geometry (instanced or not).
		const colors = new Map<string, THREE.Color>();
		model.traverse((child) => {
			const mesh = child as THREE.Mesh;
			if (!mesh.isMesh) return;
			const key = mesh.geometry.uuid;
			if (!colors.has(key)) colors.set(key, new THREE.Color(modelColor(colors.size)));
			mesh.material = new THREE.MeshStandardMaterial({
				color: colors.get(key),
				flatShading: true,
				roughness: 0.7,
				metalness: 0.05,
				polygonOffset: true,
				polygonOffsetFactor: 1,
				polygonOffsetUnits: 1
			});
			const edges = new THREE.LineSegments(
				new THREE.EdgesGeometry(mesh.geometry, 30),
				new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })
			);
			if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
				// Edges for instanced meshes would need their own instancing; skip them.
				edges.geometry.dispose();
			} else {
				mesh.add(edges);
			}
		});
		world.add(model);
		world.updateMatrixWorld(true);

		const local = new THREE.Box3();
		model.traverse((child) => {
			const mesh = child as THREE.Mesh;
			if (!mesh.isMesh) return;
			mesh.geometry.computeBoundingBox();
			const inst = mesh as THREE.InstancedMesh;
			if (inst.isInstancedMesh) {
				inst.computeBoundingBox();
				local.union(inst.boundingBox!.clone().applyMatrix4(mesh.matrixWorld));
			} else {
				local.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld));
			}
		});
		// Back into the Z-up frame of the engine.
		const inverse = world.matrixWorld.clone().invert();
		const bounds = local.clone().applyMatrix4(inverse);

		let frameBox = bounds.clone();
		if (box) {
			// Containers start at the origin in the engine's frame; when the preview was
			// recentred, fall back to sitting the container on the model's lower corner.
			const size = new THREE.Vector3(box.width, box.length, box.height);
			const origin = new THREE.Box3(new THREE.Vector3(), size.clone());
			const slack = size.length() * 0.02;
			const fits = origin.clone().expandByScalar(slack).containsBox(bounds);
			const min = fits ? new THREE.Vector3() : bounds.min.clone();
			const containerBox = new THREE.Box3(min, min.clone().add(size));
			const helper = new THREE.Box3Helper(containerBox, new THREE.Color(0x5a6b82));
			world.add(helper);
			frameBox = frameBox.union(containerBox);
		}

		const worldBox = frameBox.clone().applyMatrix4(world.matrixWorld);
		const center = worldBox.getCenter(new THREE.Vector3());
		const radius = worldBox.getSize(new THREE.Vector3()).length() / 2 || 1;
		camera.near = radius / 100;
		camera.far = radius * 100;
		camera.position
			.copy(center)
			.add(new THREE.Vector3(1, 0.75, 1.2).normalize().multiplyScalar(radius * 3.3));
		camera.updateProjectionMatrix();
		controls.target.copy(center);
	}
</script>

<div class="viewer">
	<canvas bind:this={canvas}></canvas>
	{#if status}<p class="status small muted">{status}</p>{/if}
	<div class="hints">
		<span>Drag to rotate</span>
		<span>Scroll to zoom</span>
	</div>
</div>

<style>
	.viewer {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 420px;
		border-radius: var(--radius-card);
		overflow: hidden;
		background: var(--color-scene-bg);
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
		position: absolute;
		inset: 0;
	}
	.status {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		pointer-events: none;
	}
	.hints {
		position: absolute;
		left: 10px;
		bottom: 10px;
		display: flex;
		gap: 6px;
		pointer-events: none;
	}
	.hints span {
		padding: 2px 8px;
		font-size: 12px;
		line-height: 18px;
		color: var(--color-muted);
		background: var(--color-surface);
		border: 1px solid var(--color-line);
		border-radius: 4px;
	}
</style>
