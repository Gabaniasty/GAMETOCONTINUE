import { CLASSES }     from './Classes.js';
import { ARENA_AABBS } from './MapLoader.js';

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

// ── Collision constants ────────────────────────────────────────────────────
const PLAYER_RADIUS = 0.42;  // horizontal body half-width (square footprint)
const GROUND_MARGIN = 0.55;  // how far above a surface top the feet can be and still land

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
    this._onGround    = true;

    // Scope state (WRAITH only)
    this.isScoped  = false;
    this.onScope   = null;   // () => void — wired up in main.js
    this.onUnscope = null;   // () => void

    // Legacy — kept so existing callers (bullets) still work
    this.collidableMeshes = [];

    this._playerClass  = localStorage.getItem('ng_class') || 'SOLDIER';
    this._lastShotTime = 0;

    this._bindEvents();
  }

  // Kept for API compatibility — bullets still use mesh raycasts
  setCollidableMeshes(meshes) { this.collidableMeshes = meshes; }

  // ── Fire rate gate ───────────────────────────────────────────────────────
  _canShoot() {
    const fireRate = CLASSES[this._playerClass]?.fireRate ?? 200;
    const now = Date.now();
    if (now - this._lastShotTime < fireRate) return false;
    this._lastShotTime = now;
    return true;
  }

  // ── Main physics update ──────────────────────────────────────────────────
  update(camera, dt) {
    if (!this.isPlaying) return;

    // Step 0: crouch lerp
    this._crouching = !!(this.keys['KeyC'] || this.keys['ControlLeft'] || this.keys['ControlRight']);
    const targetEyeY = this._crouching ? CROUCH_Y : EYE_Y;
    this._currentEyeY += (targetEyeY - this._currentEyeY) * Math.min(1, 12 * dt);

    // Step 1: read input
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
    const sprinting  = this.isSprinting() && onGround && !this._crouching && iz < -0.1;
    const targetSpeed = this._crouching ? CROUCH_SPEED : sprinting ? SPRINT_SPEED : WALK_SPEED;

    // Step 2+3: acceleration / gravity
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

    // Step 4: integrate position
    camera.position.x += this._vel.x * dt;
    camera.position.z += this._vel.z * dt;
    camera.position.y += this._vel.y * dt;

    // Step 5: wall collision (AABB) — push before ground check
    this._doWallsAABB(camera);

    // Step 6: ground detection (AABB)
    this._onGround = this._doGroundAABB(camera);

    // Step 7: head bob
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

  // ── Ground check (AABB) ──────────────────────────────────────────────────
  // Finds the highest AABB top-surface below the player's feet and snaps.
  // Also uses the flat arena floor at y = 0.
  _doGroundAABB(camera) {
    const px    = camera.position.x;
    const pz    = camera.position.z;
    const feetY = camera.position.y - this._currentEyeY;
    const R     = PLAYER_RADIUS;

    let groundY = -Infinity;

    // Flat floor at y = 0 (always present)
    if (feetY <= GROUND_MARGIN) {
      groundY = 0;
    }

    // AABB top surfaces
    for (const box of ARENA_AABBS) {
      // Player XZ footprint must overlap AABB XZ
      if (px + R <= box.minX || px - R >= box.maxX) continue;
      if (pz + R <= box.minZ || pz - R >= box.maxZ) continue;
      // Feet must be just above (or slightly inside) the top surface
      if (feetY > box.maxY + GROUND_MARGIN) continue;
      if (feetY < box.maxY - 0.15) continue;  // too far below top — inside the box, skip
      groundY = Math.max(groundY, box.maxY);
    }

    if (groundY > -Infinity) {
      // Hard snap + zero downward vel
      const snapY = groundY + this._currentEyeY;
      if (camera.position.y < snapY + 0.01) {
        camera.position.y = snapY;
        if (this._vel.y < 0) this._vel.y = 0;
      }
      return camera.position.y <= snapY + 0.02;
    }

    // Prevent falling through the absolute world floor
    const absFloor = this._currentEyeY - 0.01;
    if (camera.position.y < absFloor) {
      camera.position.y = absFloor;
      if (this._vel.y < 0) this._vel.y = 0;
      return true;
    }

    return false;
  }

  // ── Wall collision (AABB) ────────────────────────────────────────────────
  // Expands each AABB by PLAYER_RADIUS and pushes the player out along the
  // axis of minimum penetration.  Runs twice per frame to resolve corners.
  _doWallsAABB(camera) {
    this._resolveWalls(camera);
    this._resolveWalls(camera);
  }

  _resolveWalls(camera) {
    const R     = PLAYER_RADIUS;
    const feetY = camera.position.y - this._currentEyeY;
    const headY = camera.position.y + 0.25;

    for (const box of ARENA_AABBS) {
      // Vertical overlap — skip if player is sitting on top of or completely below this box
      if (feetY >= box.maxY - 0.05) continue;   // standing on top — not a wall
      if (headY <= box.minY)         continue;   // completely below — shouldn't happen

      const px = camera.position.x;
      const pz = camera.position.z;

      // Expanded AABB faces (player treated as axis-aligned square)
      const eMinX = box.minX - R, eMaxX = box.maxX + R;
      const eMinZ = box.minZ - R, eMaxZ = box.maxZ + R;

      // Is player centre inside the expanded box on both axes?
      if (px <= eMinX || px >= eMaxX) continue;
      if (pz <= eMinZ || pz >= eMaxZ) continue;

      // Penetration depth along each face
      const dL = px - eMinX;   // depth past left face
      const dR = eMaxX - px;   // depth past right face
      const dF = pz - eMinZ;   // depth past front face
      const dB = eMaxZ - pz;   // depth past back face

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
    // Prevent right-click context menu in game
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('mousedown', (e) => {
      // Left click — shoot or enter game
      if (e.button === 0) {
        if (!this.isPlaying) { this._enter(); return; }
        if (this.isDead) return;
        if (!this._canShoot()) return;
        if (this.onShoot) this.onShoot();
        return;
      }
      // Right click — scope in (WRAITH only)
      if (e.button === 2) {
        if (!this.isPlaying || this.isDead) return;
        if (this._playerClass !== 'WRAITH') return;
        if (this.isScoped) return;
        this.isScoped = true;
        if (this.onScope) this.onScope();
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button !== 2) return;
      if (!this.isScoped) return;
      this.isScoped = false;
      if (this.onUnscope) this.onUnscope();
    });

    document.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Escape') {
        // Unscope before exiting
        if (this.isScoped) {
          this.isScoped = false;
          if (this.onUnscope) this.onUnscope();
        }
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
      // Divide sensitivity by zoom factor when scoped (6× zoom = 6× slower aim)
      const sens = this.sensitivity * (this.isScoped ? 1 / 6 : 1);
      this.yaw   -= dx * sens;
      this.pitch -= dy * sens;
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
