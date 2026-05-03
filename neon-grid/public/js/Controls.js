import { CLASSES }                              from './Classes.js';
import { ARENA_AABBS, LADDER_ZONES, CATWALK_EYE_Y, GROUND_EYE_Y } from './MapLoader.js';

// ── Movement constants ────────────────────────────────────────────────────
const EYE_Y        = 1.65;
const CROUCH_Y     = 1.1;
const WALK_SPEED   = 7.5;
const SPRINT_SPEED = 13.0;
const CROUCH_SPEED = 3.2;
const AIR_SPEED    = 4.5;
const GRAVITY      = -22.0;
const JUMP_FORCE   = 7.2;
const GROUND_ACCEL = 55.0;
const GROUND_FRIC  = 48.0;
const AIR_ACCEL    = 16.0;

// ── Head bob constants ────────────────────────────────────────────────────
const WALK_BOB_SPD   = 9.5;
const WALK_BOB_AMT   = 0.016;
const SPRINT_BOB_SPD = 13.0;
const SPRINT_BOB_AMT = 0.024;
const WALK_SWAY      = 0.006;
const SPRINT_SWAY    = 0.010;

// ── Collision constants ────────────────────────────────────────────────────
const PLAYER_RADIUS = 0.42;
const GROUND_MARGIN = 0.55;

// ── Ladder teleport constants ─────────────────────────────────────────────
const LADDER_COOLDOWN   = 0.8;
const CATWALK_THRESHOLD = 4.0;

export class Controls {
  constructor(camera, domElement) {
    this.camera     = camera;
    this.domElement = domElement;

    this.yaw   = 0;
    this.pitch = 0;
    this.sensitivity    = parseFloat(localStorage.getItem('ng_sensitivity')     || '18') / 10000;
    this.adsSensitivity = parseFloat(localStorage.getItem('ng_ads_sensitivity') || '6')  / 10000;
    const _rawAdsToggle = localStorage.getItem('ng_ads_toggle');
    this._adsToggle     = _rawAdsToggle === '1' || _rawAdsToggle === 'true';

    this.keys      = {};
    this.isLocked  = false;
    this.isPlaying = false;
    this.isDead    = false;
    this.onShoot   = null;

    this._overlay    = null;
    this._crosshair  = null;
    this._lastMouseX = null;
    this._lastMouseY = null;
    this._inputLocked = false;

    this._vel         = { x: 0, y: 0, z: 0 };
    this._currentEyeY = EYE_Y;
    this._bobTimer    = 0;
    this._crouching   = false;
    this._jumpHeld    = false;
    this._onGround    = true;

    // Scope state (WRAITH only)
    this.isScoped  = false;
    this.onScope   = null;
    this.onUnscope = null;

    // AWP callbacks
    this.onReload        = null;
    this.onHoldBreath    = null;
    this.onReleaseBreath = null;
    this._breathHeld     = false;
    this._breathTimeout  = null;

    // Round system — controls are blocked during lobby/results
    this.roundActive = false;

    // Legacy — kept so existing callers (bullets) still work
    this.collidableMeshes = [];

    this._playerClass  = localStorage.getItem('ng_class') || 'SOLDIER';
    this._lastShotTime = 0;

    // ── Non-AWP ammo & reload (SOLDIER / GHOST only) ─────────────────────
    this.onAmmoChanged    = null;
    this.onReloadStart    = null;
    this.onReloadEnd      = null;
    this.onReloadProgress = null;

    if (this._playerClass !== 'WRAITH') {
      const cls         = CLASSES[this._playerClass] || CLASSES.SOLDIER;
      this._ammo        = cls.magazineSize;
      this._ammoMax     = cls.magazineSize;
      this._reserve     = cls.magazineSize * 3;
      this._isReloading = false;
      this._reloadTimer = 0;
      this._reloadDur   = (cls.reloadTime || 2400) / 1000;
    }

    // Invert Y from settings
    this._invertY = localStorage.getItem('ng_invert_y') === 'true';

    // Ladder teleport cooldown
    this._ladderCooldown = 0;

    this._bindEvents();

    // Listen for settings changes
    document.addEventListener('ng-settings-changed', (e) => {
      if ('ng_sensitivity' in e.detail) {
        this.sensitivity = e.detail.ng_sensitivity / 10000;
      }
      if ('ng_ads_sensitivity' in e.detail) {
        this.adsSensitivity = e.detail.ng_ads_sensitivity / 10000;
      }
      if ('ng_ads_toggle' in e.detail) {
        this._adsToggle = !!e.detail.ng_ads_toggle;
      }
      if ('ng_invert_y' in e.detail) {
        this._invertY = e.detail.ng_invert_y;
      }
    });
  }

  // ── Input locking (e.g. death screen) ───────────────────────────────────
  setInputLocked(locked) {
    this._inputLocked = !!locked;
    if (locked) this.keys = {};
  }

  // Kept for API compatibility — bullets still use mesh raycasts
  setCollidableMeshes(meshes) { this.collidableMeshes = meshes; }

  // Swap AABB set used for player physics (call after loading a map)
  setMapAABBs(aabbs)    { this._activeAABBs   = aabbs; }
  setLadderZones(zones) { this._ladderZones    = zones; }

  // ── Fire rate gate ───────────────────────────────────────────────────────
  _canShoot() {
    const fireRate = CLASSES[this._playerClass]?.fireRate ?? 200;
    const now = Date.now();
    if (now - this._lastShotTime < fireRate) return false;
    this._lastShotTime = now;
    return true;
  }

  // ── Non-AWP reload ───────────────────────────────────────────────────────
  _startReload() {
    if (this._playerClass === 'WRAITH') return;
    if (this._isReloading) return;
    if (this._ammo >= this._ammoMax) return;
    if (this._reserve <= 0) return;
    this._isReloading = true;
    this._reloadTimer = this._reloadDur;
    if (this.onReloadStart) this.onReloadStart(this._reloadDur);
  }

  resetAmmo() {
    if (this._playerClass === 'WRAITH') return;
    const cls         = CLASSES[this._playerClass] || CLASSES.SOLDIER;
    this._ammo        = cls.magazineSize;
    this._reserve     = cls.magazineSize * 3;
    this._isReloading = false;
    this._reloadTimer = 0;
    if (this.onAmmoChanged) this.onAmmoChanged(this._ammo, this._reserve);
    if (this.onReloadEnd)   this.onReloadEnd();
  }

  // ── Main physics update ──────────────────────────────────────────────────
  update(camera, dt) {
    if (!this.isPlaying || this._inputLocked) return;

    // ── Reload tick (non-WRAITH) ─────────────────────────────────────────
    if (this._playerClass !== 'WRAITH' && this._isReloading) {
      this._reloadTimer -= dt;
      const pct = Math.max(0, 1 - this._reloadTimer / this._reloadDur);
      if (this.onReloadProgress) this.onReloadProgress(pct);
      if (this._reloadTimer <= 0) {
        const needed      = this._ammoMax - this._ammo;
        const loaded      = Math.min(needed, this._reserve);
        this._ammo       += loaded;
        this._reserve    -= loaded;
        this._isReloading = false;
        if (this.onAmmoChanged) this.onAmmoChanged(this._ammo, this._reserve);
        if (this.onReloadEnd)   this.onReloadEnd();
      }
    }

    if (this._ladderCooldown > 0) this._ladderCooldown -= dt;

    this._crouching = !!(this.keys['KeyC'] || this.keys['ControlLeft'] || this.keys['ControlRight']);
    const targetEyeY = this._crouching ? CROUCH_Y : EYE_Y;
    this._currentEyeY += (targetEyeY - this._currentEyeY) * Math.min(1, 12 * dt);

    let ix = 0, iz = 0;
    if (!this.isDead) {
      if (this.keys['KeyW'] || this.keys['ArrowUp'])    iz -= 1;
      if (this.keys['KeyS'] || this.keys['ArrowDown'])  iz += 1;
      if (this.keys['KeyA'] || this.keys['ArrowLeft'])  ix -= 1;
      if (this.keys['KeyD'] || this.keys['ArrowRight']) ix += 1;
    }
    const hasInput = ix !== 0 || iz !== 0;
    if (hasInput) { const len = Math.sqrt(ix * ix + iz * iz); ix /= len; iz /= len; }

    const cos   = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    const wishX =  ix * cos + iz * sin;
    const wishZ = -ix * sin + iz * cos;

    const onGround   = this._onGround;
    const sprinting  = this.isSprinting() && onGround && !this._crouching && hasInput;
    const targetSpeed = this._crouching ? CROUCH_SPEED : sprinting ? SPRINT_SPEED : WALK_SPEED;

    if (onGround) {
      if (hasInput) {
        const k = Math.min(1, GROUND_ACCEL * dt);
        this._vel.x += (wishX * targetSpeed - this._vel.x) * k;
        this._vel.z += (wishZ * targetSpeed - this._vel.z) * k;
      } else {
        const fric = Math.max(0, 1 - GROUND_FRIC * dt);
        this._vel.x *= fric;
        this._vel.z *= fric;
      }
      this._vel.y = 0;

      if (!this.isDead && this.keys['Space'] && !this._jumpHeld) {
        this._vel.y    = JUMP_FORCE;
        this._jumpHeld = true;
        this._onGround = false;
      }
      if (!this.keys['Space']) this._jumpHeld = false;

    } else {
      this._vel.x += wishX * AIR_ACCEL * dt;
      this._vel.z += wishZ * AIR_ACCEL * dt;
      const hs = Math.sqrt(this._vel.x ** 2 + this._vel.z ** 2);
      if (hs > AIR_SPEED) {
        this._vel.x = (this._vel.x / hs) * AIR_SPEED;
        this._vel.z = (this._vel.z / hs) * AIR_SPEED;
      }
      this._vel.y += GRAVITY * dt;
    }

    camera.position.x += this._vel.x * dt;
    camera.position.z += this._vel.z * dt;
    camera.position.y += this._vel.y * dt;

    this._doWallsAABB(camera);
    this._onGround = this._doGroundAABB(camera);
    this._doLadderTeleport(camera);

    const hspd = Math.sqrt(this._vel.x ** 2 + this._vel.z ** 2);
    if (hspd > 0.5 && this._onGround && !this._crouching && !this.isDead) {
      this._bobTimer += dt * (sprinting ? SPRINT_BOB_SPD : WALK_BOB_SPD);
      const bobY = Math.sin(this._bobTimer)       * (sprinting ? SPRINT_BOB_AMT : WALK_BOB_AMT);
      const bobX = Math.sin(this._bobTimer * 0.5) * (sprinting ? SPRINT_SWAY    : WALK_SWAY);
      camera.position.y += bobY;
      camera.position.x += bobX;
    } else {
      const nearest = Math.round(this._bobTimer / Math.PI) * Math.PI;
      this._bobTimer += (nearest - this._bobTimer) * Math.min(1, dt * 8);
    }
  }

  // ── Ladder teleport ───────────────────────────────────────────────────────
  _doLadderTeleport(camera) {
    if (this._ladderCooldown > 0) return;
    if (!LADDER_ZONES || LADDER_ZONES.length === 0) return;

    const px = camera.position.x;
    const pz = camera.position.z;
    const py = camera.position.y;

    const ladderZones = this._ladderZones !== undefined ? this._ladderZones : LADDER_ZONES;
    for (const zone of ladderZones) {
      if (px < zone.minX || px > zone.maxX) continue;
      if (pz < zone.minZ || pz > zone.maxZ) continue;

      const onCatwalk = py > CATWALK_THRESHOLD;

      if (!onCatwalk && this._onGround) {
        camera.position.y = CATWALK_EYE_Y;
        this._vel.y = 0;
        this._onGround = true;
        this._ladderCooldown = LADDER_COOLDOWN;
      } else if (onCatwalk && this._onGround) {
        camera.position.y = GROUND_EYE_Y;
        this._vel.y = 0;
        this._onGround = true;
        this._ladderCooldown = LADDER_COOLDOWN;
      }
      break;
    }
  }

  // ── Ground check (AABB) ──────────────────────────────────────────────────
  _doGroundAABB(camera) {
    const px    = camera.position.x;
    const pz    = camera.position.z;
    const feetY = camera.position.y - this._currentEyeY;
    const R     = PLAYER_RADIUS;

    let groundY = -Infinity;

    if (feetY <= GROUND_MARGIN) {
      groundY = 0;
    }

    const activeAABBs = this._activeAABBs || ARENA_AABBS;
    for (const box of activeAABBs) {
      if (px + R <= box.minX || px - R >= box.maxX) continue;
      if (pz + R <= box.minZ || pz - R >= box.maxZ) continue;
      if (feetY > box.maxY + GROUND_MARGIN) continue;
      if (feetY < box.maxY - 0.15) continue;
      groundY = Math.max(groundY, box.maxY);
    }

    if (groundY > -Infinity) {
      const snapY = groundY + this._currentEyeY;
      if (camera.position.y < snapY + 0.01) {
        camera.position.y = snapY;
        if (this._vel.y < 0) this._vel.y = 0;
      }
      return camera.position.y <= snapY + 0.02;
    }

    const absFloor = this._currentEyeY - 0.01;
    if (camera.position.y < absFloor) {
      camera.position.y = absFloor;
      if (this._vel.y < 0) this._vel.y = 0;
      return true;
    }

    return false;
  }

  // ── Wall collision (AABB) ─────────────────────────────────────────────────
  _doWallsAABB(camera) {
    this._resolveWalls(camera);
    this._resolveWalls(camera);
  }

  _resolveWalls(camera) {
    const R     = PLAYER_RADIUS;
    const feetY = camera.position.y - this._currentEyeY;
    const headY = camera.position.y + 0.25;

    const activeAABBs2 = this._activeAABBs || ARENA_AABBS;
    for (const box of activeAABBs2) {
      if (feetY >= box.maxY - 0.05) continue;
      if (headY <= box.minY)         continue;

      const px = camera.position.x;
      const pz = camera.position.z;

      const eMinX = box.minX - R, eMaxX = box.maxX + R;
      const eMinZ = box.minZ - R, eMaxZ = box.maxZ + R;

      if (px <= eMinX || px >= eMaxX) continue;
      if (pz <= eMinZ || pz >= eMaxZ) continue;

      const dL = px - eMinX;
      const dR = eMaxX - px;
      const dF = pz - eMinZ;
      const dB = eMaxZ - pz;

      const minPen = Math.min(dL, dR, dF, dB);

      if (minPen === dL) {
        camera.position.x = eMinX;
        if (this._vel.x > 0) this._vel.x = 0;
      } else if (minPen === dR) {
        camera.position.x = eMaxX;
        if (this._vel.x < 0) this._vel.x = 0;
      } else if (minPen === dF) {
        camera.position.z = eMinZ;
        if (this._vel.z > 0) this._vel.z = 0;
      } else {
        camera.position.z = eMaxZ;
        if (this._vel.z < 0) this._vel.z = 0;
      }
    }
  }

  // ── Overlay helpers ───────────────────────────────────────────────────────
  _getOverlay()   { return this._overlay   || (this._overlay   = document.getElementById('lock-overlay')); }
  _getCrosshair() { return this._crosshair || (this._crosshair = document.getElementById('crosshair')); }

  _setPlaying(value) {
    this.isPlaying = value;
    const ov = this._getOverlay();
    const ch = this._getCrosshair();
    if (ov) ov.style.display = value ? 'none' : 'flex';
    if (ch) ch.style.display = value ? 'block' : 'none';
  }

  _tryPointerLock() {
    try {
      const p = this.domElement.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) {}
  }

  _enter() {
    if (!this.roundActive) return;
    if (!this.isPlaying) this._setPlaying(true);
    this._tryPointerLock();
  }

  _bindEvents() {
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    this.onAwpShoot = null;

    document.addEventListener('mousedown', (e) => {
      if (this._inputLocked) return;
      if (e.button === 0) {
        if (!this.isPlaying) { this._enter(); return; }
        if (this.isDead) return;
        if (this.isScoped && this._playerClass === 'WRAITH' && this.onAwpShoot) {
          this.onAwpShoot();
          return;
        }
        // WRAITH unscoped hip-fire: AWP handles its own rate limiting
        if (this._playerClass === 'WRAITH') {
          if (this.onShoot) this.onShoot();
          return;
        }
        // SOLDIER / GHOST: ammo check → fire rate gate → fire → consume ammo
        if (this._isReloading) return;
        if (this._ammo <= 0) { this._startReload(); return; }
        if (!this._canShoot()) return;
        if (this.onShoot) this.onShoot();
        this._ammo--;
        if (this.onAmmoChanged) this.onAmmoChanged(this._ammo, this._reserve);
        if (this._ammo <= 0 && this._reserve > 0) this._startReload();
        return;
      }
      if (e.button === 2) {
        if (!this.isPlaying || this.isDead) return;
        if (this._playerClass !== 'WRAITH') return;
        if (this._adsToggle) {
          // Toggle mode: each right-click flips scope state
          if (this.isScoped) {
            this.isScoped = false;
            if (this.onUnscope) this.onUnscope();
          } else {
            this.isScoped = true;
            if (this.onScope) this.onScope();
          }
        } else {
          // Hold mode: scope while button held
          if (this.isScoped) return;
          this.isScoped = true;
          if (this.onScope) this.onScope();
        }
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button !== 2) return;
      if (this._adsToggle) return; // toggle mode: mouseup does NOT unscope
      if (!this.isScoped) return;
      this.isScoped = false;
      if (this.onUnscope) this.onUnscope();
    });

    document.addEventListener('keydown', (e) => {
      if (this._inputLocked) return;
      this.keys[e.code] = true;
      if (e.code === 'Escape') {
        if (this.isScoped) {
          this.isScoped = false;
          if (this.onUnscope) this.onUnscope();
        }
        this._setPlaying(false);
        this._lastMouseX = null;
        this._lastMouseY = null;
        return;
      }
      if (this.isPlaying && !this.isDead) {
        if (e.code === 'KeyR') {
          if (this._playerClass === 'WRAITH') { if (this.onReload) this.onReload(); }
          else this._startReload();
        }
        if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && this.isScoped && this.onHoldBreath) {
          if (!this._breathHeld) {
            this._breathHeld = true;
            this.onHoldBreath();
            if (this._breathTimeout) clearTimeout(this._breathTimeout);
            this._breathTimeout = setTimeout(() => { this._breathHeld = false; }, 3100);
          }
        }
      }
      const GAME_KEYS = ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
                         'Space','ShiftLeft','ShiftRight','KeyC','ControlLeft','ControlRight'];
      if (!this.isPlaying && GAME_KEYS.includes(e.code)) this._enter();
    });

    document.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        if (this._breathHeld) {
          this._breathHeld = false;
          if (this._breathTimeout) { clearTimeout(this._breathTimeout); this._breathTimeout = null; }
          if (this.onReleaseBreath) this.onReleaseBreath();
        }
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isPlaying || this.isDead || this._inputLocked) return;
      let dx, dy;
      if (this.isLocked) {
        dx = e.movementX; dy = e.movementY;
      } else {
        if (this._lastMouseX === null) { this._lastMouseX = e.clientX; this._lastMouseY = e.clientY; return; }
        dx = e.clientX - this._lastMouseX; dy = e.clientY - this._lastMouseY;
        this._lastMouseX = e.clientX; this._lastMouseY = e.clientY;
      }
      const sens = this.isScoped ? this.adsSensitivity : this.sensitivity;
      const invertFactor = this._invertY ? -1 : 1;
      this.yaw   -= dx * sens;
      this.pitch -= dy * sens * invertFactor;
      const MAX_PITCH = (80 * Math.PI) / 180;
      this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
    });
  }

  isSprinting() { return !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']); }
  isJumping()   { return !!this.keys['Space']; }
  isCrouching() { return this._crouching; }

  getSpeed()          { return CLASSES[this._playerClass]?.speed ?? 8; }
  getMovementVector() { return { x: 0, z: 0 }; }

  applyToCamera() {
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }
}
