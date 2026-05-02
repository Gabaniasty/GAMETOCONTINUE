import { Controls } from './Controls.js';

const CLASS_COLORS = {
  SOLDIER: 0x00f5ff,
  GHOST:   0xff2d78,
  WRAITH:  0x7b2fff,
};

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

    // ── Remote player meshes: id → { body, head, label } ──────
    this._remoteMeshes = new Map();

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
    const floorGeo = new THREE.PlaneGeometry(80, 80);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x111122 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(80, 80, 0x00f5ff, 0x003344);
    grid.position.y = 0.01;
    this.scene.add(grid);

    const wallDefs = [
      [0, 2, -40,  0],
      [0, 2,  40,  0],
      [-40, 2, 0, Math.PI / 2],
      [ 40, 2, 0, Math.PI / 2],
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

  // ── Remote players ────────────────────────────────────────────
  _makeNameSprite(username, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 256, 64);
    ctx.font = 'bold 28px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const hex = '#' + color.toString(16).padStart(6, '0');
    ctx.shadowColor = hex;
    ctx.shadowBlur = 12;
    ctx.fillStyle = hex;
    ctx.fillText(username, 128, 32);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.5, 0.625, 1);
    return sprite;
  }

  _createRemoteMesh(player) {
    const color = CLASS_COLORS[player.class] || 0x00f5ff;
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.4,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.8), mat);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), mat.clone());
    head.position.y = 1.2; // above body centre

    const label = this._makeNameSprite(player.username, color);
    label.position.y = 2.2;

    const group = new THREE.Group();
    group.add(body);
    group.add(head);
    group.add(label);

    this.scene.add(group);
    return group;
  }

  updateRemotePlayers(players) {
    const seenIds = new Set();

    players.forEach((p) => {
      seenIds.add(p.id);

      let group = this._remoteMeshes.get(p.id);
      if (!group) {
        group = this._createRemoteMesh(p);
        this._remoteMeshes.set(p.id, group);
      }

      // body centre = y - 0.8 so feet land on the floor
      group.position.set(p.x, p.y - 0.8, p.z);
      group.rotation.y = p.rotY;
    });

    // Remove stale meshes
    this._remoteMeshes.forEach((group, id) => {
      if (!seenIds.has(id)) {
        this.scene.remove(group);
        this._remoteMeshes.delete(id);
      }
    });
  }

  // ── Wall AABB collision ───────────────────────────────────────
  _clampToWalls(pos) {
    const HALF = 39.4;
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

    const BASE_SPEED = 8;
    const speed = BASE_SPEED * (controls.isSprinting() ? 1.5 : 1);
    const move = controls.getMovementVector();
    camera.position.x += move.x * speed * dt;
    camera.position.z += move.z * speed * dt;

    this._clampToWalls(camera.position);

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

    controls.applyToCamera();
    this.renderer.render(this.scene, this.camera);
  }
}
