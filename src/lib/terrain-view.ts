// 3D view for the target search viewer: the photomosaic draped over its DEM, on top of the sidescan.
// Loaded on demand by TargetSearch.astro; data from scripts/build-target-search.py (terrain/).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type Bounds = [number, number, number, number];

interface TerrainInfo {
  bounds: Bounds; // square, local metres
  samples: number; // heights per side
  relief: number; // metres
  contextBounds: Bounds;
}

interface Options {
  exaggeration: number;
  /** Rendering pauses while this returns false (the 3D tab is hidden). */
  isActive: () => boolean;
}

export async function createTerrainView(canvas: HTMLCanvasElement, url: string, info: TerrainInfo, options: Options) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const water = new THREE.Color(0x05081c);
  scene.background = water;
  scene.fog = new THREE.Fog(water, 60, 220);

  const [xmin, ymin, xmax, ymax] = info.bounds;
  const size = xmax - xmin;
  const cx = (xmin + xmax) / 2;
  const cy = (ymin + ymax) / 2;

  const texLoader = new THREE.TextureLoader();
  const loadTex = (name: string, color: boolean) =>
    texLoader.loadAsync(`${url}/${name}`).then((t) => {
      t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return t;
    });
  const [heightsBuf, color, normal, sidescan] = await Promise.all([
    fetch(`${url}/heights.bin`).then((r) => {
      if (!r.ok) throw new Error(`heights.bin: ${r.status}`);
      return r.arrayBuffer();
    }),
    loadTex('color.webp', true),
    loadTex('normal.webp', false),
    loadTex('sidescan.webp', true),
  ]);
  const heights = new Uint16Array(heightsBuf); // millimetres above the floor, rows north to south

  // Terrain mesh: x east, y up, z south (row order of the height grid).
  const n = info.samples;
  const geometry = new THREE.PlaneGeometry(size, size, n - 1, n - 1);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const base = Float32Array.from(heights, (h) => h / 1000);
  function applyExaggeration(k: number) {
    for (let i = 0; i < base.length; i++) pos.setY(i, base[i] * k);
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }
  applyExaggeration(options.exaggeration);

  const terrain = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      map: color,
      normalMap: normal,
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughness: 0.95,
      metalness: 0,
      alphaTest: 0.5,
      transparent: false,
    }),
  );
  scene.add(terrain);

  // Sidescan around it, just below the floor so the photomosaic's edges sit on it.
  const [sx0, sy0, sx1, sy1] = info.contextBounds;
  const ctxSize = sx1 - sx0;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(ctxSize, ctxSize),
    new THREE.MeshBasicMaterial({ map: sidescan, transparent: true, depthWrite: false }),
  );
  ground.rotateX(-Math.PI / 2);
  ground.position.set((sx0 + sx1) / 2 - cx, -0.05, -((sy0 + sy1) / 2 - cy));
  ground.renderOrder = -1;
  scene.add(ground);

  scene.add(new THREE.HemisphereLight(0xd8e8ff, 0x20222e, 1.1));
  const sun = new THREE.DirectionalLight(0xfff6ea, 1.5);
  sun.position.set(-30, 40, -20);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
  // Start looking at the main relief: the highest point of the terrain.
  let peak = 0;
  for (let i = 1; i < heights.length; i++) if (heights[i] > heights[peak]) peak = i;
  const focus = new THREE.Vector3(((peak % n) / (n - 1) - 0.5) * size, 0, (Math.floor(peak / n) / (n - 1) - 0.5) * size);
  camera.position.set(focus.x - 18, 14, focus.z + 22);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(focus);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = 2;
  controls.maxDistance = 120;
  controls.autoRotate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.autoRotateSpeed = 0.5;
  controls.addEventListener('start', () => (controls.autoRotate = false));
  // Keep the orbit centre over the survey.
  controls.addEventListener('change', () => {
    const lim = size / 2;
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -lim, lim);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -lim, lim);
  });

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  let frame = 0;
  const loop = () => {
    frame = requestAnimationFrame(loop);
    if (!options.isActive() || document.hidden) return;
    controls.update();
    renderer.render(scene, camera);
  };
  loop();

  return {
    setExaggeration: applyExaggeration,
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const m = o.material as THREE.MeshStandardMaterial;
          m.map?.dispose();
          m.normalMap?.dispose();
          m.dispose();
        }
      });
      renderer.dispose();
      // Release the WebGL context now, not whenever it's garbage-collected: phones allow few
      // contexts, and a lingering one can leave the next page's 3D viewer blank.
      renderer.forceContextLoss();
    },
  };
}
