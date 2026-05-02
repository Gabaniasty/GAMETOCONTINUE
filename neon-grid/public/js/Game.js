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

    // ── Physics ────────────────────────────────────────────────
    this.yVelocity = 0;
    this.onGround  = true;
    this.GRAVITY   = -20;
    this.JUMP_FORCE = 7;
    this.FLOOR_Y   = 1.6;

    // ── Remote player meshes ───────────────────────────────────
    this._remoteMeshes = new Map();

    // ── Transient VFX objects (tracer, particles, muzzle) ─────
    this._vfxObjects = [];

    this._buildLights();
    this._buildMap();

    window.addEventListener('resize', () => this._onResize());
  }

  // ── Lights ────────────────────────────────────────────────────
  _buildLights() {
    this.scene.add(new THREE.AmbientLight(0x111133, 1));

    [
      { color: 0x00f5ff, pos: [20, 3, 20] },
      { color: 0xff2d78, pos: [-20, 3, -20] },
      { color: 0x7b2fff, pos: [20, 3, -20] },
    ].forEach(({ color, pos }) => {
      const l = new THREE.PointLight(color, 2, 30);
      l.position.set(...pos);
      l.castShadow = true;
      this.scene.add(l);
    });
  }

  // ── Map ───────────────────────────────────────────────────────
  _buildMap() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: 0x111122 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(80, 80, 0x00f5ff, 0x003344);
    grid.position.y = 0.01;
    this.scene.add(grid);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0d0d22, emissive: 0x00f5ff, emissiveIntensity: 0.1 });
    this._walls = [];
    [
      [0, 2, -40, 0], [0, 2, 40, 0],
      [-40, 2, 0, Math.PI / 2], [40, 2, 0, Math.PI / 2],
    ].forEach(([px, py, pz, ry]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(80, 4, 1), wallMat);
      m.position.set(px, py, pz); m.rotation.y = ry;
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m); this._walls.push(m);
    });

    const coverMat = new THREE.MeshStandardMaterial({ color: 0x1a0033, emissive: 0xff2d78, emissiveIntensity: 0.05 });
    [[-15,0,-15],[15,0,-15],[-15,0,15],[15,0,15],[0,0,-25],[0,0,25],[-25,0,0],[25,0,0]]
      .forEach(([px,,pz]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), coverMat);
        m.position.set(px, 1, pz); m.castShadow = true; m.receiveShadow = true;
        this.scene.add(m);
      });

    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x0d0d22, emissive: 0x7b2fff, emissiveIntensity: 0.1 });
    [[-35,0,-35],[35,0,-35],[-35,0,35],[35,0,35]].forEach(([px,,pz]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 2), pillarMat);
      m.position.set(px, 3, pz); m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
    });
  }

  // ── Remote players ────────────────────────────────────────────
  _makeNameSprite(username, color) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    ctx.font = 'bold 28px Orbitron, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const hex = '#' + color.toString(16).padStart(6, '0');
    ctx.shadowColor = hex; ctx.shadowBlur = 12;
    ctx.fillStyle = hex;
    ctx.fillText(username, 128, 32);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.5, 0.625, 1);
    return sprite;
  }

  _createRemoteMesh(player) {
    const color = CLASS_COLORS[player.class] || 0x00f5ff;
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 });
    const body  = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.8), mat);
    const head  = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), mat.clone());
    head.position.y = 1.2;
    const label = this._makeNameSprite(player.username, color);
    label.position.y = 2.2;
    const group = new THREE.Group();
    group.add(body, head, label);
    this.scene.add(group);
    return group;
  }

  updateRemotePlayers(players) {
    const seen = new Set();
    players.forEach((p) => {
      seen.add(p.id);
      let g = this._remoteMeshes.get(p.id);
      if (!g) { g = this._createRemoteMesh(p); this._remoteMeshes.set(p.id, g); }
      g.position.set(p.x, p.y - 0.8, p.z);
      g.rotation.y = p.rotY;
      g.visible = !p.dead;
    });
    this._remoteMeshes.forEach((g, id) => {
      if (!seen.has(id)) { this.scene.remove(g); this._remoteMeshes.delete(id); }
    });
  }

  // ── Visual FX ─────────────────────────────────────────────────

  spawnTracer(origin, direction) {
    const points = [
      new THREE.Vector3(origin.x, origin.y, origin.z),
      new THREE.Vector3(
        origin.x + direction.x * 40,
        origin.y + direction.y * 40,
        origin.z + direction.z * 40,
      ),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0x00f5ff, transparent: true, opacity: 0.9 });
    const line = new THREE.LineSegments(geo, mat);
    this.scene.add(line);
    const obj = { mesh: line, ttl: 0.08, type: 'tracer' };
    this._vfxObjects.push(obj);
  }

  spawnMuzzleFlash(camera) {
    const fwd = new THREE.Vector3(0, 0, -0.5).applyQuaternion(camera.quaternion);
    const pos = camera.position.clone().add(fwd);
    const light = new THREE.PointLight(0x00f5ff, 6, 4);
    light.position.copy(pos);
    this.scene.add(light);
    const obj = { mesh: light, ttl: 0.08, type: 'light' };
    this._vfxObjects.push(obj);
  }

  spawnHitParticles(position) {
    const colors = [0xff2d78, 0x00f5ff, 0xff2d78, 0x00f5ff, 0xff2d78, 0x00f5ff, 0xff2d78, 0x00f5ff];
    colors.forEach((col) => {
      const mat  = new THREE.MeshBasicMaterial({ color: col, transparent: true });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), mat);
      mesh.position.set(position.x, position.y, position.z);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        Math.random() * 4 + 1,
        (Math.random() - 0.5) * 6,
      );
      this.scene.add(mesh);
      this._vfxObjects.push({ mesh, ttl: 0.3, type: 'particle', vel, mat });
    });
  }

  // ── Tick VFX ─────────────────────────────────────────────────
  _tickVfx(dt) {
    for (let i = this._vfxObjects.length - 1; i >= 0; i--) {
      const obj = this._vfxObjects[i];
      obj.ttl -= dt;

      if (obj.type === 'particle') {
        obj.mesh.position.x += obj.vel.x * dt;
        obj.mesh.position.y += obj.vel.y * dt;
        obj.mesh.position.z += obj.vel.z * dt;
        obj.vel.y -= 10 * dt;
        obj.mat.opacity = Math.max(0, obj.ttl / 0.3);
      }

      if (obj.ttl <= 0) {
        this.scene.remove(obj.mesh);
        if (obj.type === 'tracer' || obj.type === 'particle') obj.mesh.geometry.dispose();
        this._vfxObjects.splice(i, 1);
      }
    }
  }

  // ── Collision ─────────────────────────────────────────────────
  _clampToWalls(pos) {
    const HALF = 39.4, R = 0.4;
    pos.x = Math.max(-HALF + R, Math.min(HALF - R, pos.x));
    pos.z = Math.max(-HALF + R, Math.min(HALF - R, pos.z));
  }

  // ── Resize ────────────────────────────────────────────────────
  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ── Loop ──────────────────────────────────────────────────────
  start() { this._animate(); }

  _animate() {
    requestAnimationFrame(() => this._animate());
    const dt = Math.min(this._clock.getDelta(), 0.05);
    const { controls, camera } = this;

    const speed = 8 * (controls.isSprinting() ? 1.5 : 1);
    const move  = controls.getMovementVector();
    camera.position.x += move.x * speed * dt;
    camera.position.z += move.z * speed * dt;
    this._clampToWalls(camera.position);

    if (controls.isJumping() && this.onGround) {
      this.yVelocity = this.JUMP_FORCE;
      this.onGround  = false;
    }
    if (!this.onGround) {
      this.yVelocity       += this.GRAVITY * dt;
      camera.position.y    += this.yVelocity * dt;
      if (camera.position.y <= this.FLOOR_Y) {
        camera.position.y = this.FLOOR_Y;
        this.yVelocity    = 0;
        this.onGround     = true;
      }
    }

    controls.applyToCamera();
    this._tickVfx(dt);
    this.renderer.render(this.scene, camera);
  }
}
