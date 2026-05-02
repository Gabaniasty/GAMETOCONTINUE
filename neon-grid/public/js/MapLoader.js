import { buildTerminalMap, TERMINAL_AABBS, LADDER_ZONES, CATWALK_EYE_Y, GROUND_EYE_Y } from './maps/TerminalMap.js';

// Re-export so Controls.js keeps its existing import path unchanged
export { TERMINAL_AABBS as ARENA_AABBS };
export { LADDER_ZONES, CATWALK_EYE_Y, GROUND_EYE_Y };

// Classify each AABB box into a footstep surface type for SoundEngine.detectSurface()
function _surfaceType(box) {
  const w = box.maxX - box.minX;
  const d = box.maxZ - box.minZ;
  // Catwalk: high elevation, narrow X span (≤5 units), long Z span
  if (box.minY >= 5.0 && w <= 5) return 'grate';
  // Small walkable tops: cover boxes (maxY=1.5), server racks (maxY=3, very narrow),
  // generator box — all metallic surfaces
  if (box.maxY <= 1.5 && w <= 4 && d <= 4) return 'metal';
  if (box.maxY <= 3.5 && w <= 1.5) return 'metal';
  if (box.maxY <= 3.5 && d <= 1.5) return 'metal';
  return 'concrete';
}

export class MapLoader {
  constructor(scene) {
    this.scene            = scene;
    this.collidableMeshes = [];
    this.spawnPoints      = [];
    this.loaded           = false;

    this.turbine      = null;
    this.genLight     = null;
    this.flickerLight = null;

    this._genFlickerTimer    = 0;
    this._chokeFlickerTimer  = 0;
  }

  load(_path, onReady) {
    const loadText = document.getElementById('loadingText');
    if (loadText) loadText.textContent = 'BUILDING TERMINAL...';

    const result = buildTerminalMap(this.scene);

    this.turbine      = result.turbine;
    this.genLight     = result.genLight;
    this.flickerLight = result.flickerLight;

    // Build invisible collision meshes from AABBs — used by BulletSystem raycasts
    const invisMat = new THREE.MeshBasicMaterial({ visible: false });
    for (const box of TERMINAL_AABBS) {
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
      mesh.userData.surface = _surfaceType(box);
      this.scene.add(mesh);
      this.collidableMeshes.push(mesh);
    }

    // Spawn points — merge Team A (north) and Team B (south)
    this.spawnPoints = [...result.spawnA, ...result.spawnB];

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

  // ── Per-frame animation ───────────────────────────────────────────────────
  update(dt) {
    if (!this.loaded) return;

    // Rotate turbine
    if (this.turbine) {
      this.turbine.rotation.y += 0.5 * dt;
    }

    // Generator orange light flicker (~10 Hz)
    if (this.genLight) {
      this._genFlickerTimer += dt;
      if (this._genFlickerTimer >= 0.1) {
        this._genFlickerTimer = 0;
        this.genLight.intensity = 1.5 + Math.random() * 1.5;
      }
    }

    // Chokepoint pink light flicker (~8 Hz)
    if (this.flickerLight) {
      this._chokeFlickerTimer += dt;
      if (this._chokeFlickerTimer >= 0.125) {
        this._chokeFlickerTimer = 0;
        this.flickerLight.intensity = 0.8 + Math.random() * 1.2;
      }
    }
  }

  getCollidableMeshes() { return this.collidableMeshes; }
  getSpawnPoints()      { return this.spawnPoints; }
}
