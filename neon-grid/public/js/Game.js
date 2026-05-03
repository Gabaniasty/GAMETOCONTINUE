import { Controls }            from './Controls.js';
import { buildWeapon }         from './WeaponBuilder.js';
import { AWPWeapon }           from './AWPWeapon.js';
import { MapLoader }           from './MapLoader.js';
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

    // ── Remote players ────────────────────────────────────────────
    this._remoteControllers = new Map();  // socketId → Three.js Group
    this._dyingGroups       = [];
    this._remoteExtrap      = new Map();
    this._remoteShootPrev   = new Map();  // rising-edge muzzle flash detection

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

    if (this._localClass === 'WRAITH') {
      this._gunGroup  = null;
      this._awpWeapon = null;
    } else {
      this._gunGroup = buildWeapon(this._localClass);
      this._GUN_BASE = { x: 0.2, y: -0.22, z: -0.35, rx: 0.03, rz: -0.04 };
      // Sprint holster — aggressively lowered and tilted (COD-style)
      this._SPRINT_POS = { x: 0.55, y: -0.52, z: -0.20, rx: 0.28, rz: -0.78 };
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
    this._sprintingPrev    = false;

    this._isScoped        = false;
    this._scopeFovTarget  = 75;
    this._scopeFovCurrent = 75;
  }

  // ── Late-init AWP ────────────────────────────────────────────────
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
    const sprinting = this.controls &&
                      this.controls.isSprinting() &&
                      this.controls.isPlaying &&
                      !this.controls.isDead &&
                      (this.controls._vel
                        ? (Math.abs(this.controls._vel.x) + Math.abs(this.controls._vel.z)) > 0.5
                        : false);

    // Sprint FOV kick (+8 degrees) — only when not scoped
    if (!this._isScoped) {
      const baseFov = parseFloat(localStorage.getItem('ng_fov') || '75');
      this._scopeFovTarget = sprinting ? baseFov + 8 : baseFov;
    }

    if (this._awpWeapon) {
      this._awpWeapon.update(dt);
    } else if (this._gunGroup) {
      const b  = this._GUN_BASE;
      const sp = this._SPRINT_POS;

      if (sprinting) {
        // Smoothly move weapon to lowered/tucked sprint position
        const k = Math.min(1, 10 * dt);
        this._gunGroup.position.x += (sp.x  - this._gunGroup.position.x) * k;
        this._gunGroup.position.y += (sp.y  - this._gunGroup.position.y) * k;
        this._gunGroup.position.z += (sp.z  - this._gunGroup.position.z) * k;
        this._gunGroup.rotation.x += (sp.rx - this._gunGroup.rotation.x) * k;
        this._gunGroup.rotation.z += (sp.rz - this._gunGroup.rotation.z) * k;
        this._recoilElapsed = -1; // cancel any in-progress recoil
      } else if (this._recoilElapsed >= 0) {
        // Recoil kick animation
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
      } else {
        // Smoothly return to base position from sprint
        const k = Math.min(1, 10 * dt);
        this._gunGroup.position.x += (b.x  - this._gunGroup.position.x) * k;
        this._gunGroup.position.y += (b.y  - this._gunGroup.position.y) * k;
        this._gunGroup.position.z += (b.z  - this._gunGroup.position.z) * k;
        this._gunGroup.rotation.x += (b.rx - this._gunGroup.rotation.x) * k;
        this._gunGroup.rotation.z += (b.rz - this._gunGroup.rotation.z) * k;
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

  // ── Remote players ────────────────────────────────────────────────
  _spawnRemotePlayer(player) {
    if (this._remoteControllers.has(player.id)) return;
    const ENEMY_COLOR = 0xff2222;
    const group = buildCharacterModel(
      ENEMY_COLOR,
      player.class    || 'SOLDIER',
      player.username || 'Unknown',
      player.level    || 1,
    );
    const ty = (player.y || 1.65) - 1.65;
    group.position.set(player.x || 0, ty, player.z || 0);
    // Model faces -Z at rotation.y=0, matching camera convention — no offset needed
    group.rotation.y = player.rotY || 0;
    this.scene.add(group);
    this._remoteControllers.set(player.id, group);
  }

  _spawnRemoteMuzzleFlash(group) {
    // Approximate world position of weapon muzzle from character's transform
    const rotY  = group.rotation.y;
    const fwdX  = -Math.sin(rotY);
    const fwdZ  = -Math.cos(rotY);
    const rightX =  Math.cos(rotY);
    const rightZ = -Math.sin(rotY);

    const pos = group.position.clone();
    pos.x += fwdX * 0.52 + rightX * 0.32;
    pos.y += 1.05;
    pos.z += fwdZ * 0.52 + rightZ * 0.32;

    const light = new THREE.PointLight(0xffbb44, 20, 4.0);
    light.position.copy(pos);
    this.scene.add(light);
    this._vfxObjects.push({ mesh: light, ttl: 0.07, type: 'light' });

    // Small flash sphere
    const flashMat  = new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.9 });
    const flashMesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 4, 4), flashMat);
    flashMesh.position.copy(pos);
    this.scene.add(flashMesh);
    this._vfxObjects.push({ mesh: flashMesh, ttl: 0.07, type: 'particle', vel: new THREE.Vector3(), mat: flashMat });
  }

  updateRemotePlayers(players, dt = 0.016) {
    const seen   = new Set();
    const MAX_HP = { SOLDIER: 100, GHOST: 75, WRAITH: 125 };

    players.forEach((p) => {
      seen.add(p.id);

      // ── Handle death ──────────────────────────────────────────────
      if (p.dead) {
        const group = this._remoteControllers.get(p.id);
        if (group && !group.neon_dying) {
          group.neon_playDeath();
          this._dyingGroups.push({ group });
          this._remoteControllers.delete(p.id);
        }
        return;
      }

      // ── Spawn model if missing ────────────────────────────────────
      if (!this._remoteControllers.has(p.id)) {
        this._spawnRemotePlayer(p);
      }

      const group = this._remoteControllers.get(p.id);
      if (!group) return;

      // ── Dead-reckoning ─────────────────────────────────────────────
      const now  = performance.now();
      const prev = this._remoteExtrap.get(p.id);
      const vx   = (p.velocity && p.velocity.x) || 0;
      const vz   = (p.velocity && p.velocity.z) || 0;
      if (!prev || prev.x !== p.x || prev.z !== p.z) {
        this._remoteExtrap.set(p.id, { x: p.x, y: p.y, z: p.z, vx, vz, t: now });
      }
      const extrap = this._remoteExtrap.get(p.id);
      const age    = Math.min((now - extrap.t) / 1000, 0.15);
      const ex     = extrap.x + extrap.vx * age;
      const ez     = extrap.z + extrap.vz * age;
      const ty     = (p.y || 1.65) - 1.65;

      const k = Math.min(1, 18 * dt);
      group.position.x += (ex  - group.position.x) * k;
      group.position.y += (ty  - group.position.y) * k;
      group.position.z += (ez  - group.position.z) * k;
      group.rotation.y  = p.rotY || 0;

      // ── HP bar ────────────────────────────────────────────────────
      if (p.hp !== undefined) {
        group.neon_setHp(p.hp, MAX_HP[p.class] || 100);
      }

      // ── Procedural animation ─────────────────────────────────────
      const vel         = p.velocity || { x: 0, y: 0, z: 0 };
      const hspd        = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
      const isSprinting = !!p.isSprinting || hspd > 6.5;
      if (group.neon_animate) {
        group.neon_animate(dt, vel, !!p.isShooting, isSprinting);
      }

      // ── Remote muzzle flash (rising edge of isShooting) ───────────
      const prevShoot = this._remoteShootPrev.get(p.id) || false;
      if (p.isShooting && !prevShoot) {
        this._spawnRemoteMuzzleFlash(group);
      }
      this._remoteShootPrev.set(p.id, !!p.isShooting);
    });

    // ── Tick death animations ─────────────────────────────────────
    for (let i = this._dyingGroups.length - 1; i >= 0; i--) {
      const { group } = this._dyingGroups[i];
      const done = group.neon_updateDeath(dt);
      if (done) {
        this.scene.remove(group);
        this._dyingGroups.splice(i, 1);
      }
    }

    // ── Remove disconnected players ───────────────────────────────
    this._remoteControllers.forEach((group, id) => {
      if (!seen.has(id)) {
        this.scene.remove(group);
        this._remoteControllers.delete(id);
        this._remoteExtrap.delete(id);
        this._remoteShootPrev.delete(id);
      }
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
        if (obj.type === 'tracer' || obj.type === 'particle') obj.mesh.geometry?.dispose();
        this._vfxObjects.splice(i, 1);
      }
    }
  }

  // ── Safety arena bounds ────────────────────────────────────────────
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

    if (this._mapLoader) this._mapLoader.update(dt);

    this.renderer.clear();
    this.renderer.render(this.scene, camera);
    this.renderWeapon();
  }
}
