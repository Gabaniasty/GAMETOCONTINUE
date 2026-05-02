export class BulletSystem {
  constructor(scene) {
    this._scene           = scene;
    this._bullets         = [];
    this._impacts         = [];
    this.collidableMeshes = [];
    this._playerHitboxes  = new Map(); // playerId → { head: Mesh, body: Mesh }
  }

  setCollidableMeshes(meshes) { this.collidableMeshes = meshes; }

  // ── Keep dual hitboxes in sync with remote players ────────────────────
  updatePlayerHitboxes(remotePlayers) {
    const seen = new Set();
    for (const p of remotePlayers) {
      if (!p.id) continue;
      seen.add(p.id);
      let pair = this._playerHitboxes.get(p.id);
      if (!pair) {
        // HEAD — small sphere at eye level
        const headGeo = new THREE.SphereGeometry(0.25, 6, 6);
        const headMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
        const head    = new THREE.Mesh(headGeo, headMat);
        head.userData.isHitbox = true;
        head.userData.hitZone  = 'head';
        head.userData.playerId       = p.id;
        this._scene.add(head);

        // BODY — box covering torso + legs
        const bodyGeo = new THREE.BoxGeometry(0.65, 1.4, 0.55);
        const bodyMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
        const body    = new THREE.Mesh(bodyGeo, bodyMat);
        body.userData.isHitbox = true;
        body.userData.hitZone  = 'body';
        body.userData.playerId       = p.id;
        this._scene.add(body);

        pair = { head, body };
        this._playerHitboxes.set(p.id, pair);
      }

      // p.y is camera/eye height (~1.65 above floor when standing)
      const eyeY = p.y || 1.65;
      pair.head.position.set(p.x, eyeY - 0.10, p.z); // ~1.55 above floor
      pair.body.position.set(p.x, eyeY - 0.95, p.z); // ~0.70 above floor
      pair.head.visible = !p.dead;
      pair.body.visible = !p.dead;
    }
    // Remove disconnected players
    for (const [id, pair] of this._playerHitboxes) {
      if (!seen.has(id)) {
        this._scene.remove(pair.head);
        this._scene.remove(pair.body);
        this._playerHitboxes.delete(id);
      }
    }
  }

  // Flat list of all hitbox meshes for raycasting
  _getHitboxMeshes() {
    const out = [];
    for (const pair of this._playerHitboxes.values()) {
      out.push(pair.head, pair.body);
    }
    return out;
  }

  // ── Main shoot entry-point ────────────────────────────────────────────
  // Returns: { type: 'wall'|'player'|'miss', playerId?, hitZone?, distance?, hitPoint? }
  shoot(origin, direction, camera, barrelPos = null) {
    const originVec = new THREE.Vector3(origin.x, origin.y, origin.z);
    const dirVec    = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();

    const spawnFrom  = barrelPos || originVec;
    const wallTargets   = this.collidableMeshes;
    const playerTargets = this._getHitboxMeshes().filter(m => m.visible);
    const allTargets    = [...wallTargets, ...playerTargets];

    if (allTargets.length === 0) {
      const endPt = originVec.clone().addScaledVector(dirVec, 300);
      this._spawnTracer(spawnFrom, endPt);
      return { type: 'miss' };
    }

    const raycaster = new THREE.Raycaster(originVec.clone(), dirVec.clone(), 0, 300);
    const hits      = raycaster.intersectObjects(allTargets, false);

    if (hits.length === 0) {
      const endPt = originVec.clone().addScaledVector(dirVec, 300);
      this._spawnTracer(spawnFrom, endPt);
      return { type: 'miss' };
    }

    const first = hits[0];

    if (first.object.userData.isMapGeometry) {
      this._spawnTracer(spawnFrom, first.point);
      this._spawnWallImpact(first.point);
      return { type: 'wall', point: first.point };
    }

    if (first.object.userData.isHitbox) {
      this._spawnTracer(spawnFrom, first.point);
      return {
        type:     'player',
        playerId: first.object.userData.playerId,
        hitZone:  first.object.userData.hitZone,
        distance: first.distance,
        hitPoint: first.point,
      };
    }

    const endPt = originVec.clone().addScaledVector(dirVec, 300);
    this._spawnTracer(spawnFrom, endPt);
    return { type: 'miss' };
  }

  // ── Instant 3-layer line tracer (fades in 120 ms) ─────────────────────
  _spawnTracer(from, to) {
    const a = from instanceof THREE.Vector3 ? from : new THREE.Vector3(from.x, from.y, from.z);
    const b = to   instanceof THREE.Vector3 ? to   : new THREE.Vector3(to.x,   to.y,   to.z);

    const makeGeo = () => {
      const geo = new THREE.BufferGeometry();
      const arr = new Float32Array([a.x, a.y, a.z, b.x, b.y, b.z]);
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      return geo;
    };

    const core  = new THREE.Line(makeGeo(),
      new THREE.LineBasicMaterial({ color: 0xffee88, transparent: true, opacity: 1 }));
    const mid   = new THREE.Line(makeGeo(),
      new THREE.LineBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.55 }));
    const outer = new THREE.Line(makeGeo(),
      new THREE.LineBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.22 }));

    this._scene.add(core);
    this._scene.add(mid);
    this._scene.add(outer);

    this._bullets.push({
      lines:       [core, mid, outer],
      geos:        [core.geometry, mid.geometry, outer.geometry],
      lifetime:    0.12,
      maxLifetime: 0.12,
    });
  }

  // ── Wall spark impact — 8 particles + point light ─────────────────────
  _spawnWallImpact(point) {
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true })
      );
      mesh.position.copy(point);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        Math.random() * 3 + 0.5,
        (Math.random() - 0.5) * 5
      );
      this._scene.add(mesh);
      this._impacts.push({ mesh, vel, ttl: 0.30, maxTtl: 0.30 });
    }
    const light = new THREE.PointLight(0xffaa33, 6, 2);
    light.userData.initIntensity = 6;
    light.position.copy(point);
    this._scene.add(light);
    this._impacts.push({ mesh: light, vel: null, ttl: 0.12, maxTtl: 0.12 });
  }

  // ── Player hit burst — 12 particles + point light ─────────────────────
  onHit(position, isHeadshot = false) {
    const pos   = new THREE.Vector3(position.x, position.y, position.z);
    const color = isHeadshot ? 0xffdd00 : 0xff2d78;
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 4, 4),
        new THREE.MeshBasicMaterial({ color, transparent: true })
      );
      mesh.position.copy(pos);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        Math.random() * 6 + 1,
        (Math.random() - 0.5) * 10
      );
      this._scene.add(mesh);
      this._impacts.push({ mesh, vel, ttl: 0.40, maxTtl: 0.40 });
    }
    const lightColor = isHeadshot ? 0xffdd00 : 0xff2d78;
    const light = new THREE.PointLight(lightColor, 12, 4);
    light.userData.initIntensity = 12;
    light.position.copy(pos);
    this._scene.add(light);
    this._impacts.push({ mesh: light, vel: null, ttl: 0.15, maxTtl: 0.15 });
  }

  update(dt) {
    // ── Tracers ───────────────────────────────────────────────────────
    for (let i = this._bullets.length - 1; i >= 0; i--) {
      const b = this._bullets[i];
      b.lifetime -= dt;
      const t = Math.max(0, b.lifetime / b.maxLifetime);
      b.lines[0].material.opacity = t;
      b.lines[1].material.opacity = t * 0.55;
      if (b.lines[2]) b.lines[2].material.opacity = t * 0.22;
      if (b.lifetime <= 0) {
        b.lines.forEach(l => { this._scene.remove(l); l.material.dispose(); });
        b.geos.forEach(g => g.dispose());
        this._bullets.splice(i, 1);
      }
    }

    // ── Impact particles / lights ─────────────────────────────────────
    for (let i = this._impacts.length - 1; i >= 0; i--) {
      const obj = this._impacts[i];
      obj.ttl -= dt;
      if (obj.vel) {
        obj.mesh.position.addScaledVector(obj.vel, dt);
        obj.vel.y -= 12 * dt;
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
}
