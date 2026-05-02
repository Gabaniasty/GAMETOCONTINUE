import { CLASSES } from './Classes.js';

const EYE_Y        = 1.65;
const CROUCH_Y     = 1.1;
const WALK_SPEED   = 5.5;
const SPRINT_SPEED = 8.5;
const CROUCH_SPEED = 2.8;
const AIR_SPEED    = 3.5;
const GROUND_ACCEL = 60;
const GROUND_FRIC  = 50;
const AIR_ACCEL    = 18;
const AIR_FRIC     = 4;
const GRAVITY      = -22;
const JUMP_FORCE   = 7.5;

const WALL_DIST    = 0.45;  // push-back radius from walls
const GROUND_CAST  = 0.3;   // how far below feet to scan for ground

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

    this._overlay   = null;
    this._crosshair = null;
    this._lastMouseX = null;
    this._lastMouseY = null;

    this._vel          = { x: 0, y: 0, z: 0 };
    this._currentEyeY  = EYE_Y;
    this._bobTimer     = 0;
    this._crouching    = false;
    this._jumpHeld     = false;
    this._onGround     = true;

    // Collidable meshes — set after map loads via setCollidableMeshes()
    this.collidableMeshes = [];

    this._playerClass  = localStorage.getItem('ng_class') || 'SOLDIER';
    this._lastShotTime = 0;

    this._bindEvents();
  }

  setCollidableMeshes(meshes) {
    this.collidableMeshes = meshes;
  }

  // ── Fire rate gate ───────────────────────────────────────────────────
  _canShoot() {
    const fireRate = CLASSES[this._playerClass]?.fireRate ?? 200;
    const now = Date.now();
    if (now - this._lastShotTime < fireRate) return false;
    this._lastShotTime = now;
    return true;
  }

  // ── Main physics update ──────────────────────────────────────────────
  update(camera, dt) {
    if (!this.isPlaying) return;

    // Crouch
    this._crouching = !!(this.keys['KeyC'] || this.keys['ControlLeft'] || this.keys['ControlRight']);
    const targetEyeY = this._crouching ? CROUCH_Y : EYE_Y;
    this._currentEyeY += (targetEyeY - this._currentEyeY) * Math.min(1, 10 * dt);

    // Input direction
    let ix = 0, iz = 0;
    if (!this.isDead) {
      if (this.keys['KeyW'] || this.keys['ArrowUp'])    iz -= 1;
      if (this.keys['KeyS'] || this.keys['ArrowDown'])  iz += 1;
      if (this.keys['KeyA'] || this.keys['ArrowLeft'])  ix -= 1;
      if (this.keys['KeyD'] || this.keys['ArrowRight']) ix += 1;
    }
    const hasInput = ix !== 0 || iz !== 0;
    if (hasInput) { const len = Math.sqrt(ix * ix + iz * iz); ix /= len; iz /= len; }

    // Camera-space wish direction (yaw-only, horizontal)
    const cos   = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    const wishX = ix * cos + iz * sin;
    const wishZ = -ix * sin + iz * cos;

    const sprinting   = this.isSprinting() && !this._crouching && hasInput;
    const targetSpeed = this._crouching ? CROUCH_SPEED : sprinting ? SPRINT_SPEED : WALK_SPEED;

    // Use last frame's ground state for acceleration decision
    const onGround = this._onGround;

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
      if (!this.isDead && this.keys['Space'] && !this._jumpHeld) {
        this._vel.y    = JUMP_FORCE;
        this._jumpHeld = true;
      }
      if (!this.keys['Space']) this._jumpHeld = false;
    } else {
      this._vel.x += wishX * AIR_ACCEL * dt;
      this._vel.z += wishZ * AIR_ACCEL * dt;
      const hs = Math.sqrt(this._vel.x ** 2 + this._vel.z ** 2);
      if (hs > AIR_SPEED) { this._vel.x = (this._vel.x / hs) * AIR_SPEED; this._vel.z = (this._vel.z / hs) * AIR_SPEED; }
      const fric = Math.max(0, 1 - AIR_FRIC * dt);
      this._vel.x *= fric;
      this._vel.z *= fric;
    }

    this._vel.y += GRAVITY * dt;

    // Apply velocity
    camera.position.x += this._vel.x * dt;
    camera.position.z += this._vel.z * dt;
    camera.position.y += this._vel.y * dt;

    // Ground + wall collision
    if (this.collidableMeshes.length > 0) {
      this._onGround = this._doGroundCheck(camera);
      this._doWallCheck(camera);
    } else {
      // Fallback: flat floor at y=0
      const minY = this._currentEyeY;
      this._onGround = camera.position.y <= minY + 0.06;
      if (camera.position.y <= minY) {
        camera.position.y = minY;
        if (this._vel.y < 0) this._vel.y = 0;
      }
    }

    // Head bob
    const hspd      = Math.sqrt(this._vel.x ** 2 + this._vel.z ** 2);
    const grounded2 = this._onGround;
    if (hspd > 0.5 && grounded2 && !this.isDead) {
      const bobSpd = sprinting ? 14 : 10;
      const bobAmt = sprinting ? 0.042 : 0.028;
      this._bobTimer += dt;
      camera.position.y += Math.sin(this._bobTimer * bobSpd) * bobAmt;
    } else {
      this._bobTimer *= Math.max(0, 1 - 8 * dt);
    }
  }

  // ── Ground detection + snap ──────────────────────────────────────────
  _doGroundCheck(camera) {
    const feetY  = camera.position.y - this._currentEyeY;
    // Cast from slightly above feet downward
    const origin = new THREE.Vector3(camera.position.x, feetY + GROUND_CAST, camera.position.z);
    const ray    = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, GROUND_CAST + 0.08);
    const hits   = ray.intersectObjects(this.collidableMeshes, false);

    if (hits.length > 0) {
      const surfY = hits[0].point.y;
      // Snap feet to surface if sinking or very close
      if (feetY <= surfY + 0.08) {
        camera.position.y = surfY + this._currentEyeY;
        if (this._vel.y < 0) this._vel.y = 0;
      }
      return true;
    }
    return false;
  }

  // ── Horizontal wall push-back ────────────────────────────────────────
  _doWallCheck(camera) {
    // Horizontal forward/right based on yaw (no pitch component)
    const fwd   = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right  = new THREE.Vector3( Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const dirs  = [fwd, fwd.clone().negate(), right, right.clone().negate()];

    // Cast from chest height (not eye) so floor slabs don't trigger lateral push
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
        // Zero velocity toward this wall
        const dotV = this._vel.x * dir.x + this._vel.z * dir.z;
        if (dotV > 0) {
          this._vel.x -= dotV * dir.x;
          this._vel.z -= dotV * dir.z;
        }
      }
    }
  }

  // ── Overlay helpers ──────────────────────────────────────────────────
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
