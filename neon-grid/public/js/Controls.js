export class Controls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.yaw   = 0;
    this.pitch = 0;
    this.sensitivity = 0.002;

    this.keys      = {};
    this.isLocked  = false;
    this.isPlaying = false;
    this.onShoot   = null;

    this._overlay   = null;
    this._crosshair = null;

    // Fallback mouse-delta tracking (no pointer lock)
    this._lastMouseX = null;
    this._lastMouseY = null;

    this._bindEvents();
  }

  // Lazy-resolve overlay elements in case they aren't in DOM at construction time
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
    // ── Enter play on mousedown (fires before click, works inside iframes) ──
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (!this.isPlaying) {
        this._enter();
        return; // don't shoot on the very first click that enters play mode
      }
      // Shoot on subsequent left-clicks
      console.log('SHOOT');
      if (this.onShoot) this.onShoot();
    });

    // ── Also enter on first game-key press so keyboard users get in instantly ──
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

    // ── Pointer lock change ──────────────────────────────────────
    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
    });

    // ── Mouse look ───────────────────────────────────────────────
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
