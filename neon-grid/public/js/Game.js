import { Controls }            from './Controls.js';
import { buildWeapon }         from './WeaponBuilder.js';
import { AWPWeapon }           from './AWPWeapon.js';
import { MapLoader }           from './MapLoader.js';
import { CharacterController } from './CharacterController.js';

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
    this.renderer.autoClear         = false;
    this.renderer.setClearColor(0x050d14, 1);

    // ── Main scene & camera ───────────────────────────────────────
    this.scene  = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050d14);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camera.position.set(0, 1.65, 0);

    // ── Controls ──────────────────────────────────────────────────
    this.controls = new Controls(this.camera, this.canvas);

    // ── Local player class ─────────────────────────────────────────
    const localClass = localStorage.getItem('ng_class') || 'SOLDIER';
    this._localClass      = localClass;
    this._localClassColor = CLASS_COLORS[localClass] || 0x00f5ff;

    // ── Remote players (GLB controller map + legacy dying list) ───
    this._remoteControllers = new Map();   // socketId → CharacterController
    this._loadingIds        = new Set();   // socketIds currently loading GLB
    this._dyingControllers  = [];          // [{ctrl, timer}] for fade/disposal

    // ── Spawn protection shield ────────────────────────────────────
    this._spawnShield = null;

    // ── Transient VFX ─────────────────────────────────────────────
    this._vfxObjects = [];

    // ── Map state ─────────────────────────────────────────────────
    this.mapReady         = false;
    this.collidableMeshes = [];
    this._mapLoader       = null;

    this._buildWeaponScene();
    window.addEventListener('resize', () => this._onResize());
  }

  // ── Map loading ───────────────────────────────────────────────────
  loadMap(path, onReady) {
    const loader = new MapLoader(this.scene);
    this._mapLoader = loader;
    loader.load(path, (map) => {
      this.collidableMeshes = map.getCollidableMeshes();
      this.mapReady         = true;
      if (onReady) onReady(map);
    });
  }

  // Load with an already-constructed map loader (e.g. OverwatchMap)
  loadWithLoader(loader, onReady) {
    this._mapLoader = loader;
    loader.load(null, (map) => {
      this.collidableMeshes = map.getCollidableMeshes();
      this.mapReady         = true;
      if (onReady) onReady(map);
    });
  }

  // ── Weapon viewmodel scene ────────────────────────────────────────
  _buildWeaponScene() {
    this.weaponScene  = new THREE.Scene();
    this.weaponCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 10);

    this.weaponScene.add(new THREE.AmbientLight(0x334466, 3));
    const wLight = new THREE.PointLight(this._localClassColor, 1.5, 5);
    wLight.position.set(0, 1, 0);
    this.weaponScene.add(wLight);

    // AWP replaces the old WRAITH weapon model
    if (this._localClass === 'WRAITH') {
      // AWP is wired later via initAWP() once sound is available
      this._gunGroup = null;
      this._awpWeapon = null;
    } else {
      this._gunGroup = buildWeapon(this._localClass);
      this._GUN_BASE = { x: 0.2, y: -0.22, z: -0.35, rx: 0.03, rz: -0.04 };
      this._gunGroup.position.set(0.2, -0.22, -0.35);
      this._gunGroup.rotation.set(0.03, 0, -0.04);
      this.weaponScene.add(this._gunGroup);
    }

    this._muzzleLight = new THREE.PointLight(this._localClassColor, 0, 2);
    this._muzzleLight.position.set(0.2, -0.195, -0.72);
    this.weaponScene.add(this._muzzleLight);

    const flashTex = this._makeMuzzleFlashTexture();
    this._muzzleFlashSprite = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.12),
      new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
    );
    this._muzzleFlashSprite.position.set(0.2, -0.195, -0.72);
    this._muzzleFlashSprite.visible = false;
    this.weaponScene.add(this._muzzleFlashSprite);

    this._recoilElapsed    = -1;
    this._weaponFlashTimer = 0;

    this._isScoped        = false;
    this._scopeFovTarget  = 75;
    this._scopeFovCurrent = 75;
  }

  // ── Late-init AWP (called from main.js once sound is ready) ──────────
  initAWP(sound) {
    if (this._localClass !== 'WRAITH') return;
    this._awpWeapon = new AWPWeapon(this.weaponScene, this.weaponCamera, sound);
    this._gunGroup  = this._awpWeapon.group;
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

  // ── Scope in/out ─────────────────────────────────────────────────
  setScoped(scoped) {
    this._isScoped = scoped;

    if (this._awpWeapon) {
      // AWP: FOV 75 → 15, scope managed by AWPWeapon itself
      this._scopeFovTarget = scoped ? 15 : 75;
      if (scoped) this._awpWeapon.aimIn();
      else        this._awpWeapon.aimOut();
    } else {
      this._scopeFovTarget = scoped ? 75 / 6 : 75;
      if (this._gunGroup) this._gunGroup.visible = !scoped;
      const scopeEl = document.getElementById('scope-overlay');
      if (scopeEl) scopeEl.style.display = scoped ? 'block' : 'none';
    }

    const ch = document.getElementById('crosshair');
    if (ch) ch.style.display = scoped ? 'none' : (this.controls.isPlaying ? 'block' : 'none');
  }

  tickScope(dt) {
    const diff = this._scopeFovTarget - this._scopeFovCurrent;
    if (Math.abs(diff) < 0.05) {
      this._scopeFovCurrent = this._scopeFovTarget;
    } else {
      this._scopeFovCurrent += diff * Math.min(1, 14 * dt);
    }
    if (this.camera.fov !== this._scopeFovCurrent) {
      this.camera.fov = this._scopeFovCurrent;
      this.camera.updateProjectionMatrix();
    }
  }

  triggerRecoil() {
    this._recoilElapsed    = 0;
    this._weaponFlashTimer = 0.06;

    if (this._isScoped) {
      const reticle = document.getElementById('scope-reticle');
      if (reticle) {
        reticle.classList.remove('scope-kick');
        void reticle.offsetWidth;
        reticle.classList.add('scope-kick');
      }
    } else {
      this._muzzleFlashSprite.visible = true;
      this._muzzleLight.intensity     = 8;
    }
  }

  tickWeapon(dt) {
    // AWP handles its own recoil & bolt internally
    if (this._awpWeapon) {
      this._awpWeapon.update(dt);
    } else {
      const b = this._GUN_BASE;
      if (this._recoilElapsed >= 0) {
        this._recoilElapsed += dt;
        const t = this._recoilElapsed;
        if (t < 0.015) {
          const p = t / 0.015;
          this._gunGroup.position.z = b.z + 0.05 * p;
          this._gunGroup.rotation.x = b.rx - 0.08 * p;
        } else if (t < 0.05) {
          const p = (t - 0.015) / 0.035;
          this._gunGroup.position.z = (b.z + 0.05) - 0.05 * p;
          this._gunGroup.rotation.x = (b.rx - 0.08) + 0.08 * p;
        } else {
          this._gunGroup.position.z = b.z;
          this._gunGroup.rotation.x = b.rx;
          this._recoilElapsed = -1;
        }
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

  renderWeapon() {
    this.renderer.clearDepth();
    this.renderer.render(this.weaponScene, this.weaponCamera);
  }

  // ── Name-tag and HP bar sprites ───────────────────────────────────
  _makeNameSprite(username, classColor, level) {
    const c   = document.createElement('canvas');
    c.width   = 256; c.height = 64;
    const ctx = c.getContext('2d');
    const hex = '#' + classColor.toString(16).padStart(6, '0');

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, 256, 64);

    ctx.fillStyle = hex;
    ctx.fillRect(6, 18, 26, 26);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(level), 19, 31);

    ctx.font = 'bold 23px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = hex;
    ctx.shadowColor = hex;
    ctx.shadowBlur = 8;
    ctx.fillText((username || '???').slice(0, 14), 40, 32);

    const tex    = new THREE.CanvasTexture(c);
    const mat    = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.8, 0.45, 1);
    sprite.position.y = 200;   // model is scaled 0.011, so 200 units ≈ 2.2 world-units
    return sprite;
  }

  _makeHpBar(classColor) {
    const W = 128, H = 12;
    const hex = '#' + classColor.toString(16).padStart(6, '0');

    const bgC = document.createElement('canvas');
    bgC.width = W; bgC.height = H;
    const bgCtx = bgC.getContext('2d');
    bgCtx.fillStyle = 'rgba(0,0,0,0.7)';
    bgCtx.fillRect(0, 0, W, H);
    const bgTex = new THREE.CanvasTexture(bgC);
    const bgMat = new THREE.SpriteMaterial({ map: bgTex, transparent: true, depthTest: false });
    const bg    = new THREE.Sprite(bgMat);
    bg.scale.set(90.9, 7.27, 1);   // 1.0 / 0.011 ≈ 90.9  →  1.0 world-unit wide
    bg.position.y = 230;
    bg.visible = false;

    const fC = document.createElement('canvas');
    fC.width = W; fC.height = H;
    const fCtx = fC.getContext('2d');
    const fTex = new THREE.CanvasTexture(fC);
    const fMat = new THREE.SpriteMaterial({ map: fTex, transparent: true, depthTest: false });
    const fill = new THREE.Sprite(fMat);
    fill.scale.set(90.9, 7.27, 1);
    fill.position.y = 230;
    fill.visible = false;

    function update(hp, maxHp) {
      const pct  = Math.max(0, Math.min(1, hp / maxHp));
      const show = pct < 1.0;
      bg.visible   = show;
      fill.visible = show;
      if (show) {
        fCtx.clearRect(0, 0, W, H);
        fCtx.fillStyle = hex;
        fCtx.fillRect(0, 0, Math.round(pct * W), H);
        fTex.needsUpdate = true;
      }
    }

    return { bg, fill, update };
  }

  // ── Remote players (CharacterController-based) ────────────────────
  async _spawnRemoteController(player) {
    if (this._loadingIds.has(player.id)) return;
    this._loadingIds.add(player.id);

    const ctrl = new CharacterController(this.scene);
    const classColor = CLASS_COLORS[player.class] || 0x00f5ff;
    try {
      await ctrl.load('/assets/characters/soldier.glb', classColor);
    } catch (err) {
      console.warn('[Game] Failed to load soldier.glb:', err);
      this._loadingIds.delete(player.id);
      return;
    }

    // Player might have left or died during async load
    if (!this._loadingIds.has(player.id)) {
      ctrl.dispose();
      return;
    }
    this._loadingIds.delete(player.id);

    // Attach name-tag and HP bar directly to the model (in model-local coords)
    const color      = CLASS_COLORS[player.class] || 0x00f5ff;
    const nameSprite = this._makeNameSprite(player.username, color, player.level || 1);
    const hpBar      = this._makeHpBar(color);
    const model      = ctrl.sceneObject;
    if (model) {
      model.add(nameSprite);
      model.add(hpBar.bg);
      model.add(hpBar.fill);
    }

    ctrl._neon_hpBar = hpBar;

    // Set initial position before first frame
    ctrl.setPosition(player.x, player.y || 1.65, player.z);
    ctrl.setRotation(player.rotY || 0);

    this._remoteControllers.set(player.id, ctrl);
  }

  updateRemotePlayers(players, dt = 0.016) {
    const seen = new Set();

    players.forEach((p) => {
      seen.add(p.id);

      // Handle death
      if (p.dead) {
        const ctrl = this._remoteControllers.get(p.id);
        if (ctrl && !ctrl._dead) {
          ctrl.updateState(p.velocity, false, true, false);
          this._dyingControllers.push({ ctrl, timer: 3.0 });
          this._remoteControllers.delete(p.id);
          this._loadingIds.delete(p.id);
        }
        return;
      }

      let ctrl = this._remoteControllers.get(p.id);

      if (!ctrl) {
        // Start async load (only once)
        this._spawnRemoteController(p);
        return;
      }

      // Smooth position update (lerp toward server position)
      const k  = Math.min(1, 10 * dt);
      const ty = (p.y || 1.65) - 1.65;
      const mo = ctrl.sceneObject;
      if (mo) {
        mo.position.x += (p.x  - mo.position.x) * k;
        mo.position.y += (ty   - mo.position.y) * k;
        mo.position.z += (p.z  - mo.position.z) * k;
      }
      ctrl.setRotation(p.rotY);

      // HP bar
      if (ctrl._neon_hpBar && p.hp !== undefined) {
        const MAX_HP = { SOLDIER: 100, GHOST: 75, WRAITH: 125 };
        ctrl._neon_hpBar.update(p.hp, MAX_HP[p.class] || 100);
      }

      // Animation state
      ctrl.updateState(
        p.velocity   || { x: 0, y: 0, z: 0 },
        !!p.isShooting,
        false,
        !!p.isADS
      );
    });

    // Tick dying controllers — death animation plays while model fades out
    const DEATH_TOTAL = 3.0;
    const FADE_START  = 0.5;   // begin fading after 0.5 s of death animation
    for (let i = this._dyingControllers.length - 1; i >= 0; i--) {
      const entry = this._dyingControllers[i];
      entry.timer -= dt;
      entry.ctrl.update(dt);

      // Compute fade: 1.0 → 0.0 over the last (DEATH_TOTAL - FADE_START) seconds
      const elapsed = DEATH_TOTAL - entry.timer;
      if (elapsed > FADE_START) {
        const fadeProgress = (elapsed - FADE_START) / (DEATH_TOTAL - FADE_START);
        entry.ctrl.setFade(Math.max(0, 1.0 - fadeProgress));
      }

      if (entry.timer <= 0) {
        entry.ctrl.dispose();
        this._dyingControllers.splice(i, 1);
      }
    }

    // Tick live controllers
    this._remoteControllers.forEach((ctrl) => ctrl.update(dt));

    // Remove controllers for players that left
    this._remoteControllers.forEach((ctrl, id) => {
      if (!seen.has(id)) {
        ctrl.dispose();
        this._remoteControllers.delete(id);
        this._loadingIds.delete(id);
      }
    });
    this._loadingIds.forEach((id) => {
      if (!seen.has(id)) this._loadingIds.delete(id);
    });
  }

  // ── Spawn protection shield ───────────────────────────────────────
  showSpawnProtection() {
    this.hideSpawnProtection();
    const geo = new THREE.SphereGeometry(1.0, 12, 12);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00f5ff, transparent: true, opacity: 0.08, wireframe: true,
    });
    this._spawnShield = new THREE.Mesh(geo, mat);
    this.scene.add(this._spawnShield);
    setTimeout(() => this.hideSpawnProtection(), 2500);
  }

  hideSpawnProtection() {
    if (this._spawnShield) { this.scene.remove(this._spawnShield); this._spawnShield = null; }
  }

  tickSpawnShield(camera) {
    if (!this._spawnShield) return;
    this._spawnShield.position.copy(camera.position);
    this._spawnShield.material.opacity = 0.08 + Math.sin(Date.now() * 0.008) * 0.06;
  }

  // ── Visual FX ─────────────────────────────────────────────────────
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
    const fwd   = new THREE.Vector3(0, 0, -0.5).applyQuaternion(camera.quaternion);
    const light = new THREE.PointLight(this._localClassColor, 6, 4);
    light.position.copy(camera.position).add(fwd);
    this.scene.add(light);
    this._vfxObjects.push({ mesh: light, ttl: 0.08, type: 'light' });
  }

  spawnHitParticles(position) {
    [0xff2d78, 0x00f5ff, 0xff2d78, 0x00f5ff, 0xff2d78, 0x00f5ff].forEach((col) => {
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

  // ── Safety arena bounds (outer clamp) ─────────────────────────────
  _clampToWalls(pos) {
    const HALF = 49.0, R = 0.4;
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

    controls.update(camera, dt);
    this._clampToWalls(camera.position);
    controls.applyToCamera();
    this._tickVfx(dt);
    this.tickWeapon(dt);
    this.tickScope(dt);

    // Per-frame map animation (turbine, flickering lights)
    if (this._mapLoader) this._mapLoader.update(dt);

    this.renderer.clear();
    this.renderer.render(this.scene, camera);
    this.renderWeapon();
  }
}
