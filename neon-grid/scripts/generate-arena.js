#!/usr/bin/env node
// neon-grid/scripts/generate-arena.js
// Generates arena.glb — pure Node.js, zero dependencies
'use strict';
const fs   = require('fs');
const path = require('path');

// ── Unit-cube geometry (24 verts, 36 indices) ──────────────────────────────
const POSITIONS = [
  // Face -Z
  -0.5,-0.5,-0.5,  0.5,-0.5,-0.5,  0.5, 0.5,-0.5, -0.5, 0.5,-0.5,
  // Face +Z
   0.5,-0.5, 0.5, -0.5,-0.5, 0.5, -0.5, 0.5, 0.5,  0.5, 0.5, 0.5,
  // Face -X
  -0.5,-0.5, 0.5, -0.5,-0.5,-0.5, -0.5, 0.5,-0.5, -0.5, 0.5, 0.5,
  // Face +X
   0.5,-0.5,-0.5,  0.5,-0.5, 0.5,  0.5, 0.5, 0.5,  0.5, 0.5,-0.5,
  // Face -Y
  -0.5,-0.5, 0.5,  0.5,-0.5, 0.5,  0.5,-0.5,-0.5, -0.5,-0.5,-0.5,
  // Face +Y
  -0.5, 0.5,-0.5,  0.5, 0.5,-0.5,  0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
];
const INDICES = [
  0,1,2, 0,2,3,  4,5,6, 4,6,7,
  8,9,10, 8,10,11,  12,13,14, 12,14,15,
  16,17,18, 16,18,19,  20,21,22, 20,22,23,
];

const posBytes = Buffer.from(new Float32Array(POSITIONS).buffer); // 288 bytes
const idxBytes = Buffer.from(new Uint16Array(INDICES).buffer);   //  72 bytes
const binData  = Buffer.concat([posBytes, idxBytes]);             // 360 bytes (already 4-aligned)

// ── Arena layout: [cx, cy, cz, sx, sy, sz, name] ───────────────────────────
const BOXES = [
  // Ground
  [  0,  -0.25,   0,  80, 0.5, 80, 'Floor'],
  // Outer walls (height 6)
  [  0,   3,   -40,  80,   6,  1,  'WallN'],
  [  0,   3,    40,  80,   6,  1,  'WallS'],
  [-40,   3,     0,   1,   6, 80,  'WallW'],
  [ 40,   3,     0,   1,   6, 80,  'WallE'],
  // Centre corridor walls
  [ -8,   2,     0,   1,   4, 50,  'CorridorL'],
  [  8,   2,     0,   1,   4, 50,  'CorridorR'],
  // Partial cross-walls (create choke points)
  [-20,   2,   -20,  22,   4,  1,  'BlockNW'],
  [ 20,   2,   -20,  22,   4,  1,  'BlockNE'],
  [-20,   2,    20,  22,   4,  1,  'BlockSW'],
  [ 20,   2,    20,  22,   4,  1,  'BlockSE'],
  // Cover crates (spread evenly)
  [-15,   1,   -15,   3,   2,  3,  'Crate1'],
  [ 15,   1,   -15,   3,   2,  3,  'Crate2'],
  [-15,   1,    15,   3,   2,  3,  'Crate3'],
  [ 15,   1,    15,   3,   2,  3,  'Crate4'],
  [  0,   1,   -25,   3,   2,  3,  'Crate5'],
  [  0,   1,    25,   3,   2,  3,  'Crate6'],
  [-25,   1,     0,   3,   2,  3,  'Crate7'],
  [ 25,   1,     0,   3,   2,  3,  'Crate8'],
  // Corner pillars
  [-35,   3,   -35,   2,   6,  2,  'PillarNW'],
  [ 35,   3,   -35,   2,   6,  2,  'PillarNE'],
  [-35,   3,    35,   2,   6,  2,  'PillarSW'],
  [ 35,   3,    35,   2,   6,  2,  'PillarSE'],
  // Elevated platforms
  [-20, 0.5,   -20,   8,   1,  8,  'PlatformNW'],
  [ 20, 0.5,    20,   8,   1,  8,  'PlatformSE'],
];

// ── Build GLTF JSON ────────────────────────────────────────────────────────
const gltf = {
  asset: { version: '2.0', generator: 'NEON GRID Arena Generator v1' },
  scene: 0,
  scenes: [{ name: 'Arena', nodes: BOXES.map((_, i) => i) }],
  nodes: BOXES.map(([cx, cy, cz, sx, sy, sz, name]) => ({
    name, mesh: 0,
    translation: [cx, cy, cz],
    scale:       [sx, sy, sz],
  })),
  meshes: [{
    name: 'Box',
    primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0, mode: 4 }],
  }],
  materials: [{
    name: 'ArenaMat',
    pbrMetallicRoughness: {
      baseColorFactor: [0.05, 0.1, 0.17, 1.0],
      roughnessFactor: 0.85,
      metallicFactor:  0.2,
    },
    doubleSided: true,
  }],
  accessors: [
    { bufferView: 0, byteOffset: 0, componentType: 5126, count: 24, type: 'VEC3',
      min: [-0.5,-0.5,-0.5], max: [0.5,0.5,0.5] },
    { bufferView: 1, byteOffset: 0, componentType: 5123, count: 36, type: 'SCALAR' },
  ],
  bufferViews: [
    { buffer: 0, byteOffset:   0, byteLength: 288, target: 34962 },
    { buffer: 0, byteOffset: 288, byteLength:  72, target: 34963 },
  ],
  buffers: [{ byteLength: binData.length }],
};

// ── Pack into GLB ──────────────────────────────────────────────────────────
function pad4(buf, fill = 0x20) {
  const r = buf.length % 4;
  return r === 0 ? buf : Buffer.concat([buf, Buffer.alloc(4 - r, fill)]);
}

const jsonStr  = JSON.stringify(gltf);
const jsonBuf  = pad4(Buffer.from(jsonStr, 'utf8'), 0x20); // space-padded
const binPad   = pad4(binData, 0x00);                       // zero-padded

const glbLen = 12 + 8 + jsonBuf.length + 8 + binPad.length;

const hdr  = Buffer.alloc(12);
hdr.writeUInt32LE(0x46546C67, 0); // 'glTF'
hdr.writeUInt32LE(2,           4);
hdr.writeUInt32LE(glbLen,      8);

const jChk = Buffer.alloc(8);
jChk.writeUInt32LE(jsonBuf.length, 0);
jChk.writeUInt32LE(0x4E4F534A,     4); // 'JSON'

const bChk = Buffer.alloc(8);
bChk.writeUInt32LE(binPad.length, 0);
bChk.writeUInt32LE(0x004E4942,    4); // 'BIN\0'

const glb = Buffer.concat([hdr, jChk, jsonBuf, bChk, binPad]);

const outPath = path.resolve(__dirname, '../public/assets/maps/arena.glb');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, glb);
console.log(`arena.glb written — ${glb.length} bytes, ${BOXES.length} boxes`);
