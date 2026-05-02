export class Controls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.yaw = 0;
    this.pitch = 0;
    this.sensitivity = 0.002;

    this.keys = {};
    this.isLocked = false;   // true when pointer lock is actually granted
    this.isPlaying = false;  // true after first click — drives overlay/crosshair
    this.onShoot = null;

    this._overlay = document.getElementById('lock-overlay');
    this._crosshair = document.getElementById('crosshair');

    // For fallback mouse-delta tracking (when pointer lock is unavailable)
    this._lastMouseX = null;
    this._lastMouseY = null;

    this._bindEvents();
  }

  _setPlaying(value) {
    this.isPlaying = value;
    if (this._overlay)   this._overlay.style.display   = value ? 'none'  : 'flex';
    if (this._crosshair) this._crosshair.style.display = value ? 'block' : 'none';
  }

  _bindEvents() {
    // ── Click: enter play mode & attempt pointer lock ──────────
    document.addEventListener('click', () => {
      if (!this.isPlaying) {
        this._setPlaying(true);
      }
      // Always try pointer lock — silently ignored if not supported
      this.domElement.requestPointerLock?.();
    });

    // ── Pointer lock change (real browser / future support) ────
    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
      // Pointer lock exiting doesn't mean we stop playing —
      // only an explicit Escape press should show the overlay again.
    });

    // ── Escape: exit play mode ─────────────────────────────────
    document.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Escape') {
        this._setPlaying(false);
        this._lastMouseX = null;
        this._lastMouseY = null;
      }
    });
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    // ── Mouse look ─────────────────────────────────────────────
    document.addEventListener('mousemove', (e) => {
      if (!this.isPlaying) return;

      let dx, dy;

      if (this.isLocked) {
        // Pointer lock: use hardware deltas
        dx = e.movementX;
        dy = e.movementY;
      } else {
        // Fallback: compute delta from last known position
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

    // ── Shoot ──────────────────────────────────────────────────
    document.addEventListener('mousedown', (e) => {
      if (!this.isPlaying || e.button !== 0) return;
      console.log('SHOOT');
      if (this.onShoot) this.onShoot();
    });
  }

  isSprinting() {
    return !!this.keys['ShiftLeft'] || !!this.keys['ShiftRight'];
  }

  isJumping() {
    return !!this.keys['Space'];
  }

  getMovementVector() {
    let fx = 0, fz = 0;

    if (this.keys['KeyW'] || this.keys['ArrowUp'])    fz -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown'])  fz += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft'])  fx -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) fx += 1;

    if (fx === 0 && fz === 0) return { x: 0, z: 0 };

    const len = Math.sqrt(fx * fx + fz * fz);
    fx /= len;
    fz /= len;

    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    // Three.js Y-rotation matrix applied to local (fx, 0, fz):
    // world_x = fx*cos + fz*sin
    // world_z = -fx*sin + fz*cos
    return {
      x:  fx * cos + fz * sin,
      z: -fx * sin + fz * cos,
    };
  }

  applyToCamera() {
    const { camera, yaw, pitch } = this;
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
  }
}
