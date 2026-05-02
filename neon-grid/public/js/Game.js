import { Controls }           from './Controls.js';
import { buildCharacterModel } from './CharacterModel.js';

const CLASS_COLORS = {
  SOLDIER: 0x00f5ff,
  GHOST:   0xff2d78,
  WRAITH:  0x7b2fff,
};

export class Game {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this._clock = new THREE.Clock();

    // ── Renderer ──────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.renderer.autoClear         = false; // we clear manually to composite scenes

    // ── Main scene & camera ───────────────────────────────────────
    this.scene  = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0f);
    this.scene.fog        = new THREE.FogExp2(0x0a0a0f, 0.05);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camera.position.set(0, 1.6, 0);

    // ── Controls ──────────────────────────────────────────────────
    this.controls = new Controls(this.camera, this.canvas);

    // ── Local player class ─────────────────────────────────────────
    const localClass = localStorage.getItem('ng_class') || 'SOLDIER';
    this._localClassColor = CLASS_COLORS[localClass] || 0x00f5ff;

    // ── Physics ───────────────────────────────────────────────────
    this.yVelocity  = 0;
    this.onGround   = true;
    this.GRAVITY    = -20;
    this.JUMP_FORCE = 7;
    this.FLOOR_Y    = 1.6;

    // ── Remote players ────────────────────────────────────────────
    this._remoteMeshes = new Map();

    // ── Transient VFX ─────────────────────────────────────────────
    this._vfxObjects = [];

    this._buildLights();
    this._buildMap();
    this._buildWeaponScene();

    window.addEventListener('resize', () => this._onResize());
  }

  // ── Lights ───────────────────────────────────────────────────────
  _buildLights() {
    this.scene.add(new THREE.AmbientLight(0x111133, 1));
    [
      { color: 0x00f5ff, pos: [20, 3,  20] },
      { color: 0xff2d78, pos: [-20, 3, -20] },
      { color: 0x7b2fff, pos: [20, 3,  -20] },
    ].forEach(({ color, pos }) => {
      const l = new THREE.PointLight(color, 2, 30);
      l.position.set(...pos);
      l.castShadow = true;
      this.scene.add(l);
    });
  }

  // ── Map ──────────────────────────────────────────────────────────
  _buildMap() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: 0x111122 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(80, 80, 0x00f5ff, 0x003344);
    grid.position.y = 0.01;
    this.scene.add(grid);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0d0d22, emissive: 0x00f5ff, emissiveIntensity: 0.1 });
    this._walls = [];
    [[0, 2, -40, 0], [0, 2, 40, 0], [-40, 2, 0, Math.PI / 2], [40, 2, 0, Math.PI / 2]]
      .forEach(([px, py, pz, ry]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(80, 4, 1), wallMat);
        m.position.set(px, py, pz); m.rotation.y = ry;
        m.castShadow = true; m.receiveShadow = true;
        this.scene.add(m); this._walls.push(m);
      });

    const coverMat = new THREE.MeshStandardMaterial({ color: 0x1a0033, emissive: 0xff2d78, emissiveIntensity: 0.05 });
    [[-15,0,-15],[15,0,-15],[-15,0,15],[15,0,15],[0,0,-25],[0,0,25],[-25,0,0],[25,0,0]]
      .forEach(([px,,pz]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), coverMat);
        m.position.set(px, 1, pz); m.castShadow = true; m.receiveShadow = true;
        this.scene.add(m);
      });

    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x0d0d22, emissive: 0x7b2fff, emissiveIntensity: 0.1 });
    [[-35,0,-35],[35,0,-35],[-35,0,35],[35,0,35]].forEach(([px,,pz]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 2), pillarMat);
      m.position.set(px, 3, pz); m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
    });
  }

  // ── Weapon viewmodel scene ────────────────────────────────────────
  _buildWeaponScene() {
    this.weaponScene  = new THREE.Scene();
    this.weaponCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 10);

    // Lighting for weapon scene
    this.weaponScene.add(new THREE.AmbientLight(0x334466, 3));
    const wLight = new THREE.PointLight(0x00f5ff, 1.5, 5);
    wLight.position.set(0, 1, 0);
    this.weaponScene.add(wLight);

    const gc  = this._localClassColor;
    const gm  = (color, emissive, intensity) =>
      new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity });

    this._gunGroup = new THREE.Group();

    // Slide / body
    this._gunGroup.add(Object.assign(
      new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.28), gm(0x1a1a2e, gc, 0.5))
    ));

    // Barrel
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.18), gm(0x1a1a2e, gc, 0.7));
    barrel.position.set(0, 0.025, -0.23);
    this._gunGroup.add(barrel);

    // Handle
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.12, 0.07), gm(0x111122, gc, 0.2));
    handle.position.set(0, -0.095, 0.07);
    this._gunGroup.add(handle);

    // Trigger
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.06, 0.02), gm(0x333344, gc, 0.3));
    trigger.position.set(0, -0.03, -0.02);
    this._gunGroup.add(trigger);

    // Muzzle tip
    const muzzleTip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.01), gm(gc, gc, 1.0));
    muzzleTip.position.set(0, 0.025, -0.32);
    this._gunGroup.add(muzzleTip);

    // Base transform — bottom-right of view
    this._GUN_BASE = { x: 0.22, y: -0.18, z: -0.35, rx: 0.04, rz: -0.05 };
    this._gunGroup.position.set(0.22, -0.18, -0.35);
    this._gunGroup.rotation.set(0.04, 0, -0.05);
    this.weaponScene.add(this._gunGroup);

    // Muzzle flash point light (off by default)
    this._muzzleLight = new THREE.PointLight(gc, 0, 2);
    this._muzzleLight.position.set(0.22, -0.155, -0.67);
    this.weaponScene.add(this._muzzleLight);

    // Muzzle flash sprite
    const flashTex = this._makeMuzzleFlashTexture();
    this._muzzleFlashSprite = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.12),
      new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
    );
    this._muzzleFlashSprite.position.set(0.22, -0.155, -0.67);
    this._muzzleFlashSprite.visible = false;
    this.weaponScene.add(this._muzzleFlashSprite);

    // Recoil / flash timers
    this._recoilElapsed    = -1;
    this._weaponFlashTimer = 0;
  }

  _makeMuzzleFlashTexture() {
    const c   = document.createElement('canvas');
    c.width   = c.height = 64;
    const ctx = c.getContext('2d');
    const g   = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0,   'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(0,245,255,0.8)');
    g.addColorStop(1,   'rgba(0,245,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  // Call this when the local player fires
  triggerRecoil() {
    this._recoilElapsed    = 0;
    this._weaponFlashTimer = 0.06;
    this._muzzleFlashSprite.visible = true;
    this._muzzleLight.intensity     = 8;
  }

  // Called every frame from main loop
  tickWeapon(dt) {
    const { _GUN_BASE: b } = this;

    if (this._recoilElapsed >= 0) {
      this._recoilElapsed += dt;
      const t = this._recoilElapsed;

      if (t < 0.015) {
        const p = t / 0.015;
        this._gunGroup.position.z = b.z + 0.05 * p;
        this._gunGroup.rotation.x = b.rx - 0.08 * p;
      } else if (t < 0.05) {
        const p = (t - 0.015) / 0.035;
        this._gunGroup.position.z = (b.z + 0.05) + (-0.05) * p;
        this._gunGroup.rotation.x = (b.rx - 0.08) + 0.08 * p;
      } else {
        this._gunGroup.position.z = b.z;
        this._gunGroup.rotation.x = b.rx;
        this._recoilElapsed = -1;
      }
    }

    if (this._weaponFlashTimer > 0) {
      this._weaponFlashTimer -= dt;
      if (this._weaponFlashTimer <= 0) {
        this._muzzleFlashSprite.visible = false;
        this._muzzleLight.intensity     = 0;
        this._weaponFlashTimer          = 0;
      }
    }
  }

  // Renders the weapon overlay — call AFTER rendering the main scene
  renderWeapon() {
    this.renderer.clearDepth();
    this.renderer.render(this.weaponScene, this.weaponCamera);
  }

  // ── Remote players ────────────────────────────────────────────────
  _makeNameSprite(username, color) {
    const c   = document.createElement('canvas');
    c.width   = 256; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    ctx.font         = 'bold 28px Orbitron, monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    const hex = '#' + color.toString(16).padStart(6, '0');
    ctx.shadowColor = hex; ctx.shadowBlur = 12;
    ctx.fillStyle   = hex;
    ctx.fillText(username, 128, 32);
    const tex    = new THREE.CanvasTexture(c);
    const mat    = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.5, 0.625, 1);
    return sprite;
  }

  _createRemoteMesh(player) {
    const color = CLASS_COLORS[player.class] || 0x00f5ff;
    const group = buildCharacterModel(color);
    const label = this._makeNameSprite(player.username, color);
    label.position.y = 2.2;
    group.add(label);
    this.scene.add(group);
    return group;
  }

  updateRemotePlayers(players, dt = 0.016) {
    const seen = new Set();
    players.forEach((p) => {
      seen.add(p.id);
      let g = this._remoteMeshes.get(p.id);
      if (!g) {
        g = this._createRemoteMesh(p);
        // Snap to initial position on first creation
        g.position.set(p.x, p.y - 1.6, p.z);
        this._remoteMeshes.set(p.id, g);
      }
      // Lerp toward server position at ~10 units/s
      const tx = p.x, ty = p.y - 1.6, tz = p.z;
      const k  = Math.min(1, 10 * dt);
      g.position.x += (tx - g.position.x) * k;
      g.position.y += (ty - g.position.y) * k;
      g.position.z += (tz - g.position.z) * k;
      g.rotation.y  = p.rotY;
      g.visible     = !p.dead;
    });
    this._remoteMeshes.forEach((g, id) => {
      if (!seen.has(id)) { this.scene.remove(g); this._remoteMeshes.delete(id); }
    });
  }

  // ── Visual FX (world-space) ────────────────────────────────────────
  spawnTracer(origin, direction) {
    const pts = [
      new THREE.Vector3(origin.x, origin.y, origin.z),
      new THREE.Vector3(origin.x + direction.x * 40, origin.y + direction.y * 40, origin.z + direction.z * 40),
    ];
    const line = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x00f5ff, transparent: true, opacity: 0.9 })
    );
    this.scene.add(line);
    this._vfxObjects.push({ mesh: line, ttl: 0.08, type: 'tracer' });
  }

  spawnMuzzleFlash(camera) {
    const fwd = new THREE.Vector3(0, 0, -0.5).applyQuaternion(camera.quaternion);
    const light = new THREE.PointLight(0x00f5ff, 6, 4);
    light.position.copy(camera.position).add(fwd);
    this.scene.add(light);
    this._vfxObjects.push({ mesh: light, ttl: 0.08, type: 'light' });
  }

  spawnHitParticles(position) {
    [0xff2d78, 0x00f5ff, 0xff2d78, 0x00f5ff, 0xff2d78, 0x00f5ff, 0xff2d78, 0x00f5ff].forEach((col) => {
      const mat  = new THREE.MeshBasicMaterial({ color: col, transparent: true });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), mat);
      mesh.position.set(position.x, position.y, position.z);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 6, Math.random() * 4 + 1, (Math.random() - 0.5) * 6,
      );
      this.scene.add(mesh);
      this._vfxObjects.push({ mesh, ttl: 0.3, type: 'particle', vel, mat });
    });
  }

  _tickVfx(dt) {
    for (let i = this._vfxObjects.length - 1; i >= 0; i--) {
      const obj = this._vfxObjects[i];
      obj.ttl -= dt;
      if (obj.type === 'particle') {
        obj.mesh.position.x += obj.vel.x * dt;
        obj.mesh.position.y += obj.vel.y * dt;
        obj.mesh.position.z += obj.vel.z * dt;
        obj.vel.y -= 10 * dt;
        obj.mat.opacity = Math.max(0, obj.ttl / 0.3);
      }
      if (obj.ttl <= 0) {
        this.scene.remove(obj.mesh);
        if (obj.type === 'tracer' || obj.type === 'particle') obj.mesh.geometry.dispose();
        this._vfxObjects.splice(i, 1);
      }
    }
  }

  // ── Collision ──────────────────────────────────────────────────────
  _clampToWalls(pos) {
    const HALF = 39.4, R = 0.4;
    pos.x = Math.max(-HALF + R, Math.min(HALF - R, pos.x));
    pos.z = Math.max(-HALF + R, Math.min(HALF - R, pos.z));
  }

  // ── Resize ─────────────────────────────────────────────────────────
  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect       = w / h;
    this.camera.updateProjectionMatrix();
    this.weaponCamera.aspect = w / h;
    this.weaponCamera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // ── Loop ───────────────────────────────────────────────────────────
  start() { this._animate(); }

  _animate() {
    requestAnimationFrame(() => this._animate());
    const dt = Math.min(this._clock.getDelta(), 0.05);
    const { controls, camera } = this;

    const speed = 8 * (controls.isSprinting() ? 1.5 : 1);
    const move  = controls.getMovementVector();
    camera.position.x += move.x * speed * dt;
    camera.position.z += move.z * speed * dt;
    this._clampToWalls(camera.position);

    if (controls.isJumping() && this.onGround) {
      this.yVelocity = this.JUMP_FORCE;
      this.onGround  = false;
    }
    if (!this.onGround) {
      this.yVelocity     += this.GRAVITY * dt;
      camera.position.y  += this.yVelocity * dt;
      if (camera.position.y <= this.FLOOR_Y) {
        camera.position.y = this.FLOOR_Y;
        this.yVelocity    = 0;
        this.onGround     = true;
      }
    }

    controls.applyToCamera();
    this._tickVfx(dt);
    this.tickWeapon(dt);

    this.renderer.clear();
    this.renderer.render(this.scene, camera);
    this.renderWeapon();
  }
}
