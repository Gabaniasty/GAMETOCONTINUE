export class BulletSystem {
  constructor(scene) {
    this._scene   = scene;
    this._bullets = [];
    this._impacts = [];
  }

  // camera: THREE.Camera — used to offset spawn to barrel tip
  spawnBullet(origin, direction, camera) {
    const dir   = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up    = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

    const spawnPos = new THREE.Vector3(origin.x, origin.y, origin.z)
      .addScaledVector(dir,   0.4)
      .addScaledVector(right, 0.15)
      .addScaledVector(up,   -0.1);

    // Bullet mesh — cylinder oriented along Z
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.18, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    mesh.rotation.x = Math.PI / 2; // align to Z axis

    const glow = new THREE.PointLight(0x00f5ff, 3, 1.5);

    const group = new THREE.Group();
    group.add(mesh, glow);
    group.position.copy(spawnPos);
    // Align travel direction to +Z of group
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this._scene.add(group);

    // Trail — 6-point line
    const tPos = new Float32Array(6 * 3);
    for (let i = 0; i < 18; i++) tPos[i] = spawnPos.toArray()[i % 3];
    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
    tGeo.setDrawRange(0, 1);
    const trail = new THREE.Line(
      tGeo,
      new THREE.LineBasicMaterial({ color: 0x00f5ff, transparent: true, opacity: 0.7 })
    );
    this._scene.add(trail);

    this._bullets.push({
      group, trail, tPos,
      history: [spawnPos.clone()],
      dir,
      speed:    60,
      lifetime: 1.5,
    });
  }

  update(dt) {
    // ── Bullets ──────────────────────────────────────────────────
    for (let i = this._bullets.length - 1; i >= 0; i--) {
      const b = this._bullets[i];
      b.lifetime -= dt;
      if (b.lifetime <= 0) { this._killBullet(i); continue; }

      b.group.position.addScaledVector(b.dir, b.speed * dt);

      // Trail history (newest first)
      b.history.unshift(b.group.position.clone());
      if (b.history.length > 6) b.history.pop();

      // Pack positions newest → oldest
      const h = b.history;
      for (let j = 0; j < 6; j++) {
        const src = h[j] || h[h.length - 1];
        b.tPos[j * 3]     = src.x;
        b.tPos[j * 3 + 1] = src.y;
        b.tPos[j * 3 + 2] = src.z;
      }
      b.trail.geometry.attributes.position.needsUpdate = true;
      b.trail.geometry.setDrawRange(0, h.length);
    }

    // ── Impact particles / lights ─────────────────────────────────
    for (let i = this._impacts.length - 1; i >= 0; i--) {
      const obj = this._impacts[i];
      obj.ttl -= dt;

      if (obj.vel) {
        obj.mesh.position.addScaledVector(obj.vel, dt);
        obj.vel.y -= 10 * dt;
        obj.mesh.material.opacity = Math.max(0, obj.ttl / obj.maxTtl);
      } else {
        // Point light — fade intensity
        obj.mesh.intensity = Math.max(0, (obj.ttl / obj.maxTtl) * 10);
      }

      if (obj.ttl <= 0) {
        this._scene.remove(obj.mesh);
        this._impacts.splice(i, 1);
      }
    }
  }

  onHit(position) {
    const pos = new THREE.Vector3(position.x, position.y, position.z);

    // 6 impact particles
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0xff2d78, transparent: true })
      );
      mesh.position.copy(pos);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        Math.random() * 5 + 1,
        (Math.random() - 0.5) * 8,
      );
      this._scene.add(mesh);
      this._impacts.push({ mesh, vel, ttl: 0.3, maxTtl: 0.3 });
    }

    // Impact point light
    const light = new THREE.PointLight(0xff2d78, 10, 3);
    light.position.copy(pos);
    this._scene.add(light);
    this._impacts.push({ mesh: light, vel: null, ttl: 0.2, maxTtl: 0.2 });
  }

  _killBullet(i) {
    const b = this._bullets[i];
    this._scene.remove(b.group);
    this._scene.remove(b.trail);
    b.trail.geometry.dispose();
    this._bullets.splice(i, 1);
  }
}
