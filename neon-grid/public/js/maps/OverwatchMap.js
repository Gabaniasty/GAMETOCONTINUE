// ── OVERWATCH Map — 100×100 cyberpunk rooftop arena ─────────────────────────
// Multi-level outdoor map: ground plaza, two enterable buildings, center bridge,
// sniper nests at y=20, animated night sky with flying vehicle lights.
// THREE is a global loaded via CDN before this module is imported.

// ── Shared materials ─────────────────────────────────────────────────────────
let matFloor, matPlaza, matWall, matRoof, matGlowCyan, matGlowPink, matGlowPurp,
    matMetal, matConcrete, matDark;

function _initMaterials() {
  matFloor    = new THREE.MeshStandardMaterial({ color: 0x0a1520, roughness: 0.92, metalness: 0.1 });
  matPlaza    = new THREE.MeshStandardMaterial({ color: 0x111a22, roughness: 0.88, metalness: 0.15 });
  matWall     = new THREE.MeshStandardMaterial({ color: 0x0d2030, roughness: 0.85, metalness: 0.3 });
  matRoof     = new THREE.MeshStandardMaterial({ color: 0x0a1a28, roughness: 0.9, metalness: 0.2 });
  matGlowCyan = new THREE.MeshStandardMaterial({ color: 0x00f5ff, emissive: 0x00f5ff, emissiveIntensity: 1.2 });
  matGlowPink = new THREE.MeshStandardMaterial({ color: 0xff2d78, emissive: 0xff2d78, emissiveIntensity: 1.2 });
  matGlowPurp = new THREE.MeshStandardMaterial({ color: 0x7b2fff, emissive: 0x7b2fff, emissiveIntensity: 1.2 });
  matMetal    = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.6, metalness: 0.85 });
  matConcrete = new THREE.MeshStandardMaterial({ color: 0x1c2e3d, roughness: 0.95, metalness: 0.05 });
  matDark     = new THREE.MeshStandardMaterial({ color: 0x0a1520, roughness: 0.9, metalness: 0.1 });
}

function _box(scene, w, h, d, mat, cx, cy, cz) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(cx, cy, cz);
  scene.add(m);
  return m;
}

// ── Sky sphere with animated vehicle lights ───────────────────────────────────
let _skyTexture = null, _skyCtx = null, _skyBaseCanvas = null;
let _vehicleDots = [];
let _vehicleLights = [];
let _antennaLight = null;
let _antennaFlicker = 0;

function _buildSky(scene) {
  const W = 2048, H = 1024;

  // Pre-render static sky background to base canvas
  _skyBaseCanvas = document.createElement('canvas');
  _skyBaseCanvas.width = W; _skyBaseCanvas.height = H;
  const base = _skyBaseCanvas.getContext('2d');

  // Purple-black → dark-blue gradient
  const grad = base.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0,    '#04000e');
  grad.addColorStop(0.35, '#080418');
  grad.addColorStop(0.65, '#0a0625');
  grad.addColorStop(0.85, '#080515');
  grad.addColorStop(1,    '#030008');
  base.fillStyle = grad;
  base.fillRect(0, 0, W, H);

  // City silhouette strip at horizon
  base.fillStyle = '#020206';
  const silH = H * 0.14;
  const yBase = H * 0.86;
  const blocks = [
    [0, 0.10], [0.06, 0.18], [0.14, 0.08], [0.18, 0.22], [0.26, 0.12],
    [0.30, 0.07], [0.33, 0.16], [0.40, 0.24], [0.48, 0.10], [0.52, 0.19],
    [0.58, 0.08], [0.62, 0.20], [0.70, 0.13], [0.74, 0.09], [0.78, 0.17],
    [0.84, 0.11], [0.88, 0.25], [0.93, 0.07], [0.96, 0.15],
  ];
  blocks.forEach(([x, h]) => {
    const w = (0.04 + Math.random() * 0.04) * W;
    const bh = h * silH;
    base.fillRect(x * W, yBase - bh, w, bh + H * 0.14 + 2);
    // Building windows (tiny lit rectangles)
    base.fillStyle = 'rgba(100,120,200,0.4)';
    for (let wy = yBase - bh + 4; wy < yBase - 4; wy += 6) {
      for (let wx = x * W + 3; wx < x * W + w - 3; wx += 5) {
        if (Math.random() > 0.45) {
          base.fillRect(wx, wy, 2, 3);
        }
      }
    }
    base.fillStyle = '#020206';
  });

  // ~300 star dots
  for (let i = 0; i < 300; i++) {
    const sx   = Math.random() * W;
    const sy   = Math.random() * H * 0.82;
    const sr   = 0.4 + Math.random() * 1.4;
    const alpha = 0.3 + Math.random() * 0.7;
    base.fillStyle = `rgba(220,230,255,${alpha})`;
    base.beginPath();
    base.arc(sx, sy, sr, 0, Math.PI * 2);
    base.fill();
  }

  // 3 neon billboard rectangles
  const billboards = [
    { x: W * 0.12, y: H * 0.55, w: 80, h: 32, color: '#ff2d78', label: 'NEON' },
    { x: W * 0.50, y: H * 0.60, w: 100, h: 28, color: '#00f5ff', label: 'GRID' },
    { x: W * 0.80, y: H * 0.52, w: 70, h: 30, color: '#7b2fff', label: 'CORP' },
  ];
  billboards.forEach(({ x, y, w, h: bh, color, label }) => {
    base.strokeStyle = color;
    base.lineWidth = 2;
    base.strokeRect(x, y, w, bh);
    base.fillStyle = color.replace(')', ',0.12)').replace('rgb', 'rgba');
    base.fillRect(x + 1, y + 1, w - 2, bh - 2);
    base.fillStyle = color;
    base.font = `bold ${bh * 0.7}px monospace`;
    base.textAlign = 'center';
    base.textBaseline = 'middle';
    base.fillText(label, x + w / 2, y + bh / 2);
  });

  // Animation canvas (gets blitted every frame)
  const animCanvas = document.createElement('canvas');
  animCanvas.width = W; animCanvas.height = H;
  _skyCtx = animCanvas.getContext('2d');

  // 4 vehicle light dots
  _vehicleDots = [
    { x: W * 0.08, y: H * 0.18, speed:  22, r: 2.5, color: 'rgba(255,240,180,0.95)' },
    { x: W * 0.35, y: H * 0.28, speed: -16, r: 2.0, color: 'rgba(200,230,255,0.9)'  },
    { x: W * 0.62, y: H * 0.14, speed:  28, r: 1.8, color: 'rgba(255,200,255,0.9)'  },
    { x: W * 0.82, y: H * 0.23, speed: -20, r: 2.2, color: 'rgba(255,240,180,0.85)' },
  ];

  // Sky sphere (inside-out)
  _skyTexture = new THREE.CanvasTexture(animCanvas);
  const skyMat = new THREE.MeshBasicMaterial({ map: _skyTexture, side: THREE.BackSide });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(190, 32, 20), skyMat));

  // Atmospheric fog and hemisphere light
  scene.fog = new THREE.FogExp2(0x050510, 0.018);
  scene.add(new THREE.HemisphereLight(0xff2d78, 0x000008, 0.4));

  // 4 PointLights that move in the sky (simulate flying vehicle headlights)
  const skyLightPositions = [
    { x: -80, z: -80 }, { x: 70, z: -60 }, { x: -60, z: 70 }, { x: 80, z: 80 },
  ];
  skyLightPositions.forEach((p) => {
    const pl = new THREE.PointLight(0xffffff, 1, 3);
    pl.position.set(p.x, 170, p.z);
    scene.add(pl);
    _vehicleLights.push({ light: pl, angle: Math.random() * Math.PI * 2, radius: 90, speed: 0.08 + Math.random() * 0.06 });
  });
}

// ── Ground floor ─────────────────────────────────────────────────────────────
function _buildFloor(scene) {
  // 100×100 main floor plane
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), matFloor);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // Neon grid overlay (dim — outdoor setting)
  const grid = new THREE.GridHelper(100, 50, 0x7b2fff, 0x110022);
  grid.material.transparent = true;
  grid.material.opacity = 0.25;
  scene.add(grid);

  // 40×40 hexagonal-patterned plaza quad at centre
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), matPlaza);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.01;
  scene.add(plaza);

  // Plaza border glow lines
  const edgeMat = matGlowPurp;
  [[40, 0.05, 0, 0, -20], [40, 0.05, 0, 0, 20],
   [0.05, 40, -20, 0, 0], [0.05, 40, 20, 0, 0]].forEach(([w, d, cx, cy, cz]) => {
    _box(scene, w, 0.04, 0.12, edgeMat, cx, cy + 0.02, cz);
  });
}

// ── Ground cover — 8 concrete barriers in plus pattern ─────────────────────
function _buildGroundCover(scene) {
  const positions = [
    // North axis (face Z, 8×1.4×0.8)
    { x:  0, z: -16, ry: 0 }, { x: 0, z: -10, ry: 0 },
    // South axis
    { x:  0, z:  10, ry: 0 }, { x: 0, z:  16, ry: 0 },
    // West axis (face X, rotated 90°)
    { x: -16, z: 0, ry: Math.PI / 2 }, { x: -10, z: 0, ry: Math.PI / 2 },
    // East axis
    { x:  10, z: 0, ry: Math.PI / 2 }, { x:  16, z: 0, ry: Math.PI / 2 },
  ];

  positions.forEach(({ x, z, ry }) => {
    const barrier = new THREE.Mesh(new THREE.BoxGeometry(8, 1.4, 0.8), matConcrete);
    barrier.position.set(x, 0.7, z);
    barrier.rotation.y = ry;
    scene.add(barrier);

    // Cyan emissive top-edge trim via EdgesGeometry
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(8, 1.4, 0.8)),
      new THREE.LineBasicMaterial({ color: 0x00f5ff, transparent: true, opacity: 0.6 })
    );
    edges.position.set(x, 0.7, z);
    edges.rotation.y = ry;
    scene.add(edges);
  });
}

// ── Buildings ─────────────────────────────────────────────────────────────────
// West building: 20×12×16, centered at (-20, 6, 0), x=-30 to -10, z=-8 to +8
// East building: 20×12×16, centered at (+20, 6, 0), x=+10 to +30, z=-8 to +8
// Doors (6 wide, full height) on north and south faces.

function _buildBuilding(scene, cx) {
  const hw = 10, hd = 8;  // half-width, half-depth
  const H  = 12;

  // West wall
  _box(scene, 1, H, 16, matWall, cx - hw, H / 2, 0);
  // East wall
  _box(scene, 1, H, 16, matWall, cx + hw, H / 2, 0);

  // North face: left and right sections with 6-wide door gap (x = cx±3)
  const doorHW = 3;
  const sideSeg = hw - doorHW;    // 7 units each side
  _box(scene, sideSeg, H, 1, matWall, cx - hw + sideSeg / 2, H / 2, -hd);
  _box(scene, sideSeg, H, 1, matWall, cx + hw - sideSeg / 2, H / 2, -hd);
  // Lintel above door gap (y = 3.5 to 12, blocks bullets/sight but not walking)
  _box(scene, 6, H - 3.5, 1, matWall, cx, (3.5 + H) / 2, -hd);

  // South face: same
  _box(scene, sideSeg, H, 1, matWall, cx - hw + sideSeg / 2, H / 2, hd);
  _box(scene, sideSeg, H, 1, matWall, cx + hw - sideSeg / 2, H / 2, hd);
  _box(scene, 6, H - 3.5, 1, matWall, cx, (3.5 + H) / 2, hd);

  // Interior floor slab (thinner, cosmetic)
  const intFloor = new THREE.Mesh(new THREE.PlaneGeometry(18, 14), matDark);
  intFloor.rotation.x = -Math.PI / 2;
  intFloor.position.set(cx, 0.02, 0);
  scene.add(intFloor);

  // Cyan glow strips on interior walls
  [-hw + 0.6, hw - 0.6].forEach((ox) => {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 12), matGlowCyan);
    strip.position.set(cx + ox, H - 0.5, 0);
    scene.add(strip);
  });

  const intLight = new THREE.PointLight(0x00f5ff, 2, 14);
  intLight.position.set(cx, H * 0.6, 0);
  scene.add(intLight);

  // Interior ramp: BoxGeometry(4, 0.4, hyp) tilted 45° from z=+6 (ground) to z=-6 (roof)
  // hyp = sqrt(12²+12²) ≈ 16.97, centered at (cx, 6, 0), rotation.x = -PI/4
  const hyp  = Math.sqrt(12 * 12 + 12 * 12);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, hyp), matConcrete);
  ramp.position.set(cx, 6, 0);
  ramp.rotation.x = -Math.PI / 4;
  scene.add(ramp);

  // Ramp side rails (visual)
  [-2.1, 2.1].forEach((ox) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, hyp), matGlowCyan);
    rail.position.set(cx + ox, 6.25, 0);
    rail.rotation.x = -Math.PI / 4;
    scene.add(rail);
  });

  // Interior cover crates (4)
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x132030, roughness: 0.9 });
  [[-hw + 3, -hd + 3], [-hw + 3, hd - 3], [hw - 3, -hd + 3], [hw - 3, hd - 3]].forEach(([ox, oz]) => {
    _box(scene, 2, 1.4, 2, crateMat, cx + ox, 0.7, oz);
  });
}

// ── Rooftop slabs ─────────────────────────────────────────────────────────────
function _buildRooftops(scene) {
  const ROOF_Y = 12.25;

  // West rooftop (20×0.5×16) at y=12.25
  const westSlab = _box(scene, 20, 0.5, 16, matRoof, -20, ROOF_Y, 0);

  // East rooftop
  const eastSlab = _box(scene, 20, 0.5, 16, matRoof,  20, ROOF_Y, 0);

  // North catwalk from west rooftop (6×0.4×20, extends north)
  _box(scene, 6, 0.4, 20, matConcrete, -20, ROOF_Y, -18);

  // South catwalk from east rooftop
  _box(scene, 6, 0.4, 20, matConcrete,  20, ROOF_Y,  18);

  // Catwalk edge glow strips
  [[-23, -28], [-17, -28]].forEach(([x, z]) => {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 20), matGlowCyan);
    strip.position.set(x, ROOF_Y + 0.2, z);
    scene.add(strip);
  });
  [[17, 28], [23, 28]].forEach(([x, z]) => {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 20), matGlowCyan);
    strip.position.set(x, ROOF_Y + 0.2, z);
    scene.add(strip);
  });

  // Low parapet walls (0.8 tall) along all four rooftop edges — west rooftop
  const parH = 0.8;
  const parY = ROOF_Y + parH / 2;
  // North edge
  _box(scene, 20, parH, 0.4, matConcrete, -20, parY, -8.2);
  // South edge
  _box(scene, 20, parH, 0.4, matConcrete, -20, parY,  8.2);
  // West edge
  _box(scene, 0.4, parH, 16, matConcrete, -30.2, parY, 0);
  // East edge (open/partial — bridge side)
  _box(scene, 0.4, parH,  5, matConcrete, -10.2, parY, -5.5);
  _box(scene, 0.4, parH,  5, matConcrete, -10.2, parY,  5.5);

  // Low parapet walls — east rooftop
  _box(scene, 20, parH, 0.4, matConcrete,  20, parY, -8.2);
  _box(scene, 20, parH, 0.4, matConcrete,  20, parY,  8.2);
  _box(scene, 0.4, parH, 16, matConcrete,  30.2, parY, 0);
  _box(scene, 0.4, parH,  5, matConcrete,  10.2, parY, -5.5);
  _box(scene, 0.4, parH,  5, matConcrete,  10.2, parY,  5.5);
}

// ── Rooftop clutter ───────────────────────────────────────────────────────────
function _buildRooftopDetails(scene, cx) {
  const ROOF_Y = 12.5;

  // 3 AC units — offset from building center (cx) so they stay on the rooftop slab
  // West roof: x ∈ [-30, -10] (cx = -20); East roof: x ∈ [10, 30] (cx = 20)
  const acMat = new THREE.MeshStandardMaterial({ color: 0x1a2e42, roughness: 0.8, metalness: 0.5 });
  const acOffsets = [[-4, -4], [-4, 4], [4, 0]]; // [xOffset, zOffset] from cx

  acOffsets.forEach(([xOff, oz]) => {
    const ax = cx + xOff;
    const ac = _box(scene, 2.5, 1.8, 2.5, acMat, ax, ROOF_Y + 0.9, oz);
    const ventStrip = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.12), matGlowPink);
    ventStrip.position.set(ax, ROOF_Y + 0.6, oz + (cx < 0 ? 1.3 : -1.3));
    scene.add(ventStrip);
  });

  // 2 ventilation pipes
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.5, metalness: 0.9 });
  [[cx + (cx < 0 ? 3 : -3), ROOF_Y + 1, -6], [cx + (cx < 0 ? 3 : -3), ROOF_Y + 1, 6]].forEach(([px, py, pz]) => {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2, 8), pipeMat);
    pipe.position.set(px, py, pz);
    scene.add(pipe);
  });

  // Satellite dish (flat cylinder + pole)
  const dishPx = cx + (cx < 0 ? 6 : -6);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.5, 6), pipeMat);
  pole.position.set(dishPx, ROOF_Y + 0.75, 0);
  scene.add(pole);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.1, 0.2, 16), pipeMat);
  dish.position.set(dishPx, ROOF_Y + 1.6, 0);
  dish.rotation.z = 0.4;
  scene.add(dish);
}

// ── Center bridge ─────────────────────────────────────────────────────────────
function _buildBridge(scene) {
  const BY = 12.25;

  // Main bridge slab (40 wide × 0.5 × 6 deep)
  _box(scene, 40, 0.5, 6, matConcrete, 0, BY, 0);

  // Purple glowing railings
  [-3.1, 3.1].forEach((bz) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(40, 0.5, 0.12), matGlowPurp);
    rail.position.set(0, BY + 0.75, bz);
    scene.add(rail);
  });

  // 3 support arches below bridge
  [-12, 0, 12].forEach((bx) => {
    _box(scene, 1, BY, 0.5, matMetal, bx, BY / 2, -2.5);
    _box(scene, 1, BY, 0.5, matMetal, bx, BY / 2,  2.5);
  });

  // Bridge underside purple glow
  const bridgeLight = new THREE.PointLight(0x7b2fff, 3, 20);
  bridgeLight.position.set(0, BY - 1, 0);
  scene.add(bridgeLight);
}

// ── Antenna tower (center landmark) ──────────────────────────────────────────
function _buildAntenna(scene) {
  // Base cube
  _box(scene, 3, 3, 3, matMetal, 0, 1.5, 0);

  // Shaft
  _box(scene, 1, 18, 1, matMetal, 0, 12, 0);

  // 3 cross-beams
  [-2, 0, 4].forEach((offset) => {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 0.2), matGlowCyan);
    beam.position.set(0, 6 + offset * 1.5, 0);
    scene.add(beam);
  });

  // Blinking red point light at top
  _antennaLight = new THREE.PointLight(0xff0000, 2, 8);
  _antennaLight.position.set(0, 21.5, 0);
  scene.add(_antennaLight);

  // Thin top antenna cylinder
  const antMat = new THREE.MeshStandardMaterial({ color: 0x445566, metalness: 0.9 });
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), antMat);
  ant.position.set(0, 22.5, 0);
  scene.add(ant);

  // Red blinker (top)
  const blinker = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff2200, emissiveIntensity: 2 }));
  blinker.position.set(0, 24, 0);
  scene.add(blinker);
}

// ── Sniper nests ──────────────────────────────────────────────────────────────
// Returns {nwTrigger, seTrigger} trigger volumes for game loop proximity check
function _buildSniperNests(scene) {
  const NEST_Y = 20.25;

  function buildNest(scene, nx, nz, openDir) {
    // Platform (10×0.5×10)
    _box(scene, 10, 0.5, 10, matConcrete, nx, NEST_Y, nz);

    // Parapet walls on 3 sides (open toward map center)
    const parH  = 1.2;
    const parY  = NEST_Y + parH / 2;
    const sides = [
      { w: 10.4, h: parH, d: 0.4, cx: nx, cy: parY, cz: nz + (nz < 0 ? -5.2 : 5.2) },  // back
      { w: 0.4,  h: parH, d: 10, cx: nx + (nx < 0 ? -5.2 : 5.2), cy: parY, cz: nz },    // side A
      { w: 10.4, h: parH, d: 0.4, cx: nx, cy: parY, cz: nz + (nz < 0 ? 5.2 : -5.2), skip: openDir }, // front (open side — skip)
    ];
    sides.forEach(({ w, h, d, cx, cy, cz, skip }) => {
      if (!skip) _box(scene, w, h, d, matConcrete, cx, cy, cz);
    });

    // Sandbag stacks (visual only)
    const sbMat = new THREE.MeshStandardMaterial({ color: 0x2a3a1a, roughness: 0.95 });
    [[nx - 3, nz + (nz < 0 ? -3.5 : 3.5)], [nx + 3, nz + (nz < 0 ? -3.5 : 3.5)]].forEach(([sx, sz]) => {
      _box(scene, 2, 0.6, 0.8, sbMat, sx, NEST_Y + 0.55, sz);
      _box(scene, 1.8, 0.5, 0.8, sbMat, sx + 0.1, NEST_Y + 1.05, sz);
    });

    // Pink nest spotlight
    const nestLight = new THREE.PointLight(0xff2d78, 3, 15);
    nestLight.position.set(nx, NEST_Y + 4, nz);
    scene.add(nestLight);
  }

  buildNest(scene, -40, -35, true);  // NW nest, open toward SE
  buildNest(scene,  40,  35, true);  // SE nest, open toward NW

  // Invisible ladder trigger volumes (rooftop corners, checked in game loop)
  // NW nest trigger: NW corner of west rooftop, around x=-28 to -22, z=-8 to -4
  const nwTrigger = { minX: -30, maxX: -24, minY: 12.0, maxY: 15.0, minZ: -8.0, maxZ: -3.5,
                       targetX: -40, targetY: 21.65, targetZ: -35 };

  // SE nest trigger: SE corner of east rooftop, around x=24 to 30, z=3.5 to 8
  const seTrigger = { minX: 24, maxX: 30, minY: 12.0, maxY: 15.0, minZ: 3.5, maxZ: 8.0,
                       targetX: 40, targetY: 21.65, targetZ: 35 };

  return { nwTrigger, seTrigger };
}

// ── Lighting and street poles ─────────────────────────────────────────────────
function _addAtmosphere(scene) {
  // Ambient light
  scene.add(new THREE.AmbientLight(0x0a1a2a, 2.0));

  // 8 street-light poles ringing the ground plaza
  const polePositions = [
    [-18, -18], [0, -22], [18, -18],
    [-22,   0],            [22,   0],
    [-18,  18], [0,  22], [18,  18],
  ];
  polePositions.forEach(([px, pz]) => {
    // Pole shaft
    _box(scene, 0.25, 10, 0.25,
      new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.8, metalness: 0.7 }),
      px, 5, pz);
    // Lamp head
    _box(scene, 0.6, 0.3, 0.6,
      new THREE.MeshStandardMaterial({ color: 0xaabbcc, emissive: 0xaabbcc, emissiveIntensity: 0.8 }),
      px, 10.15, pz);
    // Point light
    const pl = new THREE.PointLight(0xaaaaff, 2, 18);
    pl.position.set(px, 10, pz);
    scene.add(pl);
  });

  // Rooftop point lights (cyan + pink)
  [[-20, 13, -4], [-20, 13, 4], [20, 13, -4], [20, 13, 4]].forEach(([x, y, z], i) => {
    const col = i % 2 === 0 ? 0x00f5ff : 0xff2d78;
    const pl = new THREE.PointLight(col, 2.5, 14);
    pl.position.set(x, y, z);
    scene.add(pl);
  });
}

// ── Spawn points ──────────────────────────────────────────────────────────────
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

// ── OverwatchMap class ────────────────────────────────────────────────────────
export class OverwatchMap {
  constructor(scene) {
    this.scene            = scene;
    this.collidableMeshes = [];
    this.spawnPoints      = [];
    this.loaded           = false;

    this.ladderTriggers   = [];
    this._ladderCooldown  = 0;
    this._antennaTimer    = 0;
  }

  load(_path, onReady) {
    const loadText = document.getElementById('loadingText');
    if (loadText) loadText.textContent = 'BUILDING OVERWATCH...';

    _initMaterials();

    this.scene.background = new THREE.Color(0x050010);

    _buildSky(this.scene);
    _buildFloor(this.scene);
    _buildGroundCover(this.scene);
    _buildBuilding(this.scene, -20);  // west building
    _buildBuilding(this.scene,  20);  // east building
    _buildRooftops(this.scene);
    _buildRooftopDetails(this.scene, -20);
    _buildRooftopDetails(this.scene,  20);
    _buildBridge(this.scene);
    _buildAntenna(this.scene);

    const { nwTrigger, seTrigger } = _buildSniperNests(this.scene);
    this.ladderTriggers = [nwTrigger, seTrigger];

    _addAtmosphere(this.scene);

    // Build invisible collision meshes from OVERWATCH_AABBS
    const invisMat = new THREE.MeshBasicMaterial({ visible: false });
    for (const box of OVERWATCH_AABBS) {
      const w = box.maxX - box.minX;
      const h = box.maxY - box.minY;
      const d = box.maxZ - box.minZ;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), invisMat);
      mesh.position.set(
        (box.minX + box.maxX) / 2,
        (box.minY + box.maxY) / 2,
        (box.minZ + box.maxZ) / 2,
      );
      mesh.userData.isMapGeometry = true;
      mesh.userData.surface = _owSurfaceType(box);
      this.scene.add(mesh);
      this.collidableMeshes.push(mesh);
    }

    const { spawnA, spawnB } = _buildSpawns();
    this.spawnPoints = [...spawnA, ...spawnB];

    this.scene.updateMatrixWorld(true);
    this.loaded = true;

    const fill = document.getElementById('loadingFill');
    if (fill) fill.style.width = '100%';

    const screen = document.getElementById('loadingScreen');
    if (screen) {
      screen.style.transition = 'opacity 0.6s ease';
      screen.style.opacity    = '0';
      setTimeout(() => { screen.style.display = 'none'; }, 650);
    }

    if (onReady) onReady(this);
  }

  // ── Per-frame animation ────────────────────────────────────────────────────
  update(dt) {
    if (!this.loaded) return;

    // Antenna blink every 1.2 s
    this._antennaTimer += dt;
    if (_antennaLight) {
      _antennaLight.intensity = Math.floor(this._antennaTimer / 0.6) % 2 === 0 ? 2.5 : 0;
    }

    // Animate sky vehicle dots + vehicle lights
    if (_skyCtx && _skyTexture) {
      const W = _skyBaseCanvas.width;
      _skyCtx.drawImage(_skyBaseCanvas, 0, 0);

      _vehicleDots.forEach((dot) => {
        dot.x += dot.speed * (W / 100) * dt;
        if (dot.x > W) dot.x -= W;
        if (dot.x < 0) dot.x += W;

        // Halo
        const halo = _skyCtx.createRadialGradient(dot.x, dot.y, 0, dot.x, dot.y, 9);
        halo.addColorStop(0, dot.color);
        halo.addColorStop(1, 'rgba(255,255,255,0)');
        _skyCtx.fillStyle = halo;
        _skyCtx.beginPath();
        _skyCtx.arc(dot.x, dot.y, 9, 0, Math.PI * 2);
        _skyCtx.fill();

        // Core dot
        _skyCtx.fillStyle = dot.color;
        _skyCtx.beginPath();
        _skyCtx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        _skyCtx.fill();
      });

      _skyTexture.needsUpdate = true;
    }

    // Move sky point lights along circular paths
    _vehicleLights.forEach((vl) => {
      vl.angle += vl.speed * dt;
      vl.light.position.x = Math.cos(vl.angle) * vl.radius;
      vl.light.position.z = Math.sin(vl.angle) * vl.radius;
    });
  }

  // ── Nest trigger check — call each frame from game loop ───────────────────
  // Returns null or { targetX, targetY, targetZ } if player should be teleported
  checkNestTrigger(camera, dt) {
    if (this._ladderCooldown > 0) {
      this._ladderCooldown -= dt;
      return null;
    }
    const px = camera.position.x;
    const py = camera.position.y;
    const pz = camera.position.z;

    for (const t of this.ladderTriggers) {
      if (px < t.minX || px > t.maxX) continue;
      if (py < t.minY || py > t.maxY) continue;
      if (pz < t.minZ || pz > t.maxZ) continue;
      this._ladderCooldown = 1.0;
      return { targetX: t.targetX, targetY: t.targetY, targetZ: t.targetZ };
    }
    return null;
  }

  getCollidableMeshes() { return this.collidableMeshes; }
  getSpawnPoints()      { return this.spawnPoints; }
}

// ── Surface type classifier ────────────────────────────────────────────────────
function _owSurfaceType(box) {
  const h = box.maxY - box.minY;
  // Bridge / rooftop slabs / nest platforms (thin horizontal, elevated)
  if (h <= 0.6 && box.minY >= 11) return 'metal';
  // Parapet walls
  if (h <= 1.5 && box.minY >= 12) return 'concrete';
  return 'concrete';
}

// ── Nest trigger zones (exported for external access) ─────────────────────────
export const OVERWATCH_NEST_TRIGGERS = [
  { minX: -30, maxX: -24, minY: 12.0, maxY: 15.0, minZ: -8.0, maxZ: -3.5, targetX: -40, targetY: 21.65, targetZ: -35 },
  { minX:  24, maxX:  30, minY: 12.0, maxY: 15.0, minZ:  3.5, maxZ:  8.0, targetX:  40, targetY: 21.65, targetZ:  35 },
];

// ── Collision AABBs ────────────────────────────────────────────────────────────
// Covers all solid surfaces for client physics and server LOS raycasting.
export const OVERWATCH_AABBS = [
  // ── Ground floor (full 100×100 slab) ──
  { minX: -50, maxX: 50, minY: -0.5, maxY: 0, minZ: -50, maxZ: 50 },
  // ── Outer boundary walls (keep players in map) ──
  { minX: -50, maxX:  50, minY: 0, maxY: 3, minZ:  -50, maxZ: -48.5 },
  { minX: -50, maxX:  50, minY: 0, maxY: 3, minZ:  48.5, maxZ:  50  },
  { minX: -50, maxX: -48.5, minY: 0, maxY: 3, minZ: -50, maxZ:  50  },
  { minX:  48.5, maxX: 50, minY: 0, maxY: 3, minZ: -50, maxZ:  50   },

  // ── West building shell ──
  // West wall (full depth)
  { minX: -30, maxX: -29, minY: 0, maxY: 12, minZ: -8, maxZ: 8 },
  // East wall
  { minX: -11, maxX: -10, minY: 0, maxY: 12, minZ: -8, maxZ: 8 },
  // North face — left section (x=-30 to -23)
  { minX: -30, maxX: -23, minY: 0, maxY: 12, minZ: -8, maxZ: -7 },
  // North face — right section (x=-17 to -10)
  { minX: -17, maxX: -10, minY: 0, maxY: 12, minZ: -8, maxZ: -7 },
  // North door lintel (y=3.5 to 12, blocks bullets but not walking)
  { minX: -23, maxX: -17, minY: 3.5, maxY: 12, minZ: -8, maxZ: -7 },
  // South face — left section
  { minX: -30, maxX: -23, minY: 0, maxY: 12, minZ: 7, maxZ: 8 },
  // South face — right section
  { minX: -17, maxX: -10, minY: 0, maxY: 12, minZ: 7, maxZ: 8 },
  // South door lintel
  { minX: -23, maxX: -17, minY: 3.5, maxY: 12, minZ: 7, maxZ: 8 },

  // ── West building interior ramp (staircase approximation for LOS) ──
  { minX: -22, maxX: -18, minY: 0, maxY: 4,  minZ:  2, maxZ: 7  },
  { minX: -22, maxX: -18, minY: 4, maxY: 8,  minZ: -4, maxZ: 2  },
  { minX: -22, maxX: -18, minY: 8, maxY: 12, minZ: -7, maxZ: -4 },

  // ── West rooftop slab (20×0.5×16) ──
  { minX: -30, maxX: -10, minY: 12, maxY: 12.5, minZ: -8, maxZ: 8 },

  // ── West rooftop low parapet walls ──
  { minX: -30, maxX: -10,    minY: 12.5, maxY: 13.3, minZ: -8.5, maxZ: -8.0  },  // north
  { minX: -30, maxX: -10,    minY: 12.5, maxY: 13.3, minZ:  8.0, maxZ:  8.5  },  // south
  { minX: -30.5, maxX: -30,  minY: 12.5, maxY: 13.3, minZ: -8.0, maxZ:  8.0  },  // west
  { minX: -10.5, maxX: -10,  minY: 12.5, maxY: 13.3, minZ: -8.0, maxZ: -2.5  },  // east-north
  { minX: -10.5, maxX: -10,  minY: 12.5, maxY: 13.3, minZ:  2.5, maxZ:  8.0  },  // east-south

  // ── East building shell (mirrored) ──
  { minX:  29, maxX:  30, minY: 0, maxY: 12, minZ: -8, maxZ: 8 },
  { minX:  10, maxX:  11, minY: 0, maxY: 12, minZ: -8, maxZ: 8 },
  { minX:  10, maxX:  17, minY: 0, maxY: 12, minZ: -8, maxZ: -7 },
  { minX:  23, maxX:  30, minY: 0, maxY: 12, minZ: -8, maxZ: -7 },
  { minX:  17, maxX:  23, minY: 3.5, maxY: 12, minZ: -8, maxZ: -7 },
  { minX:  10, maxX:  17, minY: 0, maxY: 12, minZ: 7, maxZ: 8 },
  { minX:  23, maxX:  30, minY: 0, maxY: 12, minZ: 7, maxZ: 8 },
  { minX:  17, maxX:  23, minY: 3.5, maxY: 12, minZ: 7, maxZ: 8 },

  // ── East building interior ramp ──
  { minX:  18, maxX:  22, minY: 0, maxY: 4,  minZ:  2, maxZ: 7  },
  { minX:  18, maxX:  22, minY: 4, maxY: 8,  minZ: -4, maxZ: 2  },
  { minX:  18, maxX:  22, minY: 8, maxY: 12, minZ: -7, maxZ: -4 },

  // ── East rooftop slab ──
  { minX:  10, maxX:  30, minY: 12, maxY: 12.5, minZ: -8, maxZ: 8 },

  // ── East rooftop low parapet walls ──
  { minX:  10, maxX:  30,   minY: 12.5, maxY: 13.3, minZ: -8.5, maxZ: -8.0  },
  { minX:  10, maxX:  30,   minY: 12.5, maxY: 13.3, minZ:  8.0, maxZ:  8.5  },
  { minX:  30, maxX:  30.5, minY: 12.5, maxY: 13.3, minZ: -8.0, maxZ:  8.0  },
  { minX:  10, maxX:  10.5, minY: 12.5, maxY: 13.3, minZ: -8.0, maxZ: -2.5  },
  { minX:  10, maxX:  10.5, minY: 12.5, maxY: 13.3, minZ:  2.5, maxZ:  8.0  },

  // ── North catwalk (west rooftop, extends north) ──
  { minX: -23, maxX: -17, minY: 12, maxY: 12.4, minZ: -28, maxZ: -8 },

  // ── South catwalk (east rooftop, extends south) ──
  { minX:  17, maxX:  23, minY: 12, maxY: 12.4, minZ:  8, maxZ:  28 },

  // ── Center bridge (40×0.5×6) ──
  { minX: -20, maxX: 20, minY: 12, maxY: 12.5, minZ: -3, maxZ: 3 },

  // ── NW sniper nest platform ──
  { minX: -45, maxX: -35, minY: 20, maxY: 20.5, minZ: -40, maxZ: -30 },
  // NW nest parapets (3 sides, open toward map center / SE)
  { minX: -45, maxX: -35,   minY: 20.5, maxY: 21.7, minZ: -40.5, maxZ: -40 },   // north wall
  { minX: -45.5, maxX: -45, minY: 20.5, maxY: 21.7, minZ: -40,   maxZ: -30 },   // west wall
  { minX: -45, maxX: -35,   minY: 20.5, maxY: 21.7, minZ: -30,   maxZ: -29.5 }, // south wall (only partial)

  // ── SE sniper nest platform ──
  { minX:  35, maxX:  45, minY: 20, maxY: 20.5, minZ:  30, maxZ:  40 },
  // SE nest parapets
  { minX:  35, maxX:  45,   minY: 20.5, maxY: 21.7, minZ:  40,   maxZ:  40.5 }, // south wall
  { minX:  45, maxX:  45.5, minY: 20.5, maxY: 21.7, minZ:  30,   maxZ:  40   }, // east wall
  { minX:  35, maxX:  45,   minY: 20.5, maxY: 21.7, minZ:  29.5, maxZ:  30   }, // north wall (partial)

  // ── Center antenna tower ──
  { minX: -1.5, maxX: 1.5, minY:  0, maxY:  3, minZ: -1.5, maxZ: 1.5 },  // base
  { minX: -0.5, maxX: 0.5, minY:  3, maxY: 21, minZ: -0.5, maxZ: 0.5 },  // shaft

  // ── Ground concrete barriers (8, plus pattern) ──
  { minX: -4,    maxX:  4,    minY: 0, maxY: 1.4, minZ: -16.4, maxZ: -15.6 },
  { minX: -4,    maxX:  4,    minY: 0, maxY: 1.4, minZ: -10.4, maxZ:  -9.6 },
  { minX: -4,    maxX:  4,    minY: 0, maxY: 1.4, minZ:   9.6, maxZ:  10.4 },
  { minX: -4,    maxX:  4,    minY: 0, maxY: 1.4, minZ:  15.6, maxZ:  16.4 },
  { minX: -16.4, maxX: -15.6, minY: 0, maxY: 1.4, minZ:  -4,   maxZ:   4   },
  { minX: -10.4, maxX:  -9.6, minY: 0, maxY: 1.4, minZ:  -4,   maxZ:   4   },
  { minX:   9.6, maxX:  10.4, minY: 0, maxY: 1.4, minZ:  -4,   maxZ:   4   },
  { minX:  15.6, maxX:  16.4, minY: 0, maxY: 1.4, minZ:  -4,   maxZ:   4   },
];
