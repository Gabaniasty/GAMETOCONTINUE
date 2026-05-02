import { CLASSES } from './Classes.js';

export class Controls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.yaw   = 0;
    this.pitch = 0;
    this.sensitivity = parseFloat(localStorage.getItem('ng_sensitivity') || '0.002');

    this.keys      = {};
    this.isLocked  = false;
    this.isPlaying = false;
    this.onShoot   = null;

    this._overlay   = null;
    this._crosshair = null;

    this._lastMouseX = null;
    this._lastMouseY = null;

    // Class-based stats
    this._playerClass  = localStorage.getItem('ng_class') || 'SOLDIER';
    this._lastShotTime = 0;

    this._bindEvents();
  }

  // ── Class helpers ──────────────────────────────────────────────────
  getSpeed() {
    const base = CLASSES[this._playerClass]?.speed ?? 8;
    return base * (this.isSprinting() ? 1.5 : 1);
  }

  _canShoot() {
    const fireRate = CLASSES[this._playerClass]?.fireRate ?? 200;
    const now = Date.now();
    if (now - this._lastShotTime < fireRate) return false;
    this._lastShotTime = now;
    return true;
  }

  // ── Overlay helpers ────────────────────────────────────────────────
  _getOverlay()   { return this._overlay   || (this._overlay   = document.getElementById('lock-overlay')); }
  _getCrosshair() { return this._crosshair || (this._crosshair = document.getElementById('crosshair')); }

  _setPlaying(value) {
    this.isPlaying = value;
    const ov = this._getOverlay();
    const ch = this._getCrosshair();
    if (ov) ov.style.display   = value ? 'none'  : 'flex';
    if (ch) ch.style.display   = value ? 'block' : 'none';
  }

  _tryPointerLock() {
    try {
      const p = this.domElement.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) { /* blocked in iframes — ignore */ }
  }

  _enter() {
    if (!this.isPlaying) this._setPlaying(true);
    this._tryPointerLock();
  }

  _bindEvents() {
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (!this.isPlaying) {
        this._enter();
        return; // first click enters play mode, doesn't shoot
      }
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

      const GAME_KEYS = ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight'];
      if (!this.isPlaying && GAME_KEYS.includes(e.code)) {
        this._enter();
      }
    });

    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isPlaying) return;

      let dx, dy;
      if (this.isLocked) {
        dx = e.movementX;
        dy = e.movementY;
      } else {
        if (this._lastMouseX === null) {
          this._lastMouseX = e.clientX;
          this._lastMouseY = e.clientY;
          return;
        }
        dx = e.clientX - this._lastMouseX;
        dy = e.clientY - this._lastMouseY;
        this._lastMouseX = e.clientX;
        this._lastMouseY = e.clientY;
      }

      this.yaw   -= dx * this.sensitivity;
      this.pitch -= dy * this.sensitivity;
      const MAX_PITCH = (85 * Math.PI) / 180;
      this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
    });
  }

  isSprinting() { return !!this.keys['ShiftLeft'] || !!this.keys['ShiftRight']; }
  isJumping()   { return !!this.keys['Space']; }

  getMovementVector() {
    let fx = 0, fz = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp'])    fz -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown'])  fz += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft'])  fx -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) fx += 1;

    if (fx === 0 && fz === 0) return { x: 0, z: 0 };

    const len = Math.sqrt(fx * fx + fz * fz);
    fx /= len; fz /= len;

    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    return {
      x:  fx * cos + fz * sin,
      z: -fx * sin + fz * cos,
    };
  }

  applyToCamera() {
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }
}
