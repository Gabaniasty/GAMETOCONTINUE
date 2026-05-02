export class Controls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.yaw = 0;
    this.pitch = 0;
    this.sensitivity = 0.002;

    this.keys = {};
    this.isLocked = false;
    this.jumpVelocity = 0;
    this.onShoot = null;

    this._overlay = document.getElementById('lock-overlay');
    this._crosshair = document.getElementById('crosshair');

    this._bindEvents();
  }

  _bindEvents() {
    // Pointer lock — listen on document so clicks on the overlay also work
    document.addEventListener('click', () => {
      if (!this.isLocked) this.domElement.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
      if (this._overlay) this._overlay.style.display = this.isLocked ? 'none' : 'flex';
      if (this._crosshair) this._crosshair.style.display = this.isLocked ? 'block' : 'none';
    });

    // Mouse look
    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      const MAX_PITCH = (85 * Math.PI) / 180;
      this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
    });

    // Keys
    document.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    // Shoot
    document.addEventListener('mousedown', (e) => {
      if (!this.isLocked || e.button !== 0) return;
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

  // Returns {x, z} movement intent in world-space relative to camera yaw
  getMovementVector() {
    let fx = 0, fz = 0;

    if (this.keys['KeyW'] || this.keys['ArrowUp'])    fz -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown'])  fz += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft'])  fx -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) fx += 1;

    if (fx === 0 && fz === 0) return { x: 0, z: 0 };

    // Normalize diagonal
    const len = Math.sqrt(fx * fx + fz * fz);
    fx /= len;
    fz /= len;

    // Rotate by yaw so movement is relative to where the camera faces
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    return {
      x: fx * cos - fz * sin,
      z: fx * sin + fz * cos,
    };
  }

  // Apply yaw/pitch to the camera's quaternion each frame
  applyToCamera() {
    const { camera, yaw, pitch } = this;
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
  }
}
