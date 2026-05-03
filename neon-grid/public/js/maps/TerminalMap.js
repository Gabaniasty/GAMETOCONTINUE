// ── TERMINAL Map — 100×100 cyberpunk indoor facility ──────────────────────
// All geometry is procedural Three.js; no external files required.
// THREE is a global loaded via CDN before this module is imported.

// ── Shared materials ──────────────────────────────────────────────────────
let matFloor, matWall, matRoof, matGlowCyan, matGlowPink, matGlowPurp,
    matGrate, matGlass;

function _initMaterials() {
  matFloor    = new THREE.MeshStandardMaterial({ color: 0x0a1a26, roughness: 0.9, metalness: 0.2 });
  matWall     = new THREE.MeshStandardMaterial({ color: 0x0f2233, roughness: 0.85, metalness: 0.3 });
  matRoof     = new THREE.MeshStandardMaterial({ color: 0x060e16, roughness: 1.0, metalness: 0.1, side: THREE.BackSide });
  matGlowCyan = new THREE.MeshStandardMaterial({ color: 0x00f5ff, emissive: 0x00f5ff, emissiveIntensity: 1.2 });
  matGlowPink = new THREE.MeshStandardMaterial({ color: 0xff2d78, emissive: 0xff2d78, emissiveIntensity: 1.2 });
  matGlowPurp = new THREE.MeshStandardMaterial({ color: 0x7b2fff, emissive: 0x7b2fff, emissiveIntensity: 1.2 });
  matGrate    = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.7, metalness: 0.8, wireframe: true });
  matGlass    = new THREE.MeshStandardMaterial({ color: 0x00aaff, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.6, side: THREE.DoubleSide });
}

// ── Helper: add a box mesh ────────────────────────────────────────────────
function _box(scene, w, h, d, mat, cx, cy, cz) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(cx, cy, cz);
  scene.add(m);
  return m;
}

// ── Outer shell ───────────────────────────────────────────────────────────
function _buildShell(scene) {
  // Floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), matFloor);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // Neon grid overlay
  const grid = new THREE.GridHelper(100, 50, 0x00f5ff, 0x003344);
  grid.material.transparent = true;
  grid.material.opacity = 0.45;
  scene.add(grid);

  // Ceiling — rotated horizontally to face downward (BackSide renders from below)
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), matRoof);
  ceil.rotation.x = -Math.PI / 2;
  ceil.position.y = 9;
  scene.add(ceil);

  // Ambient ceiling fill light
  scene.add(new THREE.AmbientLight(0x112233, 1.6));

  // Four outer boundary walls (1.5 thick × 9 tall)
  _box(scene, 100, 9, 1.5, matWall,  0,   4.5, -49.25);  // north
  _box(scene, 100, 9, 1.5, matWall,  0,   4.5,  49.25);  // south
  _box(scene, 1.5, 9, 100, matWall, -49.25, 4.5, 0);     // west
  _box(scene, 1.5, 9, 100, matWall,  49.25, 4.5, 0);     // east
}

// ── Main Hall ─────────────────────────────────────────────────────────────
// Open centre zone with 4 support columns
function _buildMainHall(scene) {
  const colPositions = [[-9, -6], [9, -6], [-9, 6], [9, 6]];
  colPositions.forEach(([cx, cz]) => {
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 7.5, 10),
      new THREE.MeshStandardMaterial({ color: 0x1a3a52, roughness: 0.8, metalness: 0.5 })
    );
    col.position.set(cx, 3.75, cz);
    scene.add(col);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.08, 8, 24), matGlowCyan);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(cx, 0.5, cz);
    scene.add(ring);

    const pl = new THREE.PointLight(0x00f5ff, 3, 14);
    pl.position.set(cx, 2, cz);
    scene.add(pl);
  });
}

// ── Corridors A (west) & B (east) ─────────────────────────────────────────
// Corridor A: x=-29 to -21 (8 wide centred at x=-25), runs full length z=-48.5 to +48.5
// Corridor B: x=+21 to +29 (8 wide centred at x=+25), same
// Inner walls border the centre zone; outer sides open into the corner rooms.
function _buildCorridors(scene) {
  // Corridor A — inner east wall toward centre (gap at z=-12 to +12 for Main Hall)
  _box(scene, 1, 9, 36.5, matWall, -21.5, 4.5, -30.25);   // z=-48.5 to -12
  _box(scene, 1, 9, 36.5, matWall, -21.5, 4.5,  30.25);   // z=+12 to +48.5

  // Corridor A — outer west wall, mid-map section (z=-27 to +27, 54 units)
  // Room east/west walls cover z<-27 and z>+27; this fills the gap
  _box(scene, 1, 9, 54, matWall, -29.5, 4.5, 0);

  // Corridor B — inner west wall toward centre
  _box(scene, 1, 9, 36.5, matWall,  21.5, 4.5, -30.25);   // z=-48.5 to -12
  _box(scene, 1, 9, 36.5, matWall,  21.5, 4.5,  30.25);   // z=+12 to +48.5

  // Corridor B — outer east wall, mid-map section (z=-27 to +27)
  _box(scene, 1, 9, 54, matWall,  29.5, 4.5, 0);

  // Pink strip lighting — three evenly spaced per corridor
  const stripMat = matGlowPink;
  [-20, 0, 20].forEach((z) => {
    [-21.4, 21.4].forEach((sx) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 1.5), stripMat);
      s.position.set(sx, 7.8, z);
      scene.add(s);
    });
    const la = new THREE.PointLight(0xff2d78, 2.5, 12);
    la.position.set(-25, 5, z);
    scene.add(la);
    const lb = new THREE.PointLight(0xff2d78, 2.5, 12);
    lb.position.set( 25, 5, z);
    scene.add(lb);
  });

  // Cover boxes — 2 per corridor (alternating sides)
  const coverMat = new THREE.MeshStandardMaterial({ color: 0x1c2e3d, roughness: 0.9 });
  _box(scene, 2, 1.5, 2, coverMat, -25, 0.75, -11);
  _box(scene, 2, 1.5, 2, coverMat, -25, 0.75,  11);
  _box(scene, 2, 1.5, 2, coverMat,  25, 0.75, -11);
  _box(scene, 2, 1.5, 2, coverMat,  25, 0.75,  11);
}

// ── Server Room (NW) ──────────────────────────────────────────────────────
// x=-48.5 to -29, z=-48.5 to -26
// Entry: 8-unit doorway gap in east wall at z=-38 to -30 (from corridor A west side)
// South wall also has a gap at x=-33 to -29 for south approach entry
function _buildServerRoom(scene) {
  // East wall (x=-30 to -29), 3 segments with 8-unit doorway gap at z=-38 to -30
  _box(scene, 1, 9, 10.5, matWall, -29.5, 4.5, -43.25);  // north seg z=-48.5 to -38
  _box(scene, 1, 9,  3,   matWall, -29.5, 4.5, -28.5);   // south seg z=-30 to -27

  // South wall with doorway gap (east 8 units open: x=-33 to -29)
  // Solid west segment: x=-48.5 to -33 (width 15.5, centre -40.75)
  _box(scene, 15.5, 9, 1, matWall, -40.75, 4.5, -26.5);

  // Glass window near the doorway (decorative)
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3, 4), matGlass);
  win.position.set(-34.0, 3.5, -26.4);
  scene.add(win);

  // Server racks — 6 racks in two rows of 3 (rows at x≈-47.2 and x≈-44)
  const rackMat = new THREE.MeshStandardMaterial({ color: 0x0d1e2c, roughness: 0.8, metalness: 0.6 });
  const emitMat = new THREE.MeshStandardMaterial({ color: 0x00f5ff, emissive: 0x00f5ff, emissiveIntensity: 0.9 });
  const rackRows = [
    { rx: -47.2, zs: [-45, -40, -35] },
    { rx: -44.0, zs: [-45, -40, -35] },
  ];
  rackRows.forEach(({ rx, zs }) => {
    zs.forEach((z, i) => {
      _box(scene, 0.7, 3, 1.8, rackMat, rx, 1.5, z);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 1.6), emitMat);
      strip.position.set(rx + 0.4, 1.0 + i * 0.4, z);
      scene.add(strip);
    });
  });
  // Per-rack-row PointLights
  [-45, -40, -35].forEach((z) => {
    const pl = new THREE.PointLight(0x00f5ff, 2, 10);
    pl.position.set(-44, 2.5, z);
    scene.add(pl);
  });
}

// ── Control Hub (NE) ──────────────────────────────────────────────────────
// x=+29 to +48.5, z=-48.5 to -26
// Entry: 8-unit doorway gap in west wall at z=-38 to -30 (from corridor B east side)
// South wall also has gap at x=+29 to +33 for south approach entry
function _buildControlHub(scene) {
  // West wall (x=+29 to +30), 2 segments with 8-unit doorway gap at z=-38 to -30
  _box(scene, 1, 9, 10.5, matWall, 29.5, 4.5, -43.25);  // north seg z=-48.5 to -38
  _box(scene, 1, 9,  3,   matWall, 29.5, 4.5, -28.5);   // south seg z=-30 to -27

  // South wall with doorway gap (west 8 units open: x=+29 to +33)
  // Solid east segment: x=+33 to +48.5 (width 15.5, centre +40.75)
  _box(scene, 15.5, 9, 1, matWall, 40.75, 4.5, -26.5);

  // Raised platform
  _box(scene, 12, 0.4, 8,
    new THREE.MeshStandardMaterial({ color: 0x142233, roughness: 0.8 }), 39, 0.2, -40);

  // Central console with pink emissive top
  const consoleMat = new THREE.MeshStandardMaterial({ color: 0x0f1e2e, roughness: 0.6, metalness: 0.7 });
  _box(scene, 4, 1.1, 6, consoleMat, 39, 0.75, -40);
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.06, 5.8), matGlowPink);
  top.position.set(39, 1.13, -40);
  scene.add(top);

  // Holographic display planes above console
  [0, 1, 2, 3].forEach((i) => {
    const disp = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.9),
      new THREE.MeshBasicMaterial({ color: 0x0033ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    disp.position.set(37.5 + i * 1.0, 2.4, -40);
    disp.rotation.x = -0.3;
    scene.add(disp);
  });

  const pl = new THREE.PointLight(0xff2d78, 4, 16);
  pl.position.set(39, 3, -40);
  scene.add(pl);
}

// ── Catwalk ───────────────────────────────────────────────────────────────
// Wireframe grate walkway at y=5.5 (top surface), spanning centre N→S
// Ladders at z=-15 to -20 on each side (north half)
function _buildCatwalk(scene) {
  // Catwalk grate (top surface at y=5.5, thickness 0.3 → centre at y=5.65)
  const walk = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 60), matGrate);
  walk.position.set(0, 5.65, 0);
  scene.add(walk);

  // Solid underside plate
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(4, 0.08, 60),
    new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.9, metalness: 0.7 })
  );
  plate.position.set(0, 5.38, 0);
  scene.add(plate);

  // Cyan railings (west and east sides)
  [-2.1, 2.1].forEach((rx) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 60), matGlowCyan);
    rail.position.set(rx, 6.25, 0);
    scene.add(rail);
  });

  // Purple under-lights (4 evenly spaced)
  [-22, -8, 8, 22].forEach((z) => {
    const ul = new THREE.PointLight(0x7b2fff, 2.5, 10);
    ul.position.set(0, 5.0, z);
    scene.add(ul);
    const pip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), matGlowPurp);
    pip.position.set(0, 5.1, z);
    scene.add(pip);
  });

  // Ladder meshes — west and east sides, north half (z=-15 to -20)
  const ladderMat = new THREE.MeshStandardMaterial({ color: 0x2a4055, roughness: 0.6, metalness: 0.8 });
  [-2.6, 2.6].forEach((lx) => {
    // Trunk
    _box(scene, 0.15, 5.5, 0.15, ladderMat, lx, 2.75, -17.5);
    // Rungs every 0.5 units
    for (let ry = 0.5; ry <= 5.25; ry += 0.5) {
      _box(scene, 0.6, 0.1, 0.15, ladderMat, lx, ry, -17.5);
    }
  });
}

// ── Chokepoint (south) ────────────────────────────────────────────────────
// 6-unit-wide passage, z=+25 to +38 (stops before spawn zone)
function _buildChokepoint(scene) {
  // Chokepoint side walls (z=+25 to +38, 13 long, centre at z=+31.5)
  _box(scene, 1, 9, 13, matWall, -3.5, 4.5, 31.5);
  _box(scene, 1, 9, 13, matWall,  3.5, 4.5, 31.5);

  // Two concrete barricades
  const barrMat = new THREE.MeshStandardMaterial({ color: 0x1e2e3c, roughness: 0.95 });
  _box(scene, 2.5, 1.8, 1, barrMat, -1.5, 0.9, 29);
  _box(scene, 2.5, 1.8, 1, barrMat,  1.5, 0.9, 35);

  // Hanging broken ceiling panel
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(5.5, 0.15, 3),
    new THREE.MeshStandardMaterial({ color: 0x101c28, roughness: 0.9 })
  );
  panel.position.set(0, 7.2, 32);
  panel.rotation.z = 0.18;
  scene.add(panel);

  // Pink flickering light
  const flickerLight = new THREE.PointLight(0xff2d78, 1.4, 14);
  flickerLight.position.set(0, 6, 32);
  scene.add(flickerLight);

  return flickerLight;
}

// ── Side Room (SW) ────────────────────────────────────────────────────────
// x=-48.5 to -29, z=+26 to +48.5
// Entry: 8-unit doorway gap in east wall at z=+30 to +38 (from corridor A west side)
// North wall also has gap at x=-33 to -29 for north approach entry
function _buildSideRoom(scene) {
  // East wall (x=-30 to -29), 2 segments with 8-unit doorway gap at z=+30 to +38
  _box(scene, 1, 9, 3,    matWall, -29.5, 4.5, 28.5);   // north seg z=+27 to +30
  _box(scene, 1, 9, 10.5, matWall, -29.5, 4.5, 43.25);  // south seg z=+38 to +48.5

  // North wall with doorway gap (east 8 units open: x=-33 to -29)
  // Solid west segment: x=-48.5 to -33 (width 15.5, centre -40.75)
  _box(scene, 15.5, 9, 1, matWall, -40.75, 4.5, 26.5);

  // Generator box (large metal crate)
  const genMat = new THREE.MeshStandardMaterial({ color: 0x102030, roughness: 0.8, metalness: 0.6 });
  _box(scene, 4, 3, 3, genMat, -38, 1.5, 38);

  // Cyan coolant pipes
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x00d4cc, roughness: 0.4, metalness: 0.9 });
  [-0.6, 0.6].forEach((pz) => {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 9, 8), pipeMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(-43.5, 2.0, 38 + pz);
    scene.add(pipe);
  });

  const pl = new THREE.PointLight(0x00f5ff, 2.5, 14);
  pl.position.set(-38, 4, 38);
  scene.add(pl);
}

// ── Generator Room (SE) ───────────────────────────────────────────────────
// x=+29 to +48.5, z=+26 to +48.5
// Entry: 8-unit doorway gap in west wall at z=+30 to +38 (from corridor B east side)
// North wall also has gap at x=+29 to +33 for north approach entry
function _buildGeneratorRoom(scene) {
  // West wall (x=+29 to +30), 2 segments with 8-unit doorway gap at z=+30 to +38
  _box(scene, 1, 9, 3,    matWall, 29.5, 4.5, 28.5);   // north seg z=+27 to +30
  _box(scene, 1, 9, 10.5, matWall, 29.5, 4.5, 43.25);  // south seg z=+38 to +48.5

  // North wall with doorway gap (west 8 units open: x=+29 to +33)
  // Solid east segment: x=+33 to +48.5 (width 15.5, centre +40.75)
  _box(scene, 15.5, 9, 1, matWall, 40.75, 4.5, 26.5);

  // Turbine
  const turbineMat = new THREE.MeshStandardMaterial({
    color: 0x223344, roughness: 0.6, metalness: 0.85,
    emissive: 0xff6600, emissiveIntensity: 0.15,
  });
  const turbine = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 4, 20), turbineMat);
  turbine.position.set(39, 2, 39);
  scene.add(turbine);

  // Turbine detail rings
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.5, metalness: 0.9 });
  [0.5, -0.5, 1.5, -1.5].forEach((ry) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.12, 8, 24), ringMat);
    ring.position.set(39, 2 + ry, 39);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
  });

  // Warning tape canvas texture on floor
  const warnCanvas = document.createElement('canvas');
  warnCanvas.width = 128; warnCanvas.height = 32;
  const wctx = warnCanvas.getContext('2d');
  wctx.fillStyle = '#ffcc00';
  wctx.fillRect(0, 0, 128, 32);
  wctx.fillStyle = '#111111';
  for (let i = 0; i < 8; i++) { wctx.fillRect(i * 16, 0, 8, 32); }
  const warnTex = new THREE.CanvasTexture(warnCanvas);
  warnTex.wrapS = warnTex.wrapT = THREE.RepeatWrapping;
  warnTex.repeat.set(3, 1);
  const tape = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 1.5),
    new THREE.MeshBasicMaterial({ map: warnTex })
  );
  tape.rotation.x = -Math.PI / 2;
  tape.position.set(39, 0.01, 31);
  scene.add(tape);

  // Orange flickering point light
  const genLight = new THREE.PointLight(0xff6600, 2.5, 18);
  genLight.position.set(39, 5, 39);
  scene.add(genLight);

  return { turbine, genLight };
}

// ── Spawn zones ───────────────────────────────────────────────────────────
// Team A: north (z=-45), x=-20 to +20 in steps of 10
// Team B: south (z=+45), same x positions
function _buildSpawns() {
  const spawnA = [
    new THREE.Vector3(-20, 1.65, -45),
    new THREE.Vector3(-10, 1.65, -45),
    new THREE.Vector3(  0, 1.65, -45),
    new THREE.Vector3( 10, 1.65, -45),
    new THREE.Vector3( 20, 1.65, -45),
  ];
  const spawnB = [
    new THREE.Vector3(-20, 1.65,  45),
    new THREE.Vector3(-10, 1.65,  45),
    new THREE.Vector3(  0, 1.65,  45),
    new THREE.Vector3( 10, 1.65,  45),
    new THREE.Vector3( 20, 1.65,  45),
  ];
  return { spawnA, spawnB };
}

// ── Public entry point ────────────────────────────────────────────────────
export function buildTerminalMap(scene) {
  _initMaterials();

  scene.background = new THREE.Color(0x050d14);
  scene.fog = new THREE.Fog(0x050d14, 40, 120);

  _buildShell(scene);
  _buildMainHall(scene);
  _buildCorridors(scene);
  _buildServerRoom(scene);
  _buildControlHub(scene);
  _buildCatwalk(scene);
  const flickerLight = _buildChokepoint(scene);
  _buildSideRoom(scene);
  const { turbine, genLight } = _buildGeneratorRoom(scene);

  const { spawnA, spawnB } = _buildSpawns();

  return { turbine, genLight, flickerLight, spawnA, spawnB };
}

// ── Ladder zones (exported for Controls.js teleport logic) ────────────────
export const LADDER_ZONES = [
  { minX: -3.2, maxX: -2.0, minZ: -20.0, maxZ: -15.0 },   // west ladder
  { minX:  2.0, maxX:  3.2, minZ: -20.0, maxZ: -15.0 },   // east ladder
];

export const CATWALK_EYE_Y = 5.8 + 1.65;   // 7.45  (feet at y=5.8 = catwalk mesh top = AABB maxY)
export const GROUND_EYE_Y  = 1.65;

// ── Collision AABBs ───────────────────────────────────────────────────────
// Covers every solid surface: outer walls, corridor inner walls, room walls,
// main hall columns, server racks, console, cover boxes, barricades, catwalk.
// Excludes glass, decorative pipes, lights, grate (visual only).
export const TERMINAL_AABBS = [
  // ── Outer walls (4) ──
  { minX: -50,    maxX:  50,    minY: 0, maxY: 9, minZ: -50,    maxZ: -48.5  },  // north
  { minX: -50,    maxX:  50,    minY: 0, maxY: 9, minZ:  48.5,  maxZ:  50    },  // south
  { minX: -50,    maxX: -48.5,  minY: 0, maxY: 9, minZ: -50,    maxZ:  50    },  // west
  { minX:  48.5,  maxX:  50,    minY: 0, maxY: 9, minZ: -50,    maxZ:  50    },  // east

  // ── Corridor A inner east wall (toward centre, gap z=-12 to +12 for Main Hall) ──
  { minX: -22,    maxX: -21,    minY: 0, maxY: 9, minZ: -48.5,  maxZ: -12    },  // A inner north
  { minX: -22,    maxX: -21,    minY: 0, maxY: 9, minZ:  12,    maxZ:  48.5  },  // A inner south

  // ── Corridor B inner west wall (toward centre) ──
  { minX:  21,    maxX:  22,    minY: 0, maxY: 9, minZ: -48.5,  maxZ: -12    },  // B inner north
  { minX:  21,    maxX:  22,    minY: 0, maxY: 9, minZ:  12,    maxZ:  48.5  },  // B inner south

  // ── Server Room (NW) east wall — doorway gap z=-38 to -30 ──
  { minX: -30,    maxX: -29,    minY: 0, maxY: 9, minZ: -48.5,  maxZ: -38    },
  { minX: -30,    maxX: -29,    minY: 0, maxY: 9, minZ: -30,    maxZ: -27    },

  // ── Server Room (NW) south wall — doorway gap x=-33 to -29 ──
  { minX: -48.5,  maxX: -33,    minY: 0, maxY: 9, minZ: -27,    maxZ: -26    },

  // ── Control Hub (NE) west wall — doorway gap z=-38 to -30 ──
  { minX:  29,    maxX:  30,    minY: 0, maxY: 9, minZ: -48.5,  maxZ: -38    },
  { minX:  29,    maxX:  30,    minY: 0, maxY: 9, minZ: -30,    maxZ: -27    },

  // ── Control Hub (NE) south wall — doorway gap x=+29 to +33 ──
  { minX:  33,    maxX:  48.5,  minY: 0, maxY: 9, minZ: -27,    maxZ: -26    },

  // ── Side Room (SW) east wall — doorway gap z=+30 to +38 ──
  { minX: -30,    maxX: -29,    minY: 0, maxY: 9, minZ:  27,    maxZ:  30    },
  { minX: -30,    maxX: -29,    minY: 0, maxY: 9, minZ:  38,    maxZ:  48.5  },

  // ── Side Room (SW) north wall — doorway gap x=-33 to -29 ──
  { minX: -48.5,  maxX: -33,    minY: 0, maxY: 9, minZ:  26,    maxZ:  27    },

  // ── Generator Room (SE) west wall — doorway gap z=+30 to +38 ──
  { minX:  29,    maxX:  30,    minY: 0, maxY: 9, minZ:  27,    maxZ:  30    },
  { minX:  29,    maxX:  30,    minY: 0, maxY: 9, minZ:  38,    maxZ:  48.5  },

  // ── Generator Room (SE) north wall — doorway gap x=+29 to +33 ──
  { minX:  33,    maxX:  48.5,  minY: 0, maxY: 9, minZ:  26,    maxZ:  27    },

  // ── Side room generator box ──
  { minX: -40,    maxX: -36,    minY: 0, maxY: 3, minZ:  36.5,  maxZ:  39.5  },

  // ── Control Hub console ──
  { minX:  37,    maxX:  41,    minY: 0, maxY: 1.1, minZ: -43,  maxZ: -37    },

  // ── Main Hall support columns (square approximation, 4 columns) ──
  { minX: -9.6,   maxX: -8.4,   minY: 0, maxY: 7.5, minZ: -6.6, maxZ: -5.4  },
  { minX:  8.4,   maxX:  9.6,   minY: 0, maxY: 7.5, minZ: -6.6, maxZ: -5.4  },
  { minX: -9.6,   maxX: -8.4,   minY: 0, maxY: 7.5, minZ:  5.4, maxZ:  6.6  },
  { minX:  8.4,   maxX:  9.6,   minY: 0, maxY: 7.5, minZ:  5.4, maxZ:  6.6  },

  // ── Server racks (NW room) — 6 racks, two rows of 3 ──
  { minX: -47.6,  maxX: -46.9,  minY: 0, maxY: 3, minZ: -45.9,  maxZ: -44.1  },
  { minX: -47.6,  maxX: -46.9,  minY: 0, maxY: 3, minZ: -40.9,  maxZ: -39.1  },
  { minX: -47.6,  maxX: -46.9,  minY: 0, maxY: 3, minZ: -35.9,  maxZ: -34.1  },
  { minX: -44.4,  maxX: -43.6,  minY: 0, maxY: 3, minZ: -45.9,  maxZ: -44.1  },
  { minX: -44.4,  maxX: -43.6,  minY: 0, maxY: 3, minZ: -40.9,  maxZ: -39.1  },
  { minX: -44.4,  maxX: -43.6,  minY: 0, maxY: 3, minZ: -35.9,  maxZ: -34.1  },

  // ── Corridor A cover boxes ──
  { minX: -26,    maxX: -24,    minY: 0, maxY: 1.5, minZ: -12,   maxZ: -10    },
  { minX: -26,    maxX: -24,    minY: 0, maxY: 1.5, minZ:  10,   maxZ:  12    },

  // ── Corridor B cover boxes ──
  { minX:  24,    maxX:  26,    minY: 0, maxY: 1.5, minZ: -12,   maxZ: -10    },
  { minX:  24,    maxX:  26,    minY: 0, maxY: 1.5, minZ:  10,   maxZ:  12    },

  // ── Chokepoint side walls (z=+25 to +38) ──
  { minX: -4,     maxX: -3,     minY: 0, maxY: 9, minZ:  25,    maxZ:  38    },
  { minX:  3,     maxX:  4,     minY: 0, maxY: 9, minZ:  25,    maxZ:  38    },

  // ── Chokepoint barricades ──
  { minX: -2.75,  maxX: -0.25,  minY: 0, maxY: 1.8, minZ: 28.5, maxZ: 29.5  },
  { minX:  0.25,  maxX:  2.75,  minY: 0, maxY: 1.8, minZ: 34.5, maxZ: 35.5  },

  // ── Corridor A outer west wall — mid-map z=-27 to +27 ──
  { minX: -30,    maxX: -29,    minY: 0, maxY: 9, minZ: -27,    maxZ:  27    },

  // ── Corridor B outer east wall — mid-map z=-27 to +27 ──
  { minX:  29,    maxX:  30,    minY: 0, maxY: 9, minZ: -27,    maxZ:  27    },

  // ── Catwalk walkable surface (maxY=5.8 = grate mesh top: centre 5.65 + half 0.15) ──
  { minX: -2,     maxX:  2,     minY: 5.2, maxY: 5.8, minZ: -30,  maxZ:  30  },
];

export function getCollisionBoxes() { return TERMINAL_AABBS; }
