// ── Arena geometry — matches GameServer.js ARENA_AABBS exactly ────────────
const ARENA_AABBS = [
  // Outer walls
  { minX: -40,   maxX:  40,   minY: 0, maxY: 6, minZ: -40.5, maxZ: -39.5 },
  { minX: -40,   maxX:  40,   minY: 0, maxY: 6, minZ:  39.5, maxZ:  40.5 },
  { minX: -40.5, maxX: -39.5, minY: 0, maxY: 6, minZ: -40,   maxZ:  40   },
  { minX:  39.5, maxX:  40.5, minY: 0, maxY: 6, minZ: -40,   maxZ:  40   },
  // Centre corridor walls
  { minX:  -8.5, maxX:  -7.5, minY: 0, maxY: 4, minZ: -25,   maxZ:  25   },
  { minX:   7.5, maxX:   8.5, minY: 0, maxY: 4, minZ: -25,   maxZ:  25   },
  // Partial cross-walls
  { minX: -31,   maxX:  -9,   minY: 0, maxY: 4, minZ: -20.5, maxZ: -19.5 },
  { minX:   9,   maxX:  31,   minY: 0, maxY: 4, minZ: -20.5, maxZ: -19.5 },
  { minX: -31,   maxX:  -9,   minY: 0, maxY: 4, minZ:  19.5, maxZ:  20.5 },
  { minX:   9,   maxX:  31,   minY: 0, maxY: 4, minZ:  19.5, maxZ:  20.5 },
  // Cover crates
  { minX: -16.5, maxX: -13.5, minY: 0, maxY: 2, minZ: -16.5, maxZ: -13.5 },
  { minX:  13.5, maxX:  16.5, minY: 0, maxY: 2, minZ: -16.5, maxZ: -13.5 },
  { minX: -16.5, maxX: -13.5, minY: 0, maxY: 2, minZ:  13.5, maxZ:  16.5 },
  { minX:  13.5, maxX:  16.5, minY: 0, maxY: 2, minZ:  13.5, maxZ:  16.5 },
  { minX:  -1.5, maxX:   1.5, minY: 0, maxY: 2, minZ: -26.5, maxZ: -23.5 },
  { minX:  -1.5, maxX:   1.5, minY: 0, maxY: 2, minZ:  23.5, maxZ:  26.5 },
  { minX: -26.5, maxX: -23.5, minY: 0, maxY: 2, minZ:  -1.5, maxZ:   1.5 },
  { minX:  23.5, maxX:  26.5, minY: 0, maxY: 2, minZ:  -1.5, maxZ:   1.5 },
  // Corner pillars
  { minX: -36,   maxX: -34,   minY: 0, maxY: 6, minZ: -36,   maxZ: -34   },
  { minX:  34,   maxX:  36,   minY: 0, maxY: 6, minZ: -36,   maxZ: -34   },
  { minX: -36,   maxX: -34,   minY: 0, maxY: 6, minZ:  34,   maxZ:  36   },
  { minX:  34,   maxX:  36,   minY: 0, maxY: 6, minZ:  34,   maxZ:  36   },
  // Elevated platforms
  { minX: -24,   maxX: -16,   minY: 0, maxY: 1, minZ: -24,   maxZ: -16   },
  { minX:  16,   maxX:  24,   minY: 0, maxY: 1, minZ:  16,   maxZ:  24   },
];

export { ARENA_AABBS };

export class MapLoader {
  constructor(scene) {
    this.scene            = scene;
    this.collidableMeshes = [];
    this.spawnPoints      = [];
    this.loaded           = false;
  }

  // Build the arena procedurally — no GLB loading, no matrixWorld issues
  load(_path, onReady) {
    const loadText = document.getElementById('loadingText');
    if (loadText) loadText.textContent = 'BUILDING ARENA...';

    this._buildSky();
    this._buildFloor();
    this._buildArenaBlocks();
    this._addAtmosphere();
    this._setupSpawnPoints();

    // Force world matrices so bullet raycasts work on frame 0
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

  // ── Sky sphere + sun ───────────────────────────────────────────────────────
  _buildSky() {
    const SKY_COLOR = 0x4a9fcc;
    this.scene.background = new THREE.Color(SKY_COLOR);
    // Gentle fog — only hides things very far away (outer walls ~40 units)
    this.scene.fog = new THREE.Fog(SKY_COLOR, 80, 200);

    // Sky dome — BackSide so interior is visible when looking up
    const skyGeo = new THREE.SphereGeometry(450, 32, 16);
    const skyMat = new THREE.MeshBasicMaterial({ color: SKY_COLOR, side: THREE.BackSide });
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));

    // Sun disc
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(10, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xfffbe0 }),
    );
    sun.position.set(90, 200, -280);
    this.scene.add(sun);

    // Sun glow ring
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(18, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.3 }),
    );
    glow.position.copy(sun.position);
    this.scene.add(glow);
  }

  // ── Floor plane ────────────────────────────────────────────────────────────
  _buildFloor() {
    // Clearly visible dark-teal floor (not black)
    const floorMat = new THREE.MeshBasicMaterial({ color: 0x0e2233 });
    const floor    = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // Neon grid — bright cyan lines on the floor
    const grid = new THREE.GridHelper(80, 40, 0x00f5ff, 0x004455);
    grid.material.transparent = true;
    grid.material.opacity     = 0.6;
    this.scene.add(grid);
  }

  // ── Arena blocks from AABBs ────────────────────────────────────────────────
  _buildArenaBlocks() {
    // Clearly visible steel-blue wall color (NOT dark/black)
    const wallMat = new THREE.MeshBasicMaterial({ color: 0x1a3a52 });

    ARENA_AABBS.forEach((box) => {
      const w = box.maxX - box.minX;
      const h = box.maxY - box.minY;
      const d = box.maxZ - box.minZ;

      const geo  = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(
        (box.minX + box.maxX) / 2,
        (box.minY + box.maxY) / 2,
        (box.minZ + box.maxZ) / 2,
      );
      mesh.userData.isMapGeometry = true;

      // Fully-opaque neon cyan edge outlines — always crisp and visible
      const edges   = new THREE.EdgesGeometry(geo);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x00f5ff });
      mesh.add(new THREE.LineSegments(edges, lineMat));

      this.scene.add(mesh);
      this.collidableMeshes.push(mesh);
    });
  }

  // ── Atmosphere lights (for remote player & VFX illumination) ──────────────
  _addAtmosphere() {
    // Bright sun-like directional light from above
    const sun = new THREE.DirectionalLight(0xfff8e8, 2.5);
    sun.position.set(90, 200, -280);
    sun.target.position.set(0, 0, 0);
    this.scene.add(sun);
    this.scene.add(sun.target);

    // Sky ambient — bright enough to illuminate player models and VFX
    this.scene.add(new THREE.AmbientLight(0x88bbcc, 2.0));

    // Neon accent point lights at arena level
    const accents = [
      { color: 0x00f5ff, pos: [-15, 5, -15] },
      { color: 0x00f5ff, pos: [ 15, 5,  15] },
      { color: 0xff2d78, pos: [ 15, 5, -15] },
      { color: 0xff2d78, pos: [-15, 5,  15] },
      { color: 0x7b2fff, pos: [  0, 7,   0] },
    ];
    accents.forEach(({ color, pos }) => {
      const l = new THREE.PointLight(color, 4, 30);
      l.position.set(...pos);
      this.scene.add(l);
    });
  }

  // ── Spawn points ───────────────────────────────────────────────────────────
  _setupSpawnPoints() {
    this.spawnPoints = [
      new THREE.Vector3(-30, 1.6,  -30),
      new THREE.Vector3( 30, 1.6,  -30),
      new THREE.Vector3(-30, 1.6,   30),
      new THREE.Vector3( 30, 1.6,   30),
      new THREE.Vector3(  0, 1.6,  -30),
      new THREE.Vector3(  0, 1.6,   30),
      new THREE.Vector3(-30, 1.6,    0),
      new THREE.Vector3( 30, 1.6,    0),
    ];
  }

  getCollidableMeshes() { return this.collidableMeshes; }
  getSpawnPoints()      { return this.spawnPoints; }
}
