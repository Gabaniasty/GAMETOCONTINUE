export class BulletSystem {
  constructor(scene) {
    this._scene              = scene;
    this._bullets            = [];
    this._impacts            = [];
    this.collidableMeshes    = [];
    this._playerHitboxes     = new Map(); // playerId → THREE.Mesh
  }

  // ── Called by main.js after map loads ────────────────────────────────
  setCollidableMeshes(meshes) { this.collidableMeshes = meshes; }

  // ── Keep hitbox spheres in sync with remote players ──────────────────
  updatePlayerHitboxes(remotePlayers) {
    const seen = new Set();
    for (const p of remotePlayers) {
      if (!p.id) continue;
      seen.add(p.id);
      let mesh = this._playerHitboxes.get(p.id);
      if (!mesh) {
        const geo = new THREE.SphereGeometry(0.7, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
        mesh = new THREE.Mesh(geo, mat);
        mesh.userData.isPlayerHitbox = true;
        mesh.userData.playerId       = p.id;
        this._scene.add(mesh);
        this._playerHitboxes.set(p.id, mesh);
      }
      mesh.position.set(p.x, (p.y || 1.65) - 0.85, p.z);
      mesh.visible = !p.dead;
    }
    // Remove disconnected players
    for (const [id, mesh] of this._playerHitboxes) {
      if (!seen.has(id)) {
        this._scene.remove(mesh);
        this._playerHitboxes.delete(id);
      }
    }
  }

  // ── Main shoot entry-point (replaces old spawnBullet) ────────────────
  // Returns: { type: 'wall'|'player'|'miss', playerId?, distance? }
  // barrelPos: optional THREE.Vector3 world position of the barrel tip for visual spawn
  shoot(origin, direction, camera, barrelPos = null) {
    const originVec = new THREE.Vector3(origin.x, origin.y, origin.z);
    const dirVec    = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();

    // Gather all testable targets
    const wallTargets   = this.collidableMeshes;
    const playerTargets = Array.from(this._playerHitboxes.values()).filter(m => m.visible);
    const allTargets    = [...wallTargets, ...playerTargets];

    if (allTargets.length === 0) {
      this._spawnTravelingBullet(originVec, dirVec, camera, 200, barrelPos);
      return { type: 'miss' };
    }

    const raycaster = new THREE.Raycaster(originVec.clone(), dirVec.clone(), 0, 200);
    const hits      = raycaster.intersectObjects(allTargets, false);

    if (hits.length === 0) {
      this._spawnTravelingBullet(originVec, dirVec, camera, 200, barrelPos);
      return { type: 'miss' };
    }

    const first = hits[0];

    if (first.object.userData.isMapGeometry) {
      this._spawnTravelingBullet(originVec, dirVec, camera, first.distance, barrelPos);
      this._spawnWallImpact(first.point);
      return { type: 'wall', point: first.point };
    }

    if (first.object.userData.isPlayerHitbox) {
      this._spawnTravelingBullet(originVec, dirVec, camera, first.distance, barrelPos);
      return {
        type:     'player',
        playerId: first.object.userData.playerId,
        distance: first.distance,
        hitPoint: first.point,
      };
    }

    this._spawnTravelingBullet(originVec, dirVec, camera, 200, barrelPos);
    return { type: 'miss' };
  }

  // ── Traveling bullet visual ───────────────────────────────────────────
  _spawnTravelingBullet(originVec, dirVec, camera, maxDist, barrelPos = null) {
    let spawnPos;
    if (barrelPos) {
      // Use the actual barrel tip world position
      spawnPos = barrelPos.clone();
    } else {
      // Fallback: estimate spawn from camera with weapon-side offset
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const up    = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      spawnPos = originVec.clone()
        .addScaledVector(dirVec, 0.4)
        .addScaledVector(right,  0.15)
        .addScaledVector(up,    -0.1);
    }

    const cylGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.18, 6);
    const mesh   = new THREE.Mesh(cylGeo, new THREE.MeshBasicMaterial({ color: 0x88ffff }));
    mesh.rotation.x = Math.PI / 2;

    const group = new THREE.Group();
    group.add(mesh);
    group.position.copy(spawnPos);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dirVec);
    this._scene.add(group);

    // Trail
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
      cylGeo,
      dir:          dirVec.clone(),
      speed:        60,
      lifetime:     0.6,
      maxDist,
      traveledDist: 0,
    });
  }

  // ── Wall spark impact ─────────────────────────────────────────────────
  _spawnWallImpact(point) {
    for (let i = 0; i < 6; i++) {
      const geo  = new THREE.BoxGeometry(0.04, 0.04, 0.04);
      const mat  = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(point);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 2 + 0.5,
        (Math.random() - 0.5) * 4
      );
      this._scene.add(mesh);
      this._impacts.push({ mesh, vel, ttl: 0.25, maxTtl: 0.25 });
    }
    const light = new THREE.PointLight(0xffaa00, 4, 1.5);
    light.position.copy(point);
    this._scene.add(light);
    this._impacts.push({ mesh: light, vel: null, ttl: 0.15, maxTtl: 0.15 });
  }

  // ── Player hit pink burst (called from network.onHit) ─────────────────
  onHit(position) {
    const pos = new THREE.Vector3(position.x, position.y, position.z);
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
    const light = new THREE.PointLight(0xff2d78, 10, 3);
    light.position.copy(pos);
    this._scene.add(light);
    this._impacts.push({ mesh: light, vel: null, ttl: 0.2, maxTtl: 0.2 });
  }

  update(dt) {
    // ── Bullets ──────────────────────────────────────────────────────
    for (let i = this._bullets.length - 1; i >= 0; i--) {
      const b = this._bullets[i];
      b.lifetime     -= dt;
      b.traveledDist += b.speed * dt;

      if (b.lifetime <= 0 || b.traveledDist >= b.maxDist) {
        this._killBullet(i);
        continue;
      }

      b.group.position.addScaledVector(b.dir, b.speed * dt);

      b.history.unshift(b.group.position.clone());
      if (b.history.length > 6) b.history.pop();

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

    // ── Impact particles / lights ─────────────────────────────────────
    for (let i = this._impacts.length - 1; i >= 0; i--) {
      const obj = this._impacts[i];
      obj.ttl -= dt;
      if (obj.vel) {
        obj.mesh.position.addScaledVector(obj.vel, dt);
        obj.vel.y -= 10 * dt;
        obj.mesh.material.opacity = Math.max(0, obj.ttl / obj.maxTtl);
      } else {
        obj.mesh.intensity = Math.max(0, (obj.ttl / obj.maxTtl) * (obj.mesh.userData.initIntensity || 10));
      }
      if (obj.ttl <= 0) {
        this._scene.remove(obj.mesh);
        this._impacts.splice(i, 1);
      }
    }
  }

  _killBullet(i) {
    const b = this._bullets[i];
    this._scene.remove(b.group);
    this._scene.remove(b.trail);
    b.cylGeo.dispose();
    b.trail.geometry.dispose();
    this._bullets.splice(i, 1);
  }
}
