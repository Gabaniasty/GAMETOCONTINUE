#!/usr/bin/env node
/**
 * inject-animations.js
 * Adds synthetic "Shoot" and "Death" animation clips to soldier.glb.
 *
 * Shoot: 0.3s – upper-body recoil (Spine2 + RightArm quaternion keyframes)
 * Death: 2.5s – fall forward (Hips rotation + translation, Spine forward lean)
 *
 * GLB binary layout:
 *   [0-11]  header: magic(4) version(4) totalLength(4)
 *   [12-19] JSON chunk header: chunkLen(4) chunkType(4=0x4E4F534A)
 *   [20 ..] JSON data (padded to 4-byte boundary with 0x20)
 *   [...  ] BIN  chunk header: chunkLen(4) chunkType(4=0x004E4942)
 *   [...  ] BIN  data  (padded to 4-byte boundary with 0x00)
 */

const fs   = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../neon-grid/public/assets/characters/soldier.glb');
const DST = SRC; // overwrite in place

const buf = fs.readFileSync(SRC);

// ── parse GLB ────────────────────────────────────────────────────────────────
const jsonChunkLen  = buf.readUInt32LE(12);
const json          = JSON.parse(buf.slice(20, 20 + jsonChunkLen).toString('utf8'));

const binChunkStart = 20 + jsonChunkLen + 8; // after JSON chunk header
const binChunkLen   = buf.readUInt32LE(20 + jsonChunkLen);
const oldBin        = buf.slice(binChunkStart, binChunkStart + binChunkLen);

// ── helpers ──────────────────────────────────────────────────────────────────
function floatsToBuffer(arr) {
  const b = Buffer.allocUnsafe(arr.length * 4);
  arr.forEach((v, i) => b.writeFloatLE(v, i * 4));
  return b;
}

function angleAxisQuat(deg, ax, ay, az) {
  const r  = (deg * Math.PI) / 180;
  const s  = Math.sin(r / 2);
  return [ax * s, ay * s, az * s, Math.cos(r / 2)];
}

// lerp helper for readability
function lerpQuat(q0, q1, t) {
  return q0.map((v, i) => v + (q1[i] - v) * t);
}

// Build a new binary blob, return { data: Buffer, bufferViews: [...], accessors: [...], animations: [...] }
function buildAnimations(existingBinLength, existingBufViewCount, existingAccCount) {
  const extraBufs = [];   // Buffer[]
  const bvDefs    = [];   // new bufferView objects (appended to json.bufferViews)
  const accDefs   = [];   // new accessor objects   (appended to json.accessors)

  let byteOffset = existingBinLength; // offset within buffer 0

  function addData(floatArr, accType, count) {
    const data = floatsToBuffer(floatArr);
    extraBufs.push(data);

    const bvIdx = existingBufViewCount + bvDefs.length;
    bvDefs.push({
      buffer:     0,
      byteOffset: byteOffset,
      byteLength: data.length,
    });
    byteOffset += data.length;

    const accIdx = existingAccCount + accDefs.length;
    accDefs.push({
      bufferView:    bvIdx,
      byteOffset:    0,
      componentType: 5126, // FLOAT
      count:         count,
      type:          accType,
    });

    return accIdx;
  }

  // ── SHOOT animation ─────────────────────────────────────────────────────
  // 5 keyframes over 0.3 s
  // Bones: Spine2 (node 6), RightArm (node 35)
  const shootTimes = [0, 0.05, 0.1, 0.2, 0.3];
  const shootTimeAcc = addData(shootTimes, 'SCALAR', 5);

  // Spine2: identity → tilt-back → forward-recoil → settling → identity
  const identity = [0, 0, 0, 1];
  const tiltBack  = angleAxisQuat(-12, 1, 0, 0); // -12° around X
  const tiltFwd   = angleAxisQuat( 8,  1, 0, 0); //  +8° around X

  const spine2Rots = [
    ...identity,
    ...tiltBack,
    ...tiltFwd,
    ...lerpQuat(identity, tiltFwd, 0.3),
    ...identity,
  ];
  const spine2RotAcc = addData(spine2Rots, 'VEC4', 5);

  // RightArm: slight raise on Z axis at recoil peak
  const armRaise  = angleAxisQuat(-15, 0, 0, 1); // -15° roll
  const rightArmRots = [
    ...identity,
    ...lerpQuat(identity, armRaise, 0.5),
    ...armRaise,
    ...lerpQuat(identity, armRaise, 0.3),
    ...identity,
  ];
  const rightArmRotAcc = addData(rightArmRots, 'VEC4', 5);

  const shootAnim = {
    name: 'Shoot',
    samplers: [
      { input: shootTimeAcc, interpolation: 'LINEAR', output: spine2RotAcc  },
      { input: shootTimeAcc, interpolation: 'LINEAR', output: rightArmRotAcc },
    ],
    channels: [
      { sampler: 0, target: { node: 6,  path: 'rotation' } }, // Spine2
      { sampler: 1, target: { node: 35, path: 'rotation' } }, // RightArm
    ],
  };

  // ── DEATH animation ──────────────────────────────────────────────────────
  // 6 keyframes over 2.5 s
  // Bones: Hips (node 3) rotation + translation, Spine (4), Spine1 (5)
  const deathTimes = [0, 0.4, 0.9, 1.5, 2.0, 2.5];
  const deathTimeAcc = addData(deathTimes, 'SCALAR', 6);

  // Hips rotation: stagger forward then side-fall
  const hipsFall    = angleAxisQuat(-80, 1, 0, 0); // fall forward 80°
  const hipsFallEnd = angleAxisQuat(-90, 1, 0, 0);

  const hipsRots = [
    ...identity,
    ...angleAxisQuat(-20, 1, 0, 0),
    ...angleAxisQuat(-50, 1, 0, 0),
    ...hipsFall,
    ...hipsFallEnd,
    ...hipsFallEnd,
  ];
  const hipsRotAcc = addData(hipsRots, 'VEC4', 6);

  // Hips translation: y drops to near zero (ground)
  // Rest translation from Idle: approx (0.337, 0.986, 97.941)
  const hx = 0.337, hy = 0.986, hz = 97.941;
  const hipsTrans = [
    hx, hy,  hz,
    hx, hy * 0.7, hz,
    hx, hy * 0.4, hz,
    hx, hy * 0.15, hz,
    hx, 0.05, hz,
    hx, 0.05, hz,
  ];
  const hipsTransAcc = addData(hipsTrans, 'VEC3', 6);

  // Spine lean forward
  const spineLean = angleAxisQuat(-60, 1, 0, 0);
  const spineRots = [
    ...identity,
    ...angleAxisQuat(-15, 1, 0, 0),
    ...angleAxisQuat(-35, 1, 0, 0),
    ...spineLean,
    ...spineLean,
    ...spineLean,
  ];
  const spineRotAcc = addData(spineRots, 'VEC4', 6);

  // Spine1 lean
  const spine1Lean = angleAxisQuat(-30, 1, 0, 0);
  const spine1Rots = [
    ...identity,
    ...angleAxisQuat(-8,  1, 0, 0),
    ...angleAxisQuat(-16, 1, 0, 0),
    ...spine1Lean,
    ...spine1Lean,
    ...spine1Lean,
  ];
  const spine1RotAcc = addData(spine1Rots, 'VEC4', 6);

  const deathAnim = {
    name: 'Death',
    samplers: [
      { input: deathTimeAcc, interpolation: 'LINEAR', output: hipsRotAcc   },
      { input: deathTimeAcc, interpolation: 'LINEAR', output: hipsTransAcc },
      { input: deathTimeAcc, interpolation: 'LINEAR', output: spineRotAcc  },
      { input: deathTimeAcc, interpolation: 'LINEAR', output: spine1RotAcc },
    ],
    channels: [
      { sampler: 0, target: { node: 3, path: 'rotation'    } }, // Hips rot
      { sampler: 1, target: { node: 3, path: 'translation' } }, // Hips trans
      { sampler: 2, target: { node: 4, path: 'rotation'    } }, // Spine
      { sampler: 3, target: { node: 5, path: 'rotation'    } }, // Spine1
    ],
  };

  const extraBin = Buffer.concat(extraBufs);
  return { extraBin, bvDefs, accDefs, shootAnim, deathAnim };
}

// ── assemble ─────────────────────────────────────────────────────────────────
const { extraBin, bvDefs, accDefs, shootAnim, deathAnim } = buildAnimations(
  oldBin.length,
  json.bufferViews.length,
  json.accessors.length
);

// patch JSON
json.bufferViews.push(...bvDefs);
json.accessors.push(...accDefs);
if (!json.animations) json.animations = [];
json.animations.push(shootAnim, deathAnim);
json.buffers[0].byteLength += extraBin.length;

// serialise JSON, pad to 4-byte boundary with spaces (0x20)
let jsonStr = JSON.stringify(json);
while (jsonStr.length % 4 !== 0) jsonStr += ' ';
const jsonBuf = Buffer.from(jsonStr, 'utf8');

// new BIN: old + extra, pad to 4-byte boundary with zeros
const newBinRaw = Buffer.concat([oldBin, extraBin]);
const padLen    = (4 - (newBinRaw.length % 4)) % 4;
const newBin    = Buffer.concat([newBinRaw, Buffer.alloc(padLen)]);

// new total length
const totalLen = 12 + 8 + jsonBuf.length + 8 + newBin.length;

// write output
const out = Buffer.allocUnsafe(totalLen);
let p = 0;

// GLB header
out.writeUInt32LE(0x46546C67, p); p += 4; // magic 'glTF'
out.writeUInt32LE(2,          p); p += 4; // version 2
out.writeUInt32LE(totalLen,   p); p += 4;

// JSON chunk
out.writeUInt32LE(jsonBuf.length,  p); p += 4;
out.writeUInt32LE(0x4E4F534A,      p); p += 4;
jsonBuf.copy(out, p); p += jsonBuf.length;

// BIN chunk
out.writeUInt32LE(newBin.length, p); p += 4;
out.writeUInt32LE(0x004E4942,    p); p += 4;
newBin.copy(out, p);

fs.writeFileSync(DST, out);
console.log(`Done. Written ${out.length} bytes to ${DST}`);
console.log(`Added animations: Shoot (5 kf, 0.3s), Death (6 kf, 2.5s)`);
console.log(`New animation list: ${json.animations.map(a => a.name).join(', ')}`);
