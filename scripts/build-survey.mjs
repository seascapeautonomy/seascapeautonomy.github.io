#!/usr/bin/env node
/**
 * Prepare a Metashape survey reconstruction for the website's survey replay viewer.
 *
 *   node scripts/build-survey.mjs <cameras.xml> <model.3tz> <output-dir> [--every=2]
 *
 * Input, both exported from the same Metashape chunk:
 *   cameras.xml  File > Export > Export Cameras (Agisoft XML): camera poses and the chunk transform
 *   model.3tz    File > Export > Export Tiled Model, Cesium 3D Tiles 1.1
 *
 * Output:
 *   public/surveys/<name>/tiles/  the tileset, unpacked so the viewer can stream it, with every
 *                                 tile's mesh Draco-compressed and its textures re-encoded as WebP
 *                                 (--no-optimize skips this; --webp-quality=82 sets the quality)
 *
 * Reconstruction noise is removed from the tiles first: at each level of detail, all tiles are welded
 * together and split into connected pieces; small pieces that float above the terrain (over
 * --float-height=0.15 m above its surface) or lie off it are dropped. --no-clean skips this.
 *                                 (<name> is the output directory's name)
 *   <output-dir>/poses.bin        vehicle poses: Float32 records of [t, x, y, z, qx, qy, qz, qw]
 *   <output-dir>/survey.json      metadata: dives, time range, bounds, camera field of view
 *
 * Poses are in the chunk's world frame (Z-up, metres; the tileset's root transform maps the tiles
 * into the same frame), converted to Y-up for three.js.
 *
 * Only dives that lie entirely over the model are kept: every pose must be above the model's
 * footprint (its first level of detail below the root, rasterised on a 1 m grid). Pass
 * --min-overlap=0.95 to allow dives that stray off the model a little.
 *
 * The cameras face down, centred on the vehicle. Vehicle orientation is taken from the camera:
 * "down" is the camera's view direction and "forward" is whichever image axis best matches the
 * direction of travel (detected automatically and reported).
 */
import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, draco, prune, textureCompress } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [camerasPath, tilesPath, outDir] = args.filter((a) => !a.startsWith('--'));
if (!camerasPath || !tilesPath || !outDir) {
  console.error('Usage: node scripts/build-survey.mjs <cameras.xml> <model.3tz> <output-dir> [--every=2]');
  process.exit(1);
}
const EVERY = Number(flags.every ?? 2); // keep every Nth camera pose (~2 Hz source -> ~1 Hz)
const DIVE_GAP_S = 120; // a gap longer than this starts a new dive
const SMOOTH = 3; // half-width (in kept frames) of the pose smoothing window
const MIN_OVERLAP = Number(flags['min-overlap'] ?? 1); // fraction of a dive's poses that must be over the model
const CELL = 1; // footprint grid size, metres
const mb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;

// Metashape world is Z-up; glTF/three.js are Y-up: (x, y, z) -> (x, z, -y).
const toYUp = (x, y, z) => [x, z, -y];

// --- Tiles: unpack into public/ ------------------------------------------------------------

const tilesDir = path.join('public', 'surveys', path.basename(outDir), 'tiles');
console.log(`Unpacking ${tilesPath} (${mb((await stat(tilesPath)).size)}) to ${tilesDir}…`);
await rm(tilesDir, { recursive: true, force: true });
await mkdir(tilesDir, { recursive: true });
// Only the tileset and its tiles; the archive also holds an index and a sample Cesium viewer.
execFileSync('unzip', ['-q', tilesPath, 'tileset.json', 'Data/*', '-d', tilesDir], { stdio: 'inherit' });

const tileset = JSON.parse(await readFile(path.join(tilesDir, 'tileset.json'), 'utf8'));
if (tileset.asset?.version !== '1.1') console.warn(`Expected 3D Tiles 1.1, got ${tileset.asset?.version}`);
const rootTransform = tileset.root.transform ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; // column-major

// Bounds from the root tile (the coarsest level of detail covers the whole model), for framing
// the overview camera: glTF Y-up -> 3D Tiles Z-up (x, -z, y) -> root transform -> Y-up.
const rootUri = tileset.root.content?.uri;
if (!rootUri?.endsWith('.glb')) throw new Error('Expected the root tile to have .glb content.');
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
const p = glbPositions(await readFile(path.join(tilesDir, rootUri)));
const m = rootTransform;
for (let i = 0; i < p.length; i += 3) {
  const [x, y, z] = [p[i], -p[i + 2], p[i + 1]];
  const world = [0, 1, 2].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]);
  toYUp(...world).forEach((v, k) => {
    min[k] = Math.min(min[k], v);
    max[k] = Math.max(max[k], v);
  });
}

// --- Model footprint (plan view), for keeping only dives over the model -------------------------

// The root tile is very coarse; its children give a footprint accurate to a metre or two.
const footprintUris = (tileset.root.children ?? []).map((c) => c.content?.uri).filter((u) => u?.endsWith('.glb'));
if (!footprintUris.length) footprintUris.push(rootUri);
const triangles = []; // [x0, z0, x1, z1, x2, z2] in Y-up world
for (const uri of footprintUris) {
  const { positions, indices } = glbMesh(await readFile(path.join(tilesDir, uri)));
  const world = [];
  for (let i = 0; i < positions.length; i += 3) {
    const [x, y, z] = [positions[i], -positions[i + 2], positions[i + 1]];
    const w = [0, 1, 2].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]);
    const [wx, , wz] = toYUp(...w);
    world.push(wx, wz);
  }
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]];
    triangles.push([world[2 * a], world[2 * a + 1], world[2 * b], world[2 * b + 1], world[2 * c], world[2 * c + 1]]);
  }
}
const gx0 = Math.floor(min[0]) - 2;
const gz0 = Math.floor(min[2]) - 2;
const gw = Math.ceil((max[0] - gx0) / CELL) + 4;
const gh = Math.ceil((max[2] - gz0) / CELL) + 4;
const footprint = new Uint8Array(gw * gh);
for (const [x0, z0, x1, z1, x2, z2] of triangles) {
  // Mark every cell whose centre lies inside the triangle (plan view).
  const area = (x1 - x0) * (z2 - z0) - (x2 - x0) * (z1 - z0);
  if (Math.abs(area) < 1e-9) continue;
  const c0 = Math.max(0, Math.floor((Math.min(x0, x1, x2) - gx0) / CELL));
  const c1 = Math.min(gw - 1, Math.floor((Math.max(x0, x1, x2) - gx0) / CELL));
  const r0 = Math.max(0, Math.floor((Math.min(z0, z1, z2) - gz0) / CELL));
  const r1 = Math.min(gh - 1, Math.floor((Math.max(z0, z1, z2) - gz0) / CELL));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const px = gx0 + (c + 0.5) * CELL;
      const pz = gz0 + (r + 0.5) * CELL;
      const w0 = ((x1 - px) * (z2 - pz) - (x2 - px) * (z1 - pz)) / area;
      const w1 = ((x2 - px) * (z0 - pz) - (x0 - px) * (z2 - pz)) / area;
      if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) footprint[r * gw + c] = 1;
    }
  }
}
const overModel = ([x, , z]) => {
  const c = Math.floor((x - gx0) / CELL);
  const r = Math.floor((z - gz0) / CELL);
  return c >= 0 && r >= 0 && c < gw && r < gh && footprint[r * gw + c] === 1;
};
console.log(`Model footprint: ${footprint.reduce((a, v) => a + v, 0) * CELL * CELL} m² (from ${footprintUris.join(', ')})`);

/** Positions and triangle indices of every primitive in a .glb, merged into one mesh. */
function glbMesh(glb) {
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength));
  const bin = 20 + jsonLength + 8;
  const positions = [];
  const indices = [];
  const read = (accessorIndex, Type, size) => {
    const accessor = json.accessors[accessorIndex];
    const view = json.bufferViews[accessor.bufferView];
    const offset = glb.byteOffset + bin + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return new Type(glb.buffer.slice(offset, offset + accessor.count * size * Type.BYTES_PER_ELEMENT));
  };
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      const base = positions.length / 3;
      const pos = read(prim.attributes.POSITION, Float32Array, 3);
      positions.push(...pos);
      if (prim.indices === undefined) {
        for (let i = 0; i < pos.length / 3; i++) indices.push(base + i);
      } else {
        const type = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array }[json.accessors[prim.indices].componentType];
        for (const i of read(prim.indices, type, 1)) indices.push(base + i);
      }
    }
  }
  return { positions, indices };
}

/** POSITION values of every primitive in a .glb (Metashape writes no node transforms). */
function glbPositions(glb) {
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength));
  const bin = 20 + jsonLength + 8;
  const out = [];
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      const accessor = json.accessors[prim.attributes.POSITION];
      const view = json.bufferViews[accessor.bufferView];
      const offset = bin + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      const values = new Float32Array(glb.buffer.slice(glb.byteOffset + offset, glb.byteOffset + offset + accessor.count * 12));
      out.push(...values);
    }
  }
  return out;
}

// --- Cameras -> vehicle poses ---------------------------------------------------------------

console.log(`Reading ${camerasPath} (${mb((await stat(camerasPath)).size)})…`);
const xml = await readFile(camerasPath, 'utf8');

// The chunk transform maps Metashape's internal frame to the world: world = s * R * p + t.
const chunkTransform = xml.slice(xml.lastIndexOf('<transform>\n'));
const numbers = (tag) => /<\w+[^>]*>([^<]+)</.exec(chunkTransform.slice(chunkTransform.indexOf(`<${tag}`)))[1].trim().split(/\s+/).map(Number);
const chunkR = numbers('rotation'); // row-major 3x3
const chunkT = numbers('translation');
const [chunkS] = numbers('scale');

// Camera transforms are camera -> internal, row-major 4x4. Metashape cameras look down +Z with
// +X right and +Y down the image.
const cameraRe = /<camera id="\d+"[^>]*label="([^"]+)"[^>]*>\s*<transform>([^<]+)<\/transform>/g;
const frames = [];
for (const [, label, transform] of xml.matchAll(cameraRe)) {
  const time = parseTimestamp(label);
  if (time === null) continue;
  const c = transform.trim().split(/\s+/).map(Number);
  const toWorld = (v) => [0, 1, 2].map((r) => chunkR[3 * r] * v[0] + chunkR[3 * r + 1] * v[1] + chunkR[3 * r + 2] * v[2]);
  const col = (k) => toYUp(...toWorld([c[k], c[4 + k], c[8 + k]]));
  const centre = toWorld([c[3], c[7], c[11]]).map((v, k) => chunkS * v + chunkT[k]);
  frames.push({
    time,
    pos: toYUp(...centre),
    right: col(0),
    up: col(1).map((v) => -v), // image "up"
    view: col(2), // viewing direction
  });
}
frames.sort((a, b) => a.time - b.time);
console.log(`Cameras: ${frames.length} aligned, with timestamps`);

/** Metashape image names like PR_20241007_233830_614_FC16 -> epoch ms (camera clock, read as UTC). */
function parseTimestamp(name) {
  const m = /(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_(\d{3})/.exec(name);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +m[7]) : null;
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a) => scale(a, 1 / (Math.hypot(...a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Which image axis points forward? Compare each with the direction of travel.
const votes = { up: 0, right: 0 };
let samples = 0;
for (let i = 1; i < frames.length; i++) {
  const dt = (frames[i].time - frames[i - 1].time) / 1000;
  const move = sub(frames[i].pos, frames[i - 1].pos);
  move[1] = 0; // horizontal travel only
  const dist = Math.hypot(...move);
  if (dt <= 0 || dt > 5 || dist < 0.1) continue;
  const dir = scale(move, 1 / dist);
  votes.up += dot(dir, frames[i].up);
  votes.right += dot(dir, frames[i].right);
  samples++;
}
const axis = Math.abs(votes.up) >= Math.abs(votes.right) ? 'up' : 'right';
const sign = Math.sign(votes[axis]);
console.log(
  `Forward axis: ${sign > 0 ? '+' : '-'}image ${axis} ` +
    `(mean alignment with travel: up ${(votes.up / samples).toFixed(2)}, right ${(votes.right / samples).toFixed(2)})`,
);

// Split into dives at long gaps, keeping every Nth frame.
const dives = [];
let current = null;
frames.forEach((frame, i) => {
  if (!current || (frame.time - frames[i - 1].time) / 1000 > DIVE_GAP_S) {
    current = { frames: [] };
    dives.push(current);
  }
  if (current.frames.length === 0 || i % EVERY === 0) current.frames.push(frame);
});

// Smooth each dive (SfM poses are noisy), then build vehicle orientations.
const records = [];
const diveMeta = [];
for (const [d, dive] of dives.entries()) {
  const fs = dive.frames;
  if (fs.length < 2) continue;
  const overlap = fs.filter((f) => overModel(f.pos)).length / fs.length;
  const label = `Dive ${d + 1} (${new Date(fs[0].time).toISOString().slice(0, 16)}, ${fs.length} poses)`;
  if (overlap < MIN_OVERLAP) {
    console.log(`  skip ${label}: ${(overlap * 100).toFixed(1)}% over the model`);
    continue;
  }
  console.log(`  keep ${label}: ${(overlap * 100).toFixed(1)}% over the model`);
  const first = records.length / 8;
  for (let i = 0; i < fs.length; i++) {
    let pos = [0, 0, 0];
    let fwd = [0, 0, 0];
    let down = [0, 0, 0];
    let n = 0;
    for (let j = Math.max(0, i - SMOOTH); j <= Math.min(fs.length - 1, i + SMOOTH); j++) {
      pos = add(pos, fs[j].pos);
      fwd = add(fwd, scale(fs[j][axis], sign));
      down = add(down, fs[j].view);
      n++;
    }
    pos = scale(pos, 1 / n);
    const up = norm(scale(down, -1));
    const forward = norm(sub(fwd, scale(up, dot(fwd, up)))); // orthogonal to up
    const left = cross(up, forward);
    // Vehicle frame: +Z forward, +Y up, +X left (three.js Object3D with lookAt-style basis).
    const q = quatFromBasis(left, up, forward);
    records.push((fs[i].time - fs[0].time) / 1000, ...pos, ...q);
  }
  diveMeta.push({
    start: new Date(fs[0].time).toISOString(),
    duration: (fs[fs.length - 1].time - fs[0].time) / 1000,
    first,
    count: fs.length,
  });
}

function quatFromBasis(x, y, z) {
  // Columns x, y, z of a rotation matrix -> quaternion [qx, qy, qz, qw].
  const [m00, m10, m20] = x;
  const [m01, m11, m21] = y;
  const [m02, m12, m22] = z;
  const trace = m00 + m11 + m22;
  let qx, qy, qz, qw;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    qw = 0.25 / s;
    qx = (m21 - m12) * s;
    qy = (m02 - m20) * s;
    qz = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }
  return [qx, qy, qz, qw];
}

await mkdir(outDir, { recursive: true });
const posesPath = path.join(outDir, 'poses.bin');
await writeFile(posesPath, Buffer.from(new Float32Array(records).buffer));

// Camera field of view from the calibrated sensor (the first one; the cameras share it).
const calib = xml.slice(xml.indexOf('<calibration'));
const tag = (name) => Number(new RegExp(`<${name}>([^<]+)</${name}>`).exec(calib)[1]);
const [, width, height] = /<resolution width="(\d+)" height="(\d+)"/.exec(calib).map(Number);
const fovDeg = (size) => (2 * Math.atan(size / (2 * tag('f'))) * 180) / Math.PI;

const meta = {
  source: { cameras: path.basename(camerasPath), tiles: path.basename(tilesPath) },
  poseStride: 8,
  poseFields: ['t', 'x', 'y', 'z', 'qx', 'qy', 'qz', 'qw'],
  calibratedFov: { x: fovDeg(width), y: fovDeg(height) },
  bounds: { min, max },
  dives: diveMeta,
};
await writeFile(path.join(outDir, 'survey.json'), JSON.stringify(meta, null, 2) + '\n');
console.log(
  `Wrote ${posesPath}: ${records.length / 8} poses in ${diveMeta.length} dives ` +
    `(${mb(records.length * 4)}); durations ${diveMeta.map((d) => `${(d.duration / 60).toFixed(0)} min`).join(', ')}`,
);

// --- Clean: find floating pieces of reconstruction noise ---------------------------------------
// Pieces are found across all tiles of a level at once, since a rock face cut by a tile boundary
// looks disconnected within one tile but joins the terrain in its neighbour.

const tileFiles = (await readdir(path.join(tilesDir, 'Data'), { recursive: true }))
  .filter((f) => f.endsWith('.glb'))
  .map((f) => path.join(tilesDir, 'Data', f));
/** file -> primitive index -> triangle indices to remove */
const removals = new Map();

if (flags['no-clean'] === undefined) {
  const FLOAT_HEIGHT = Number(flags['float-height'] ?? 0.15); // metres above the terrain surface
  const WELD = 0.002; // metres; vertices this close are the same vertex (also across tile seams)
  const CELL_SIZE = 0.25; // terrain surface grid, metres
  const MAIN_FRACTION = 0.02; // pieces with at least this share of a level's triangles are terrain
  const OFF_MODEL_MAX = 200; // off-terrain pieces are only removed when smaller than this (triangles)

  // World up, in glTF tile coordinates: root rotation row 3 (world Z) in tileset axes, then Z-up -> Y-up.
  const upTile = [m[2], m[6], m[10]];
  const up = norm([upTile[0], upTile[2], -upTile[1]]);
  const ax1 = norm(cross(up, Math.abs(up[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1]));
  const ax2 = cross(up, ax1);

  // Depth of a tile in the tree: top-level files are a.glb (0), b*.glb (1); sub-tilesets restart at a (2).
  const depthOf = (file) => {
    const rel = path.relative(path.join(tilesDir, 'Data'), file);
    return path.basename(rel).charCodeAt(0) - 97 + (rel.includes(path.sep) ? 2 : 0);
  };
  const levels = new Map();
  for (const f of tileFiles) levels.set(depthOf(f), [...(levels.get(depthOf(f)) ?? []), f]);

  let removedTotal = 0;
  let trisTotal = 0;
  for (const [depth, files] of [...levels].sort((a, b) => a[0] - b[0])) {
    // Weld every vertex of the level into one indexed mesh.
    const ids = new Map();
    const xyz = [];
    const tris = []; // [file index, primitive index, triangle index, v0, v1, v2]
    for (const [fi, file] of files.entries()) {
      const prims = glbPrimitives(await readFile(file));
      for (const [pi, { positions, indices }] of prims.entries()) {
        const local = new Int32Array(positions.length / 3);
        for (let i = 0; i < local.length; i++) {
          const x = positions[3 * i], y = positions[3 * i + 1], z = positions[3 * i + 2];
          const key = `${Math.round(x / WELD)},${Math.round(y / WELD)},${Math.round(z / WELD)}`;
          let id = ids.get(key);
          if (id === undefined) {
            id = xyz.length / 3;
            ids.set(key, id);
            xyz.push(x, y, z);
          }
          local[i] = id;
        }
        for (let t = 0; t < indices.length / 3; t++) {
          tris.push(fi, pi, t, local[indices[3 * t]], local[indices[3 * t + 1]], local[indices[3 * t + 2]]);
        }
      }
    }
    const nv = xyz.length / 3;
    const nt = tris.length / 6;
    if (!nt) continue;
    trisTotal += nt;

    // Connected pieces (union-find over triangle edges).
    const parent = Int32Array.from({ length: nv }, (_, i) => i);
    const find = (a) => {
      while (parent[a] !== a) a = parent[a] = parent[parent[a]];
      return a;
    };
    for (let t = 0; t < nt; t++) {
      const [a, b, c] = [find(tris[6 * t + 3]), find(tris[6 * t + 4]), find(tris[6 * t + 5])];
      parent[b] = a;
      parent[find(c)] = a;
    }
    const piece = new Int32Array(nv);
    for (let i = 0; i < nv; i++) piece[i] = find(i);
    const triCount = new Map();
    for (let t = 0; t < nt; t++) {
      const p = piece[tris[6 * t + 3]];
      triCount.set(p, (triCount.get(p) ?? 0) + 1);
    }
    const isMain = (p) => triCount.get(p) >= MAIN_FRACTION * nt;

    // Terrain surface: highest terrain vertex in each grid cell (plan view).
    const h = new Float64Array(nv), cu = new Int32Array(nv), cv = new Int32Array(nv);
    let u0 = Infinity, v0 = Infinity;
    const uu = new Float64Array(nv), vv = new Float64Array(nv);
    for (let i = 0; i < nv; i++) {
      const pt = [xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]];
      h[i] = dot(pt, up);
      uu[i] = dot(pt, ax1);
      vv[i] = dot(pt, ax2);
      u0 = Math.min(u0, uu[i]);
      v0 = Math.min(v0, vv[i]);
    }
    let W = 0;
    for (let i = 0; i < nv; i++) {
      cu[i] = Math.floor((uu[i] - u0) / CELL_SIZE);
      cv[i] = Math.floor((vv[i] - v0) / CELL_SIZE);
      W = Math.max(W, cu[i] + 1);
    }
    const top = new Map();
    for (let i = 0; i < nv; i++) {
      if (!isMain(piece[i])) continue;
      const k = cv[i] * W + cu[i];
      if (!(top.get(k) >= h[i])) top.set(k, h[i]);
    }

    // Classify the other pieces by how far their vertices sit above the terrain below them.
    const above = new Map(); // piece -> heights above terrain
    const total = new Map(); // piece -> vertex count
    for (let i = 0; i < nv; i++) {
      const p = piece[i];
      if (isMain(p)) continue;
      total.set(p, (total.get(p) ?? 0) + 1);
      const t = top.get(cv[i] * W + cu[i]);
      if (t === undefined) continue;
      if (!above.has(p)) above.set(p, []);
      above.get(p).push(h[i] - t);
    }
    const remove = new Set();
    let floating = 0, offModel = 0;
    for (const [p, count] of total) {
      const lifts = above.get(p) ?? [];
      if (lifts.length < 0.5 * count) {
        if (triCount.get(p) < OFF_MODEL_MAX) (remove.add(p), offModel++);
        continue;
      }
      lifts.sort((a, b) => a - b);
      if (lifts[Math.floor(lifts.length / 2)] > FLOAT_HEIGHT) (remove.add(p), floating++);
    }

    let removed = 0;
    for (let t = 0; t < nt; t++) {
      if (!remove.has(piece[tris[6 * t + 3]])) continue;
      const file = files[tris[6 * t]];
      if (!removals.has(file)) removals.set(file, new Map());
      const byPrim = removals.get(file);
      const pi = tris[6 * t + 1];
      if (!byPrim.has(pi)) byPrim.set(pi, new Set());
      byPrim.get(pi).add(tris[6 * t + 2]);
      removed++;
    }
    removedTotal += removed;
    console.log(
      `  level ${depth}: ${files.length} tiles, ${triCount.size} pieces; removing ${floating} floating and ` +
        `${offModel} off-model pieces (${removed} of ${nt} triangles)`,
    );
  }
  console.log(`Cleaning: removing ${removedTotal} of ${trisTotal} triangles (${((100 * removedTotal) / trisTotal).toFixed(1)}%)`);
}

/** Positions and triangle indices of each primitive in a .glb, in document order. */
function glbPrimitives(glb) {
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength));
  const bin = 20 + jsonLength + 8;
  const read = (accessorIndex, Type, size) => {
    const accessor = json.accessors[accessorIndex];
    const view = json.bufferViews[accessor.bufferView];
    const offset = glb.byteOffset + bin + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return new Type(glb.buffer.slice(offset, offset + accessor.count * size * Type.BYTES_PER_ELEMENT));
  };
  const out = [];
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      const positions = read(prim.attributes.POSITION, Float32Array, 3);
      const indices =
        prim.indices === undefined
          ? Uint32Array.from({ length: positions.length / 3 }, (_, i) => i)
          : read(prim.indices, { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array }[json.accessors[prim.indices].componentType], 1);
      out.push({ positions, indices });
    }
  }
  return out;
}

// --- Write the tiles: cleaned, and optimised for the web -------------------------------------
// Done last: the bounds, footprint and cleaning above read raw vertex positions, which Draco hides.

const optimize = flags['no-optimize'] === undefined;
if (optimize || removals.size) {
  const io = new NodeIO()
    .setLogger(new Logger(Logger.Verbosity.WARN))
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule(), 'draco3d.decoder': await draco3d.createDecoderModule() });
  const quality = Number(flags['webp-quality'] ?? 82);
  const files = optimize ? tileFiles : [...removals.keys()];
  let before = 0;
  let after = 0;
  let done = 0;
  const optimise = async (file) => {
    const size = (await stat(file)).size;
    before += size;
    const doc = await io.read(file);
    const remove = removals.get(file);
    if (remove) {
      const prims = doc.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives().map((prim) => ({ mesh, prim })));
      for (const [pi, tris] of remove) {
        const { mesh, prim } = prims[pi];
        const old = prim.getIndices().getArray();
        const kept = [];
        for (let t = 0; t < old.length / 3; t++) if (!tris.has(t)) kept.push(old[3 * t], old[3 * t + 1], old[3 * t + 2]);
        if (!kept.length) {
          mesh.removePrimitive(prim);
          prim.dispose();
          continue;
        }
        prim.getIndices().setArray(new Uint32Array(kept));
        compactPrimitive(prim); // drop the vertices nothing uses any more
      }
      await doc.transform(prune());
    }
    if (optimize) {
      await doc.transform(
        textureCompress({ encoder: sharp, targetFormat: 'webp', quality }),
        // Tiles are small, so default quantisation (14-bit positions) is far below a millimetre.
        draco({ method: 'edgebreaker' }),
      );
    }
    await io.write(file, doc);
    const written = (await stat(file)).size;
    after += written;
    if (++done % 500 === 0) console.log(`  ${done}/${files.length} tiles`);
  };
  console.log(
    optimize
      ? `Writing ${files.length} tiles (${removals.size} cleaned; Draco meshes, WebP textures at quality ${quality})…`
      : `Writing ${files.length} cleaned tiles…`,
  );
  const queue = [...files];
  await Promise.all(Array.from({ length: 8 }, async () => { while (queue.length) await optimise(queue.pop()); }));
  console.log(`Tiles: ${mb(before)} -> ${mb(after)}`);
}
