#!/usr/bin/env node
/**
 * Prepare a Metashape survey reconstruction for the website's survey replay viewer.
 *
 *   node scripts/build-survey.mjs <reconstruction.dae> <output-dir> [--ratio=0.15] [--every=2]
 *
 * Input: a Collada (.dae) export from Metashape with vertex colours and cameras ("Export
 * cameras" enabled), so the mesh and camera poses share one local, Z-up, metre frame.
 *
 * Output (in <output-dir>):
 *   reconstruction.glb  the mesh, simplified to --ratio of its triangles, Draco-compressed, Y-up
 *   poses.bin           vehicle poses: Float32 records of [t, x, y, z, qx, qy, qz, qw]
 *   survey.json         metadata: dives, time range, bounds, camera field of view
 *
 * The cameras face down, centred on the vehicle. Vehicle orientation is taken from the camera:
 * "down" is the camera's view direction and "forward" is whichever image axis best matches the
 * direction of travel (detected automatically and reported).
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { draco, normals, prune, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [input, outDir] = args.filter((a) => !a.startsWith('--'));
if (!input || !outDir) {
  console.error('Usage: node scripts/build-survey.mjs <reconstruction.dae> <output-dir> [--ratio=0.15] [--every=2]');
  process.exit(1);
}
const RATIO = Number(flags.ratio ?? 0.15); // fraction of triangles to keep
const EVERY = Number(flags.every ?? 2); // keep every Nth camera pose (~2 Hz source -> ~1 Hz)
const DIVE_GAP_S = 120; // a gap longer than this starts a new dive
const SMOOTH = 3; // half-width (in kept frames) of the pose smoothing window
const mb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;

console.log(`Reading ${input} (${mb((await stat(input)).size)})…`);
const dae = await readFile(input, 'utf8');

// --- Collada parsing (just what Metashape writes) -----------------------------------------

function floatArray(id) {
  const open = dae.indexOf(`<float_array id="${id}"`);
  if (open < 0) throw new Error(`float_array ${id} not found`);
  const start = dae.indexOf('>', open) + 1;
  const end = dae.indexOf('</float_array>', start);
  return parseNumbers(dae.slice(start, end), Float32Array);
}

function parseNumbers(text, Type) {
  const parts = text.trim().split(/\s+/);
  const out = new Type(parts.length);
  for (let i = 0; i < parts.length; i++) out[i] = Number(parts[i]);
  return out;
}

const geometryId = /<geometry id="([^"]+)"/.exec(dae)?.[1];
const zPositions = floatArray(`${geometryId}-position-array`);
const colors = floatArray(`${geometryId}-color-array`);
// Metashape writes sRGB vertex colours; glTF COLOR_0 is linear.
for (let i = 0; i < colors.length; i++) {
  const c = colors[i];
  colors[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const pStart = dae.indexOf('>', dae.indexOf('<p', dae.indexOf('<triangles'))) + 1;
const indices = parseNumbers(dae.slice(pStart, dae.indexOf('</p>', pStart)), Uint32Array);
if (/<triangles[^>]*>[\s\S]*?<input[^>]*offset="1"/.test(dae.slice(dae.indexOf('<triangles'), pStart))) {
  throw new Error('Expected a single shared index per vertex (one <input> in <triangles>).');
}

// Collada here is Z-up; glTF/three.js are Y-up: (x, y, z) -> (x, z, -y).
const toYUp = (x, y, z) => [x, z, -y];
const positions = new Float32Array(zPositions.length);
for (let i = 0; i < zPositions.length; i += 3) {
  const [x, y, z] = toYUp(zPositions[i], zPositions[i + 1], zPositions[i + 2]);
  positions[i] = x;
  positions[i + 1] = y;
  positions[i + 2] = z;
}
console.log(`Mesh: ${positions.length / 3} vertices, ${indices.length / 3} triangles`);

// --- Mesh: simplify and compress ------------------------------------------------------------

const doc = new Document();
const buffer = doc.createBuffer();
const prim = doc
  .createPrimitive()
  .setIndices(doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer))
  .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer))
  .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(colors).setBuffer(buffer))
  .setMaterial(doc.createMaterial('seafloor').setRoughnessFactor(1).setMetallicFactor(0));
const mesh = doc.createMesh('reconstruction').addPrimitive(prim);
doc.createScene().addChild(doc.createNode('reconstruction').setMesh(mesh));

await MeshoptSimplifier.ready;
console.log(`Simplifying to ${(RATIO * 100).toFixed(0)}% of triangles…`);
await doc.transform(
  simplify({ simplifier: MeshoptSimplifier, ratio: RATIO, error: 0.01, lockBorder: false }),
  normals({ overwrite: true }),
  prune(),
  draco({ method: 'edgebreaker', quantizePosition: 16, quantizeColor: 8, quantizeNormal: 8 }),
);
doc.createExtension(KHRDracoMeshCompression).setRequired(true);

const io = new NodeIO()
  .registerExtensions([KHRDracoMeshCompression])
  .registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule() });
await mkdir(outDir, { recursive: true });
const glbPath = path.join(outDir, 'reconstruction.glb');
await io.write(glbPath, doc);
const triangles = doc.getRoot().listMeshes()[0].listPrimitives()[0].getIndices().getCount() / 3;
console.log(`Wrote ${glbPath}: ${triangles} triangles, ${mb((await stat(glbPath)).size)}`);

// Bounds of the (simplified) mesh, for framing the overview camera.
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < positions.length; i += 3) {
  for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], positions[i + k]);
    max[k] = Math.max(max[k], positions[i + k]);
  }
}

// --- Cameras -> vehicle poses ---------------------------------------------------------------

const nodeRe = /<node id="[^"]*" name="([^"]+)">\s*<translate>([^<]+)<\/translate>\s*<rotate>([^<]+)<\/rotate>\s*<instance_camera/g;
const frames = [];
for (const m of dae.matchAll(nodeRe)) {
  const time = parseTimestamp(m[1]);
  if (time === null) continue;
  const [tx, ty, tz] = m[2].trim().split(/\s+/).map(Number);
  const [ax, ay, az, deg] = m[3].trim().split(/\s+/).map(Number);
  const R = axisAngle([ax, ay, az], (deg * Math.PI) / 180); // camera -> world (Z-up)
  // Collada cameras look down local -Z with +Y up and +X right.
  const col = (c) => toYUp(R[0][c], R[1][c], R[2][c]);
  frames.push({
    time,
    pos: toYUp(tx, ty, tz),
    right: col(0),
    up: col(1), // image "up"
    view: col(2).map((v) => -v), // viewing direction
  });
}
frames.sort((a, b) => a.time - b.time);
console.log(`Cameras: ${frames.length} with timestamps`);

/** Metashape image names like PR_20241007_233830_614_FC16 -> epoch ms (camera clock, read as UTC). */
function parseTimestamp(name) {
  const m = /(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_(\d{3})/.exec(name);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +m[7]) : null;
}

function axisAngle([x, y, z], a) {
  const n = Math.hypot(x, y, z);
  [x, y, z] = [x / n, y / n, z / n];
  const c = Math.cos(a);
  const s = Math.sin(a);
  const t = 1 - c;
  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
  ];
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
for (const dive of dives) {
  const fs = dive.frames;
  if (fs.length < 2) continue;
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

const posesPath = path.join(outDir, 'poses.bin');
await writeFile(posesPath, Buffer.from(new Float32Array(records).buffer));

// Camera field of view from the Collada camera (the first one; they share a sensor).
const xfov = Number(/<xfov>([^<]+)<\/xfov>/.exec(dae)?.[1] ?? 60);
const yfov = Number(/<yfov>([^<]+)<\/yfov>/.exec(dae)?.[1] ?? 60);

const meta = {
  source: path.basename(input),
  poseStride: 8,
  poseFields: ['t', 'x', 'y', 'z', 'qx', 'qy', 'qz', 'qw'],
  calibratedFov: { x: xfov, y: yfov },
  bounds: { min, max },
  dives: diveMeta,
};
await writeFile(path.join(outDir, 'survey.json'), JSON.stringify(meta, null, 2) + '\n');
console.log(
  `Wrote ${posesPath}: ${records.length / 8} poses in ${diveMeta.length} dives ` +
    `(${mb(records.length * 4)}); durations ${diveMeta.map((d) => `${(d.duration / 60).toFixed(0)} min`).join(', ')}`,
);
