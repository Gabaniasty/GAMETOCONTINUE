import { Controls } from './Controls.js';

export class Game {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this._clock = new THREE.Clock();

    // ── Renderer ───────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // ── Scene ──────────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0f);
    this.scene.fog = new THREE.FogExp2(0x0a0a0f, 0.05);

    // ── Camera ─────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camera.position.set(0, 1.6, 0);

    // ── Controls ───────────────────────────────────────────────
    this.controls = new Controls(this.camera, this.canvas);

    // ── Player physics ─────────────────────────────────────────
    this.yVelocity = 0;
    this.onGround = true;
    this.GRAVITY = -20;
    this.JUMP_FORCE = 7;
    this.FLOOR_Y = 1.6;

    // ── Build world ────────────────────────────────────────────
    this._buildLights();
    this._buildMap();

    // ── Resize ─────────────────────────────────────────────────
    window.addEventListener('resize', () => this._onResize());
  }

  // ── Lights ────────────────────────────────────────────────────
  _buildLights() {
    const ambient = new THREE.AmbientLight(0x111133, 1);
    this.scene.add(ambient);

    const neonDefs = [
      { color: 0x00f5ff, pos: [20, 3, 20] },
      { color: 0xff2d78, pos: [-20, 3, -20] },
      { color: 0x7b2fff, pos: [20, 3, -20] },
    ];
    neonDefs.forEach(({ color, pos }) => {
      const light = new THREE.PointLight(color, 2, 30);
      light.position.set(...pos);
      light.castShadow = true;
      this.scene.add(light);
    });
  }

  // ── Map ───────────────────────────────────────────────────────
  _buildMap() {
    // Floor
    const floorGeo = new THREE.PlaneGeometry(80, 80);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x111122 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Grid overlay
    const grid = new THREE.GridHelper(80, 80, 0x00f5ff, 0x003344);
    grid.position.y = 0.01;
    this.scene.add(grid);

    // Walls — [posX, posY, posZ, rotY]
    const wallDefs = [
      [0, 2, -40,  0],   // North
      [0, 2,  40,  0],   // South
      [-40, 2, 0, Math.PI / 2],  // West
      [ 40, 2, 0, Math.PI / 2],  // East
    ];
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x0d0d22,
      emissive: 0x00f5ff,
      emissiveIntensity: 0.1,
    });
    this._walls = [];
    wallDefs.forEach(([px, py, pz, ry]) => {
      const geo = new THREE.BoxGeometry(80, 4, 1);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(px, py, pz);
      mesh.rotation.y = ry;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this._walls.push(mesh);
    });

    // Cover boxes
    const coverPositions = [
      [-15, 0, -15], [15, 0, -15], [-15, 0, 15], [15, 0, 15],
      [0, 0, -25],   [0, 0, 25],   [-25, 0, 0],  [25, 0, 0],
    ];
    const coverMat = new THREE.MeshStandardMaterial({
      color: 0x1a0033,
      emissive: 0xff2d78,
      emissiveIntensity: 0.05,
    });
    coverPositions.forEach(([px, , pz]) => {
      const geo = new THREE.BoxGeometry(3, 2, 3);
      const mesh = new THREE.Mesh(geo, coverMat);
      mesh.position.set(px, 1, pz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    });

    // Corner pillars
    const pillarPositions = [[-35, 0, -35], [35, 0, -35], [-35, 0, 35], [35, 0, 35]];
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x0d0d22,
      emissive: 0x7b2fff,
      emissiveIntensity: 0.1,
    });
    pillarPositions.forEach(([px, , pz]) => {
      const geo = new THREE.BoxGeometry(2, 6, 2);
      const mesh = new THREE.Mesh(geo, pillarMat);
      mesh.position.set(px, 3, pz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    });
  }

  // ── Wall AABB collision ───────────────────────────────────────
  _clampToWalls(pos) {
    const HALF = 39.4; // slightly inside the wall
    const RADIUS = 0.4;
    pos.x = Math.max(-HALF + RADIUS, Math.min(HALF - RADIUS, pos.x));
    pos.z = Math.max(-HALF + RADIUS, Math.min(HALF - RADIUS, pos.z));
  }

  // ── Resize ────────────────────────────────────────────────────
  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ── Main loop ─────────────────────────────────────────────────
  start() {
    this._animate();
  }

  _animate() {
    requestAnimationFrame(() => this._animate());

    const dt = Math.min(this._clock.getDelta(), 0.05);
    const { controls, camera } = this;

    // ── Movement ──────────────────────────────────────────────
    const BASE_SPEED = 8;
    const speed = BASE_SPEED * (controls.isSprinting() ? 1.5 : 1);
    const move = controls.getMovementVector();
    camera.position.x += move.x * speed * dt;
    camera.position.z += move.z * speed * dt;

    // ── Wall collision ────────────────────────────────────────
    this._clampToWalls(camera.position);

    // ── Jump & gravity ────────────────────────────────────────
    if (controls.isJumping() && this.onGround) {
      this.yVelocity = this.JUMP_FORCE;
      this.onGround = false;
    }

    if (!this.onGround) {
      this.yVelocity += this.GRAVITY * dt;
      camera.position.y += this.yVelocity * dt;

      if (camera.position.y <= this.FLOOR_Y) {
        camera.position.y = this.FLOOR_Y;
        this.yVelocity = 0;
        this.onGround = true;
      }
    }

    // ── Camera rotation ───────────────────────────────────────
    controls.applyToCamera();

    // ── Render ────────────────────────────────────────────────
    this.renderer.render(this.scene, this.camera);
  }
}
