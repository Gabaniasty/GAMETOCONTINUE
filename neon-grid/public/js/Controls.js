import { CLASSES } from './Classes.js';

// ── Movement constants ────────────────────────────────────────────────────
const EYE_Y        = 1.65;
const CROUCH_Y     = 1.1;
const WALK_SPEED   = 5.5;
const SPRINT_SPEED = 8.2;
const CROUCH_SPEED = 2.8;
const AIR_SPEED    = 3.5;
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

// ── Wall collision push distance ──────────────────────────────────────────
const WALL_DIST = 0.45;

export class Controls {
  constructor(camera, domElement) {
    this.camera     = camera;
    this.domElement = domElement;

    this.yaw   = 0;
    this.pitch = 0;
    this.sensitivity = parseFloat(localStorage.getItem('ng_sensitivity') || '0.0018');

    this.keys      = {};
    this.isLocked  = false;
    this.isPlaying = false;
    this.isDead    = false;
    this.onShoot   = null;

    this._overlay    = null;
    this._crosshair  = null;
    this._lastMouseX = null;
    this._lastMouseY = null;

    this._vel         = { x: 0, y: 0, z: 0 };
    this._currentEyeY = EYE_Y;
    this._bobTimer    = 0;
    this._crouching   = false;
    this._jumpHeld    = false;
    this._onGround    = true;     // last-frame ground state

    this.collidableMeshes = [];

    this._playerClass  = localStorage.getItem('ng_class') || 'SOLDIER';
    this._lastShotTime = 0;

    this._bindEvents();
  }

  setCollidableMeshes(meshes) { this.collidableMeshes = meshes; }

  // ── Fire rate gate ───────────────────────────────────────────────────────
  _canShoot() {
    const fireRate = CLASSES[this._playerClass]?.fireRate ?? 200;
    const now = Date.now();
    if (now - this._lastShotTime < fireRate) return false;
    this._lastShotTime = now;
    return true;
  }

  // ── Main physics update (exact order from spec) ──────────────────────────
  update(camera, dt) {
    if (!this.isPlaying) return;

    // ── Step 0: crouch lerp (speed 12/s) ─────────────────────────────────
    this._crouching = !!(this.keys['KeyC'] || this.keys['ControlLeft'] || this.keys['ControlRight']);
    const targetEyeY = this._crouching ? CROUCH_Y : EYE_Y;
    this._currentEyeY += (targetEyeY - this._currentEyeY) * Math.min(1, 12 * dt);

    // ── Step 1: read input ────────────────────────────────────────────────
    let ix = 0, iz = 0;
    if (!this.isDead) {
      if (this.keys['KeyW'] || this.keys['ArrowUp'])    iz -= 1;
      if (this.keys['KeyS'] || this.keys['ArrowDown'])  iz += 1;
      if (this.keys['KeyA'] || this.keys['ArrowLeft'])  ix -= 1;
      if (this.keys['KeyD'] || this.keys['ArrowRight']) ix += 1;
    }
    const hasInput = ix !== 0 || iz !== 0;
    if (hasInput) { const len = Math.sqrt(ix * ix + iz * iz); ix /= len; iz /= len; }

    // Camera-space wish direction (horizontal only — no pitch)
    const cos   = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    const wishX = ix * cos + iz * sin;
    const wishZ = -ix * sin + iz * cos;

    // Sprint: Shift + grounded + moving forward only
    const onGround  = this._onGround;
    const sprinting = this.isSprinting() && onGround && !this._crouching && iz < -0.1;
    const targetSpeed = this._crouching ? CROUCH_SPEED : sprinting ? SPRINT_SPEED : WALK_SPEED;

    // ── Step 2+3: acceleration / gravity ─────────────────────────────────
    if (onGround) {
      // XZ acceleration
      if (hasInput) {
        const k = Math.min(1, GROUND_ACCEL * dt);
        this._vel.x += (wishX * targetSpeed - this._vel.x) * k;
        this._vel.z += (wishZ * targetSpeed - this._vel.z) * k;
      } else {
        const fric = Math.max(0, 1 - GROUND_FRIC * dt);
        this._vel.x *= fric;
        this._vel.z *= fric;
      }

      // CRITICAL: enforce vel.y = 0 every grounded frame, no exceptions
      this._vel.y = 0;

      // Jump
      if (!this.isDead && this.keys['Space'] && !this._jumpHeld) {
        this._vel.y    = JUMP_FORCE;
        this._jumpHeld = true;
      }
      if (!this.keys['Space']) this._jumpHeld = false;

    } else {
      // Airborne XZ
      this._vel.x += wishX * AIR_ACCEL * dt;
      this._vel.z += wishZ * AIR_ACCEL * dt;
      const hs = Math.sqrt(this._vel.x ** 2 + this._vel.z ** 2);
      if (hs > AIR_SPEED) {
        this._vel.x = (this._vel.x / hs) * AIR_SPEED;
        this._vel.z = (this._vel.z / hs) * AIR_SPEED;
      }

      // Gravity ONLY when airborne
      this._vel.y += GRAVITY * dt;
    }

    // ── Step 4: move camera ───────────────────────────────────────────────
    camera.position.x += this._vel.x * dt;
    camera.position.z += this._vel.z * dt;
    camera.position.y += this._vel.y * dt;

    // ── Step 5: ground detection ──────────────────────────────────────────
    if (this.collidableMeshes.length > 0) {
      this._onGround = this._doGroundCheck(camera);
    } else {
      // Fallback: flat arena floor at y = 0
      const floorY = this._currentEyeY;
      this._onGround = camera.position.y <= floorY + 0.15;
      if (camera.position.y < floorY) {
        camera.position.y = floorY;
        if (this._vel.y < 0) this._vel.y = 0;
      }
    }

    // ── Step 6: wall collision ────────────────────────────────────────────
    if (this.collidableMeshes.length > 0) {
      this._doWallCheck(camera);
    }

    // ── Step 7: head bob (applied on top of final snapped Y) ─────────────
    const hspd = Math.sqrt(this._vel.x ** 2 + this._vel.z ** 2);
    if (hspd > 0.5 && this._onGround && !this._crouching && !this.isDead) {
      this._bobTimer += dt * (sprinting ? SPRINT_BOB_SPD : WALK_BOB_SPD);
      const bobY = Math.sin(this._bobTimer)       * (sprinting ? SPRINT_BOB_AMT : WALK_BOB_AMT);
      const bobX = Math.sin(this._bobTimer * 0.5) * (sprinting ? SPRINT_SWAY    : WALK_SWAY);
      camera.position.y += bobY;
      camera.position.x += bobX;
    } else {
      // Smoothly return bob to nearest zero-crossing — no jarring cut
      const nearest = Math.round(this._bobTimer / Math.PI) * Math.PI;
      this._bobTimer += (nearest - this._bobTimer) * Math.min(1, dt * 8);
    }
  }

  // ── Ground detection: spec Section 1 ────────────────────────────────────
  // Ray from just above feet (camera.y - eyeHeight + 0.1), maxLength 0.25.
  // Hard snap on hit — NO lerp.
  _doGroundCheck(camera) {
    const eyeY  = this._currentEyeY;
    const origin = new THREE.Vector3(
      camera.position.x,
      camera.position.y - eyeY + 0.1,   // 0.1 above feet
      camera.position.z
    );
    const ray  = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, 0.25);
    const hits = ray.intersectObjects(this.collidableMeshes, false);

    if (hits.length > 0) {
      // Hard snap — camera sits exactly at surface + eyeHeight
      camera.position.y = hits[0].point.y + eyeY;
      if (this._vel.y < 0) this._vel.y = 0;
      return true;
    }
    return false;
  }

  // ── Horizontal wall push-back ────────────────────────────────────────────
  _doWallCheck(camera) {
    const fwd   = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3( Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const dirs  = [fwd, fwd.clone().negate(), right, right.clone().negate()];

    // Cast from chest height to avoid floor slabs triggering lateral push
    const origin = new THREE.Vector3(
      camera.position.x,
      camera.position.y - this._currentEyeY * 0.45,
      camera.position.z
    );

    for (const dir of dirs) {
      const ray  = new THREE.Raycaster(origin, dir, 0, WALL_DIST);
      const hits = ray.intersectObjects(this.collidableMeshes, false);
      if (hits.length > 0 && hits[0].distance < WALL_DIST) {
        const push = WALL_DIST - hits[0].distance;
        camera.position.x -= dir.x * push;
        camera.position.z -= dir.z * push;
        const dotV = this._vel.x * dir.x + this._vel.z * dir.z;
        if (dotV > 0) {
          this._vel.x -= dotV * dir.x;
          this._vel.z -= dotV * dir.z;
        }
      }
    }
  }

  // ── Overlay helpers ──────────────────────────────────────────────────────
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
    if (!this.isPlaying) this._setPlaying(true);
    this._tryPointerLock();
  }

  _bindEvents() {
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (!this.isPlaying) { this._enter(); return; }
      if (this.isDead) return;
      if (!this._canShoot()) return;
      if (this.onShoot) this.onShoot();
    });

    document.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Escape') {
        this._setPlaying(false);
        this._lastMouseX = null;
        this._lastMouseY = null;
        return;
      }
      const GAME_KEYS = ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
                         'Space','ShiftLeft','ShiftRight','KeyC','ControlLeft','ControlRight'];
      if (!this.isPlaying && GAME_KEYS.includes(e.code)) this._enter();
    });

    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isPlaying || this.isDead) return;
      let dx, dy;
      if (this.isLocked) {
        dx = e.movementX; dy = e.movementY;
      } else {
        if (this._lastMouseX === null) { this._lastMouseX = e.clientX; this._lastMouseY = e.clientY; return; }
        dx = e.clientX - this._lastMouseX; dy = e.clientY - this._lastMouseY;
        this._lastMouseX = e.clientX; this._lastMouseY = e.clientY;
      }
      this.yaw   -= dx * this.sensitivity;
      this.pitch -= dy * this.sensitivity;
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
